"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import { tripAct } from "@/app/(tenant)/sites/[dealer]/delivery/t/actions"
import { useLocationShare } from "@/app/(tenant)/sites/[dealer]/delivery/t/[token]/use-location-share"
import { LiveMap, type MapMarker } from "@/components/restaurant/live-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  const { sharing, mine, lastSent, road, problem, start: startSharing, stop } = useLocationShare(token)
  const [, tick] = useState(0)
  // Re-draw "sent 3 s ago" every few seconds.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 3000)
    return () => clearInterval(t)
  }, [])

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
          <a href={`/delivery/t/${token}/gps`} className="inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium">GPS screen</a>
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
