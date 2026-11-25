"use client"

import { useEffect, useState } from "react"
import { Clock01Icon, RestaurantTableIcon, Scooter01Icon, Store01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { DeliveryStrip } from "@/components/restaurant/store/app-home"
import { useGuestLocation } from "@/components/restaurant/store/location"
import { type Fulfilment, FULFILMENT_LABEL } from "@/lib/restaurant/settings"
import { distanceKm } from "@/lib/restaurant/service-area"
import { etaMinutes } from "@/lib/restaurant/tracking"
import { cn } from "@/lib/utils"

const MODE_ICON = { delivery: Scooter01Icon, pickup: Store01Icon, dine_in: RestaurantTableIcon } as const

/**
 * The top of the cart and the checkout, built like the home screen's header: the Delivery / Pickup tabs, the brand band with
 * the expected date and time tucked behind them, and the page's rounded top laid over the band's foot. It stays pinned
 * while the page scrolls under it, below the fixed bar (phone) or the website header (tablet and up).
 */
export function OrderBand({
  options,
  fulfilment,
  onPick,
  origin,
  zoneEta,
  error,
}: {
  options: Fulfilment[]
  fulfilment: Fulfilment
  onPick: (m: Fulfilment) => void
  origin: { lat: number; lng: number } | null
  /** Minutes the delivery zone for the guest's pincode promises, when there is one. */
  zoneEta?: number | null
  error?: string
}) {
  const geo = useGuestLocation()
  // The clock is read after the page loads, so the server-rendered page and the first browser render agree.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date())
  }, [])
  // When it should arrive: the zone's estimate, else the kitchen time plus the ride from the shop, else a standard half hour.
  const point = geo.location && geo.location.lat !== null && geo.location.lng !== null ? { lat: geo.location.lat, lng: geo.location.lng } : null
  const lo = fulfilment === "delivery" ? (zoneEta ?? (origin && point ? etaMinutes(distanceKm(origin, point)) + 10 : 30)) : 10
  const when = (() => {
    if (!now) return null
    const from = new Date(now.getTime() + lo * 60_000)
    const to = new Date(from.getTime() + 10 * 60_000)
    const time = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
    const date = from.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
    return { date, range: `${time(from)} - ${time(to)}` }
  })()

  return (
    <div className="sticky top-14 z-40 -mx-3 -mt-3 -mb-[calc(0.75rem+2px)] sm:-mx-6 md:top-0">
      {options.length > 1 ? (
        <div className="relative z-10 rounded-b-3xl border-x border-b border-foreground/10 bg-background px-4 pt-3 pb-0 shadow-sm">
          <div role="radiogroup" aria-label="Order type" className="-mx-4 flex px-4">
            {options.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={fulfilment === m}
                onClick={() => onPick(m)}
                style={{ "--duo": `var(--logo-${m === "pickup" ? "tanyeats" : "tanymotos"}-fg)` } as React.CSSProperties}
                className="group relative isolate flex min-w-0 flex-1 flex-col items-center gap-1 pt-1 pb-4 text-xs md:text-sm font-medium text-muted-foreground transition-colors before:absolute before:-top-2 before:bottom-0 before:left-1/2 before:w-24 before:-translate-x-1/2 before:-z-10 before:rounded-t-2xl before:bg-linear-to-t before:from-transparent before:to-[var(--duo)] before:opacity-0 aria-checked:before:opacity-25 aria-checked:font-semibold aria-checked:text-foreground focus-visible:outline-none"
              >
                <HugeiconsIcon
                  icon={MODE_ICON[m]}
                  strokeWidth={1.75}
                  className="size-6 shrink-0 group-aria-checked:[&_path]:fill-[var(--duo)]"
                  style={{ color: `var(--logo-${m === "pickup" ? "tanyeats" : "tanymotos"})`, "--duo": `var(--logo-${m === "pickup" ? "tanyeats" : "tanymotos"}-fg)` } as React.CSSProperties}
                />
                {FULFILMENT_LABEL[m]}
                <span aria-hidden className="absolute bottom-0 z-10 h-[3px] w-24 rounded-full bg-foreground opacity-0 transition-opacity group-aria-checked:opacity-100" />
              </button>
            ))}
          </div>
          {error ? <p role="alert" className="pb-3 text-center text-sm md:text-base text-destructive">{error}</p> : null}
        </div>
      ) : null}

      <div className={cn("relative z-0 h-[4.8rem] overflow-hidden", options.length > 1 && "-mt-6")}>
        <DeliveryStrip origin={origin} solid={false} closed={null} pickup={fulfilment === "pickup"} restaurant="" directionsUrl={null}>
          <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-4 shrink-0" />
          {when ? (
            <span className="min-w-0 truncate">
              <span className="opacity-80">{fulfilment === "delivery" ? "Delivery" : fulfilment === "pickup" ? "Ready for pickup" : "Ready"} </span>
              <span className="font-medium">{when.date}</span>
              <span aria-hidden className="mx-2 inline-block h-4 w-px translate-y-0.5 bg-primary-foreground/40" />
              <span className="font-bold">{when.range}</span>
            </span>
          ) : (
            <span className="opacity-80">Working out your delivery time…</span>
          )}
        </DeliveryStrip>
      </div>
      {/* The page's rounded top, laid over the foot of the band. */}
      <div aria-hidden className="relative z-10 -mt-3 h-[calc(0.75rem+2px)] rounded-t-xl bg-card" />
    </div>
  )
}
