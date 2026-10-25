"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import { tripAct } from "@/app/(tenant)/sites/[dealer]/delivery/t/actions"
import { LiveMap, type MapMarker } from "@/components/restaurant/live-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { openLiveSocket, type LiveSocket } from "@/lib/restaurant/live-socket"
import { formatRupees } from "@/lib/restaurant/menu"
import { ago } from "@/lib/restaurant/tracking"

type Trip = {
  code: string
  customerName: string
  customerPhone: string
  address: string
  pincode: string
  note: string
  items: string
  total: number
  /** Cash still to collect from the guest. */
  cash: boolean
  status: string
  lat: number | null
  lng: number | null
}

const SEND_EVERY_MS = 5000
// Over the WebSocket the position goes out every few seconds. Plain HTTP still runs now and then: it refreshes the
// route and ETA, checks the delivery is still open, and is the fallback whenever the socket is down.
const HTTP_EVERY_MS = 30_000
const STATUS_TEXT: Record<string, string> = {
  new: "Waiting for the restaurant to confirm",
  confirmed: "Ready to collect",
  preparing: "Being prepared",
  ready: "Ready to collect",
  out_for_delivery: "On the way",
  completed: "Delivered",
}

/** The rider's whole job in one screen: where to go, what to carry, what to collect, and sharing their live location. */
export function RiderTrip({
  token,
  order,
  restaurant,
  riderName,
}: {
  token: string
  order: Trip
  restaurant: { name: string; phone: string | null; lat: number | null; lng: number | null }
  riderName: string
}) {
  const [status, setStatus] = useState(order.status)
  const [pending, start] = useTransition()
  const [sharing, setSharing] = useState(false)
  const [mine, setMine] = useState<{ lat: number; lng: number; at: number; accuracy: number | null } | null>(null)
  const [lastSent, setLastSent] = useState<number | null>(null)
  const [road, setRoad] = useState<{ points: [number, number][]; km: number; minutes: number } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [, tick] = useState(0)
  const watch = useRef<number | null>(null)
  const wake = useRef<{ release(): Promise<void> } | null>(null)
  const latest = useRef<GeolocationPosition | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const socket = useRef<LiveSocket | null>(null)
  const lastHttp = useRef(0)

  const stop = useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
    watch.current = null
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    latest.current = null
    socket.current?.close()
    socket.current = null
    void wake.current?.release().catch(() => {})
    wake.current = null
    setSharing(false)
  }, [])

  // The newest position from the phone. A sender loop (below) posts it, so a position that arrives inside the
  // throttle window is not lost, and a rider standing still (the browser fires nothing) keeps showing as live.

  const send = useCallback(async () => {
    const p = latest.current
    if (!p) return
    const c = p.coords
    const viaSocket = socket.current?.send(JSON.stringify([Math.round(c.latitude * 1e6) / 1e6, Math.round(c.longitude * 1e6) / 1e6, c.heading != null ? Math.round(c.heading) : null, c.accuracy != null ? Math.round(c.accuracy) : null])) ?? false
    if (viaSocket && Date.now() - lastHttp.current < HTTP_EVERY_MS) {
      setLastSent(Date.now())
      setProblem(null)
      return
    }
    lastHttp.current = Date.now()
    try {
      const res = await fetch("/api/t/rider-location", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null, heading: p.coords.heading ?? null }),
      })
      if (res.ok) {
        setLastSent(Date.now())
        setProblem(null)
        const data = (await res.json().catch(() => null)) as { route?: [number, number][] | null; km?: number | null; minutes?: number | null } | null
        setRoad(data?.route && data.km != null && data.minutes != null ? { points: data.route, km: data.km, minutes: data.minutes } : null)
      } else if (res.status === 409 || res.status === 404) {
        // The order is no longer in progress (delivered, cancelled, or the link was replaced).
        stop()
        setProblem(res.status === 404 ? "This link is no longer active." : null)
      } else if (res.status !== 429) {
        setProblem("Could not send your location. Check your connection.")
      }
    } catch {
      setProblem("No connection. Your location will send again when it returns.")
    }
  }, [token, stop])

  const post = useCallback(
    (p: GeolocationPosition) => {
      const first = !latest.current
      latest.current = p
      setMine({ lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now(), accuracy: p.coords.accuracy ?? null })
      if (first) void send()
    },
    [send],
  )

  const startSharing = useCallback(() => {
    if (!navigator.geolocation) return void setProblem("This phone cannot share its location.")
    if (watch.current !== null) return
    setProblem(null)
    watch.current = navigator.geolocation.watchPosition(
      (p) => void post(p),
      (e) => {
        setProblem(e.code === 1 ? "Location is blocked. Allow location for this page in your browser settings, then tap Start sharing again." : "Could not find your location yet. Move to open sky and wait a moment.")
        if (e.code === 1) stop()
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 },
    )
    setSharing(true)
    socket.current = openLiveSocket({
      getTicket: async () => {
        const res = await fetch("/api/t/ws-ticket", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
        const data = (await res.json().catch(() => null)) as { live?: boolean; url?: string; ticket?: string } | null
        return data?.live && data.url && data.ticket ? { url: data.url, ticket: data.ticket } : null
      },
      shouldStop: () => watch.current === null,
    })
    timer.current = setInterval(() => void send(), SEND_EVERY_MS)
    // Keep the screen on, because a locked phone stops reporting its position.
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }
    void nav.wakeLock?.request("screen").then((l) => (wake.current = l)).catch(() => {})
  }, [post, send, stop, token])

  useEffect(() => stop, [stop])
  // Re-draw "sent 3 s ago" every few seconds.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 3000)
    return () => clearInterval(t)
  }, [])
  // Re-ask for the wake lock when the page comes back to the front (the browser drops it when hidden).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && sharing && !wake.current) {
        const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }
        void nav.wakeLock?.request("screen").then((l) => (wake.current = l)).catch(() => {})
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [sharing])

  function act(kind: "pickup" | "delivered", cash: boolean) {
    // Ask for the location now, inside the tap, because some phones only allow that on a tap.
    if (kind === "pickup") startSharing()
    start(async () => {
      const res = await tripAct(token, kind, cash)
      if (!res.ok) return void toast.error(res.error)
      setStatus(res.status)
      if (res.status === "completed") {
        stop()
        toast.success("Delivery completed. Thank you!")
      } else toast.success("On the way. Drive safe!")
    })
  }

  const destination = order.lat !== null && order.lng !== null ? { lat: order.lat, lng: order.lng } : null
  const markers: MapMarker[] = [
    ...(destination ? [{ id: "guest", kind: "guest" as const, lat: destination.lat, lng: destination.lng, label: `Deliver to ${order.customerName}` }] : []),
    ...(restaurant.lat !== null && restaurant.lng !== null ? [{ id: "restaurant", kind: "restaurant" as const, lat: restaurant.lat, lng: restaurant.lng, label: restaurant.name }] : []),
    ...(mine ? [{ id: "me", kind: "rider" as const, lat: mine.lat, lng: mine.lng, label: "You" }] : []),
  ]
  const navUrl = destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.address} ${order.pincode}`)}`
  const done = status === "completed"
  const canShare = !done && ["confirmed", "preparing", "ready", "out_for_delivery"].includes(status)

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{restaurant.name} · Hi {riderName.split(" ")[0]}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Order {order.code}</h1>
        </div>
        <Badge variant={status === "out_for_delivery" ? "default" : done ? "outline" : "secondary"}>{STATUS_TEXT[status] ?? status}</Badge>
      </div>

      {markers.length > 0 ? <LiveMap markers={markers} routes={road ? [{ id: "route", points: road.points }] : []} label="Map of your delivery" className="h-64" /> : null}

      <section className="grid gap-3 rounded-2xl border bg-card p-4">
        <div>
          <p className="font-semibold">{order.customerName}</p>
          <p className="text-sm">{order.address}{order.pincode ? ` · ${order.pincode}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={navUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">Navigate</a>
          <a href={`tel:${order.customerPhone}`} className="inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium">Call {order.customerPhone}</a>
          {restaurant.phone ? <a href={`tel:${restaurant.phone}`} className="inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium">Call restaurant</a> : null}
        </div>
        <p className="text-sm text-muted-foreground">{order.items}</p>
        {order.note ? <p className="rounded-md bg-muted p-2 text-sm">Note: {order.note}</p> : null}
        <p className="text-sm font-medium">{order.cash ? `Collect ${formatRupees(order.total)} in cash` : "Already paid. Nothing to collect."}</p>
      </section>

      {road ? <p role="status" className="text-sm font-medium">{road.km} km by road · about {road.minutes} min to {order.customerName}</p> : null}

      {canShare ? (
        <section className="grid gap-2 rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Share my live location</p>
              <p className="text-xs text-muted-foreground">The guest sees you on the map while you are on the way. Keep this page open.</p>
            </div>
            <Button type="button" variant={sharing ? "outline" : "default"} size="sm" onClick={sharing ? stop : startSharing}>{sharing ? "Stop" : "Start sharing"}</Button>
          </div>
          {sharing ? (
            <p className="text-xs text-success" role="status">
              {lastSent ? `Sharing · sent ${ago(lastSent)}` : "Finding your location…"}
              {mine?.accuracy ? ` · accurate to about ${Math.round(mine.accuracy)} m` : ""}
            </p>
          ) : null}
          {problem ? <p role="alert" className="text-xs text-destructive">{problem}</p> : null}
        </section>
      ) : null}

      {status === "new" ? <p className="rounded-xl border p-4 text-sm text-muted-foreground">The restaurant has not confirmed this order yet. This page updates when you open it again.</p> : null}

      {["confirmed", "preparing", "ready"].includes(status) ? (
        <Button size="lg" disabled={pending} onClick={() => act("pickup", false)}>I have picked up the order</Button>
      ) : null}
      {status === "out_for_delivery" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button size="lg" disabled={pending} onClick={() => act("delivered", order.cash)}>{order.cash ? "Delivered, cash collected" : "Delivered"}</Button>
          {order.cash ? <Button size="lg" variant="outline" disabled={pending} onClick={() => act("delivered", false)}>Delivered, not paid</Button> : null}
        </div>
      ) : null}
      {done ? <p className="rounded-xl border p-4 text-center font-medium">Delivered. Thank you!</p> : null}
    </div>
  )
}
