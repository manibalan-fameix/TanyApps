"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { LiveMap, type MapMarker } from "@/components/restaurant/live-map"
import { fetchLiveDeliveries, type LiveDelivery } from "@/lib/restaurant/admin-actions"
import { ago } from "@/lib/restaurant/tracking"

type Board = Extract<Awaited<ReturnType<typeof fetchLiveDeliveries>>, { ok: true }>

/** Every rider on one map, refreshed every few seconds. Tap a delivery to centre the map on it. */
export function LiveBoard({ initial }: { initial: Board }) {
  const [board, setBoard] = useState(initial)
  const [focus, setFocus] = useState<string | null>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return
      void fetchLiveDeliveries().then((r) => r.ok && setBoard(r))
    }, 5000)
    const r = setInterval(() => tick((n) => n + 1), 5000)
    return () => {
      clearInterval(t)
      clearInterval(r)
    }
  }, [])

  const markers: MapMarker[] = [
    ...(board.restaurant ? [{ id: "restaurant", kind: "restaurant" as const, lat: board.restaurant.lat, lng: board.restaurant.lng, label: board.restaurant.name }] : []),
    ...board.deliveries.flatMap((d: LiveDelivery): MapMarker[] => [
      ...(d.destination ? [{ id: `g-${d.id}`, kind: "guest" as const, lat: d.destination.lat, lng: d.destination.lng, label: `${d.code} · ${d.customer}` }] : []),
      ...(d.fix ? [{ id: `r-${d.id}`, kind: "rider" as const, lat: d.fix.lat, lng: d.fix.lng, label: `${d.rider?.name ?? "Rider"} · ${d.code}`, stale: !d.fix.fresh }] : []),
    ]),
  ]
  const routes = board.deliveries.flatMap((d) => (d.route ? [{ id: `route-${d.id}`, points: d.route, stale: !d.fix?.fresh }] : []))
  const tracked = board.deliveries.filter((d) => d.fix)

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
      <LiveMap markers={markers} routes={routes} focusId={focus} label="Map of live deliveries" className="h-[420px] rounded-xl" />
      <div className="grid content-start gap-2">
        {tracked.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">No rider is sharing a live location yet. Send the rider their link from the order page.</p>
        ) : (
          tracked.map((d) => (
            <button key={d.id} type="button" onClick={() => setFocus(`r-${d.id}`)} className="rounded-xl border bg-card p-3 text-left text-sm hover:bg-muted/50">
              <p className="font-medium">{d.rider?.name ?? "Rider"} · {d.code}</p>
              <p className="text-xs text-muted-foreground">
                {d.etaMinutes != null ? `About ${d.etaMinutes} min · ${d.distanceKm} km to ${d.customer}` : `To ${d.customer}`} · {d.fix?.fresh ? "live" : "last seen"} {d.fix ? ago(d.fix.at) : ""}
              </p>
              <Link href={`/orders/${d.id}`} className="text-xs underline" onClick={(e) => e.stopPropagation()}>Open order</Link>
            </button>
          ))
        )}
        <p className="text-xs text-muted-foreground">Positions stored in {board.store === "cloudflare" ? "Cloudflare" : "the database (local)"}.</p>
      </div>
    </div>
  )
}
