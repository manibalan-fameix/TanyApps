"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft01Icon, GpsSignal01Icon, Navigation03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useLocationShare } from "@/app/(tenant)/sites/[dealer]/delivery/t/[token]/use-location-share"
import { LiveMap, type MapMarker } from "@/components/restaurant/live-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ago } from "@/lib/restaurant/tracking"

type Props = {
  token: string
  restaurant: { name: string; lat: number | null; lng: number | null }
  order: { code: string; customerName: string; address: string; pincode: string; status: string; lat: number | null; lng: number | null }
}

const ACTIVE = ["confirmed", "preparing", "ready", "out_for_delivery"]
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

/**
 * The delivery partner's full-screen GPS view: a big live map with their own position, the road route and ETA to the
 * guest, the accuracy of the GPS fix, and one-tap hand-off to Google Maps turn-by-turn. Sharing runs the same way as on
 * the trip screen (the hook is shared), so the guest sees the rider move while this screen is open.
 */
export function RiderGps({ token, restaurant, order }: Props) {
  const { sharing, mine, lastSent, road, problem, start, stop } = useLocationShare(token)
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 3000)
    return () => clearInterval(t)
  }, [])

  const destination = order.lat !== null && order.lng !== null ? { lat: order.lat, lng: order.lng } : null
  const markers: MapMarker[] = [
    ...(destination ? [{ id: "guest", kind: "guest" as const, lat: destination.lat, lng: destination.lng, label: `Deliver to ${order.customerName}` }] : []),
    ...(restaurant.lat !== null && restaurant.lng !== null ? [{ id: "restaurant", kind: "restaurant" as const, lat: restaurant.lat, lng: restaurant.lng, label: restaurant.name }] : []),
    ...(mine ? [{ id: "me", kind: "rider" as const, lat: mine.lat, lng: mine.lng, label: "You" }] : []),
  ]
  const navUrl = destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=two-wheeler`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.address} ${order.pincode}`)}`
  const open = ACTIVE.includes(order.status)
  const heading = mine?.heading != null && !Number.isNaN(mine.heading) ? COMPASS[Math.round(mine.heading / 45) % 8] : null
  const kmh = mine?.speed != null && mine.speed >= 0 ? Math.round(mine.speed * 3.6) : null
  const weak = mine?.accuracy != null && mine.accuracy > 50

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="flex items-center gap-3 border-b px-3 py-2">
        <Button variant="ghost" size="icon" nativeButton={false} render={<Link href={`/delivery/t/${token}`} aria-label="Back to delivery" />}>
          <HugeiconsIcon icon={ArrowLeft01Icon} />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Order {order.code} · {order.customerName}</p>
          <p className="truncate text-xs text-muted-foreground">{order.address}{order.pincode ? ` · ${order.pincode}` : ""}</p>
        </div>
        <Badge variant={sharing ? "default" : "secondary"}>{sharing ? "Live" : "Off"}</Badge>
      </header>

      <div className="relative min-h-0 flex-1">
        <LiveMap markers={markers} routes={road ? [{ id: "route", points: road.points }] : []} focusId={mine ? "me" : null} label="Live GPS map of your delivery" className="h-full rounded-none border-0" />
      </div>

      <section className="grid gap-3 border-t bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Distance" value={road ? `${road.km} km` : "—"} />
          <Stat label="ETA" value={road ? `${road.minutes} min` : "—"} />
          <Stat label="Speed" value={kmh !== null ? `${kmh} km/h${heading ? ` ${heading}` : ""}` : "—"} />
        </div>

        <p role="status" className={weak ? "flex items-center gap-1.5 text-xs text-destructive" : "flex items-center gap-1.5 text-xs text-muted-foreground"}>
          <HugeiconsIcon icon={GpsSignal01Icon} size={14} />
          {!sharing
            ? "GPS is off. Start sharing to show the guest where you are."
            : !mine
              ? "Finding your location…"
              : `GPS ${weak ? "signal weak" : "signal good"}${mine.accuracy ? ` · accurate to about ${Math.round(mine.accuracy)} m` : ""}${lastSent ? ` · sent ${ago(lastSent)}` : ""}`}
        </p>
        {problem ? <p role="alert" className="text-xs text-destructive">{problem}</p> : null}

        {!open ? (
          <p className="rounded-xl border p-3 text-center text-sm text-muted-foreground">{order.status === "completed" ? "This delivery is finished. Thank you!" : "This delivery is not active yet."}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" variant={sharing ? "outline" : "default"} onClick={sharing ? stop : start}>{sharing ? "Stop sharing" : "Start sharing"}</Button>
            <Button size="lg" nativeButton={false} render={<a href={navUrl} target="_blank" rel="noreferrer" />}>
              <HugeiconsIcon icon={Navigation03Icon} data-icon="inline-start" />
              Navigate
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted px-2 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-semibold tabular-nums">{value}</p>
    </div>
  )
}
