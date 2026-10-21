import { HugeiconsIcon } from "@hugeicons/react"
import {
  Car01Icon,
  Call02Icon,
  Location01Icon,
  Route02Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons"

import { RADIUS_OPTIONS, type RadiusKey, readableOn } from "@/lib/theme/tokens"

/** A miniature of the customer-facing cab booking page shown during Cabs onboarding. */
export function CabsPreview({
  name,
  city,
  primary,
  accent,
  radius,
  logo,
}: {
  name: string
  city: string
  primary: string
  accent: string
  radius: RadiusKey
  logo?: string | null
}) {
  const fg = readableOn(primary)
  const r = RADIUS_OPTIONS[radius]
  return (
    <div
      className="mx-auto w-[300px] rounded-[2.5rem] border-[6px] border-foreground/90 bg-foreground/90 shadow-xl"
      aria-label="Preview of your booking page"
    >
      <div className="relative flex h-[620px] flex-col overflow-hidden rounded-[2rem] bg-background">
        <div className="absolute top-2 left-1/2 z-20 h-4 w-20 -translate-x-1/2 rounded-full bg-foreground/90" />
        <div className="flex h-[72px] shrink-0 items-end gap-2 border-b bg-background px-3 pb-2">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="size-8 shrink-0 rounded-full bg-muted object-contain" />
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold" style={{ backgroundColor: primary, color: fg }}>
              {name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{name}</p>
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <HugeiconsIcon icon={Location01Icon} className="size-3" />
              {city}
            </p>
          </div>
          <HugeiconsIcon icon={Call02Icon} className="size-5" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <div className="flex flex-col gap-1 p-3" style={{ backgroundColor: primary, color: fg, borderRadius: r }}>
            <p className="text-base font-semibold tracking-tight">Book a cab</p>
            <p className="text-[11px] opacity-90">Reliable rides and outstation trips</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: Car01Icon, label: "Vehicles" },
              { icon: Route02Icon, label: "Tours" },
              { icon: UserMultiple02Icon, label: "Drivers" },
              { icon: Call02Icon, label: "Call us" },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-2 rounded-xl border bg-card p-2.5 text-[11px] font-medium">
                <HugeiconsIcon icon={icon} className="size-4" style={{ color: accent }} />
                {label}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 rounded-xl border bg-card p-3" style={{ borderRadius: r }}>
            <p className="text-xs font-semibold">Start your booking</p>
            <div className="rounded-lg bg-muted px-2.5 py-2 text-[11px] text-muted-foreground">Pickup location</div>
            <div className="rounded-lg bg-muted px-2.5 py-2 text-[11px] text-muted-foreground">Where do you want to go?</div>
            <div className="rounded-lg py-2 text-center text-[11px] font-semibold" style={{ backgroundColor: primary, color: fg }}>Get a quote</div>
          </div>
        </div>

        <div className="flex shrink-0 justify-around border-t bg-background px-1 pb-2 pt-1 text-[10px] text-muted-foreground">
          <span className="flex flex-col items-center gap-0.5" style={{ color: primary }}><HugeiconsIcon icon={Car01Icon} className="size-5" />Home</span>
          <span className="flex flex-col items-center gap-0.5"><HugeiconsIcon icon={Route02Icon} className="size-5" />Trips</span>
          <span className="flex flex-col items-center gap-0.5"><HugeiconsIcon icon={Call02Icon} className="size-5" />Contact</span>
        </div>
      </div>
    </div>
  )
}
