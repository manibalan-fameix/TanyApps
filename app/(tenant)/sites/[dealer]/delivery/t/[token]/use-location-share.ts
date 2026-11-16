"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { openLiveSocket, type LiveSocket } from "@/lib/restaurant/live-socket"

export type Mine = { lat: number; lng: number; at: number; accuracy: number | null; heading: number | null; speed: number | null }
export type Road = { points: [number, number][]; km: number; minutes: number }

const SEND_EVERY_MS = 5000
// Over the WebSocket the position goes out every few seconds. Plain HTTP still runs now and then: it refreshes the
// route and ETA, checks the delivery is still open, and is the fallback whenever the socket is down.
const HTTP_EVERY_MS = 30_000

type WakeNav = Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }

/**
 * Shares the rider's phone position for one delivery (through its private token) and keeps the road route and ETA the
 * server sends back. Used by the trip screen and the full-screen GPS screen, so both behave the same.
 */
export function useLocationShare(token: string) {
  const [sharing, setSharing] = useState(false)
  const [mine, setMine] = useState<Mine | null>(null)
  const [lastSent, setLastSent] = useState<number | null>(null)
  const [road, setRoad] = useState<Road | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
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
        body: JSON.stringify({ token, lat: c.latitude, lng: c.longitude, accuracy: c.accuracy ?? null, heading: c.heading ?? null }),
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
      setMine({ lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now(), accuracy: p.coords.accuracy ?? null, heading: p.coords.heading ?? null, speed: p.coords.speed ?? null })
      if (first) void send()
    },
    [send],
  )

  const start = useCallback(() => {
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
    void (navigator as WakeNav).wakeLock?.request("screen").then((l) => (wake.current = l)).catch(() => {})
  }, [post, send, stop, token])

  useEffect(() => stop, [stop])
  // Re-ask for the wake lock when the page comes back to the front (the browser drops it when hidden).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && sharing && !wake.current) {
        void (navigator as WakeNav).wakeLock?.request("screen").then((l) => (wake.current = l)).catch(() => {})
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [sharing])

  return { sharing, mine, lastSent, road, problem, start, stop }
}
