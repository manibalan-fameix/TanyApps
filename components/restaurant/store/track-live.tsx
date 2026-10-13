"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { openLiveSocket } from "@/lib/restaurant/live-socket"
import { LiveMap, type MapMarker } from "@/components/restaurant/live-map"
import { ago } from "@/lib/restaurant/tracking"

type Live = {
  status: string
  rider: { name: string; phone: string } | null
  location: { lat: number; lng: number; at: number; fresh: boolean } | null
  destination: { lat: number; lng: number } | null
  restaurant: { lat: number; lng: number } | null
  planned: boolean
  route: [number, number][] | null
  distanceKm: number | null
  etaMinutes: number | null
}

// Positions arrive over a WebSocket when the deployment has one; the page then polls only for route, ETA and status.
const POLL_MS = 4000
const POLL_WITH_SOCKET_MS = 15_000
const FRESH_MS = 45_000

/** Live view of the delivery for the guest: rider on the map, distance, ETA, and a call button. Re-renders the page when the status changes. */
export function TrackLive({ code, status, initialRider }: { code: string; status: string; initialRider: { name: string; phone: string } | null }) {
  const router = useRouter()
  const [live, setLive] = useState<Live | null>(null)
  const [pushed, setPushed] = useState<{ lat: number; lng: number; heading: number | null; at: number; fresh: boolean } | null>(null)
  const [socketOpen, setSocketOpen] = useState(false)
  const [, tick] = useState(0)

  useEffect(() => {
    let stopped = false
    let known = status
    async function load() {
      try {
        const res = await fetch(`/api/t/order-location?code=${encodeURIComponent(code)}`, { cache: "no-store" })
        if (!res.ok || stopped) return
        const data = (await res.json()) as Live
        setLive(data)
        if (data.status !== known) {
          known = data.status
          router.refresh()
        }
      } catch {
        // Keep the last known position; the next poll tries again.
      }
    }
    void load()
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, socketOpen ? POLL_WITH_SOCKET_MS : POLL_MS)
    const r = setInterval(() => {
      tick((n) => n + 1)
      setPushed((p) => (p && p.fresh && Date.now() - p.at > FRESH_MS ? { ...p, fresh: false } : p))
    }, 5000)
    return () => {
      stopped = true
      clearInterval(t)
      clearInterval(r)
    }
  }, [code, status, router, socketOpen])

  useEffect(() => {
    const live = openLiveSocket({
      getTicket: async () => {
        const res = await fetch(`/api/t/ws-ticket?code=${encodeURIComponent(code)}`, { cache: "no-store" })
        const data = (await res.json().catch(() => null)) as { live?: boolean; url?: string; ticket?: string } | null
        return data?.live && data.url && data.ticket ? { url: data.url, ticket: data.ticket } : null
      },
      onState: setSocketOpen,
      onMessage: (text) => {
        try {
          const [lat, lng, heading, at] = JSON.parse(text) as [number, number, number | null, number]
          if (typeof lat === "number" && typeof lng === "number") setPushed((old) => (old && old.at > at ? old : { lat, lng, heading, at, fresh: true }))
        } catch {
          // Ignore anything that is not a position.
        }
      },
    })
    return () => live.close()
  }, [code])

  const rider = live?.rider ?? initialRider
  // The newest of what the socket pushed and what the last poll returned.
  const polled = live?.location ?? null
  const loc = pushed && (!polled || pushed.at >= polled.at) ? pushed : polled
  const dest = live?.destination ?? null
  const rest = live?.restaurant ?? null
  const markers: MapMarker[] = [
    ...(rest && !loc ? [{ id: "restaurant", kind: "restaurant" as const, lat: rest.lat, lng: rest.lng, label: "Restaurant" }] : []),
    ...(dest ? [{ id: "guest", kind: "guest" as const, lat: dest.lat, lng: dest.lng, label: "Your address" }] : []),
    ...(loc ? [{ id: "rider", kind: "rider" as const, lat: loc.lat, lng: loc.lng, label: rider?.name ?? "Your rider", stale: !loc.fresh }] : []),
  ]

  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-4" aria-label="Live delivery">
      {rider ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <p>
            <span className="font-medium">{rider.name}</span> is bringing your order
          </p>
          <a href={`tel:${rider.phone}`} className="inline-flex h-8 shrink-0 items-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground">Call {rider.name.split(" ")[0]}</a>
        </div>
      ) : null}
      {markers.length > 0 ? (
        <>
          <LiveMap markers={markers} routes={live?.route ? [{ id: "route", points: live.route, stale: !loc || !loc.fresh }] : []} focusId={loc ? "rider" : null} label="Live map of your delivery" className="h-64" />
          {loc ? (
            <p role="status" className="text-sm">
              {live?.etaMinutes != null ? <span className="font-medium">About {live.etaMinutes} min away</span> : null}
              {live?.distanceKm != null ? ` · ${live.distanceKm.toFixed(1)} km` : ""}
              <span className="text-muted-foreground"> · {loc.fresh ? `updated ${ago(loc.at)}` : `last seen ${ago(loc.at)}`}</span>
            </p>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              Your rider has left the restaurant.{live?.etaMinutes != null ? ` Expected in about ${live.etaMinutes} min.` : ""} The rider&apos;s live position appears here as soon as they start sharing it.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Your rider is on the way. The map appears here shortly.</p>
      )}
    </section>
  )
}
