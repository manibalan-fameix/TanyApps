import { HugeiconsIcon } from "@hugeicons/react"
import {
  Call02Icon,
  Clock01Icon,
  Location01Icon,
  Menu01Icon,
  Search01Icon,
  ShoppingBag01Icon,
  StarIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons"

import { getRetailType } from "@/lib/verticals/retail-types"
import { RADIUS_OPTIONS, type RadiusKey, readableOn } from "@/lib/theme/tokens"
import { cn } from "@/lib/utils"

/** A miniature of the customer-facing store page, with the words and sample products of the shop's business type, styled with the chosen theme. Colours here are the owner's own data. */
export function RetailPreview({
  name,
  city,
  primary,
  accent,
  radius,
  logo,
  businessType,
}: {
  name: string
  city: string
  primary: string
  accent: string
  radius: RadiusKey
  logo?: string | null
  businessType?: string | null
}) {
  const type = getRetailType(businessType)
  const fg = readableOn(primary)
  const r = RADIUS_OPTIONS[radius]
  const tabs = [
    { icon: Menu01Icon, label: "Shop", active: true },
    { icon: Search01Icon, label: "Search", active: false },
    { icon: ShoppingBag01Icon, label: "Cart", active: false, prominent: true },
    { icon: Call02Icon, label: "Call", active: false },
    { icon: UserCircleIcon, label: "Account", active: false },
  ]
  return (
    <div
      className="mx-auto w-[300px] rounded-[2.5rem] border-[6px] border-foreground/90 bg-foreground/90 shadow-xl"
      aria-label="Preview of your store page"
    >
      <div className="relative flex h-[620px] flex-col overflow-hidden rounded-[2rem] bg-background">
        <div className="absolute top-2 left-1/2 z-20 h-4 w-20 -translate-x-1/2 rounded-full bg-foreground/90" />
        <div className="flex h-[72px] shrink-0 items-end gap-2 border-b bg-background px-3 pb-2">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              className="size-8 shrink-0 rounded-full bg-muted object-contain"
            />
          ) : (
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              style={{ backgroundColor: primary, color: fg }}
            >
              {name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-xl border bg-muted px-2 text-[11px] text-muted-foreground">
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="size-3.5 shrink-0"
            />
            <span className="truncate text-muted-foreground/50">
              {type.searchHint}
            </span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 [scrollbar-width:none] flex-col gap-3 overflow-y-auto p-3 [&::-webkit-scrollbar]:hidden">
          <div
            className="flex shrink-0 flex-col gap-1 p-3"
            style={{ backgroundColor: primary, color: fg, borderRadius: r }}
          >
            <p className="truncate text-base font-semibold tracking-tight">
              {name}
            </p>
            <p className="flex items-center gap-1 text-[11px] opacity-90">
              <HugeiconsIcon icon={Location01Icon} className="size-3" />
              {city}
            </p>
            <p className="flex items-center gap-1 text-[11px] opacity-90">
              <HugeiconsIcon icon={Clock01Icon} className="size-3" />
              Open today, 9 am to 9 pm
            </p>
          </div>

          <ul className="flex shrink-0 gap-1.5">
            {["All", ...type.starterCategories.slice(0, 3)].map((c, i) => (
              <li
                key={c}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-medium",
                  i !== 0 && "bg-muted text-muted-foreground"
                )}
                style={
                  i === 0 ? { backgroundColor: primary, color: fg } : undefined
                }
              >
                {c}
              </li>
            ))}
          </ul>

          {type.previewItems.slice(0, 3).map((dish, n) => (
            <div
              key={dish.name}
              className="flex shrink-0 items-center gap-3 border bg-card p-2.5"
              style={{ borderRadius: r }}
            >
              <div
                className="size-14 shrink-0 bg-muted"
                style={{ borderRadius: r }}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate text-xs font-semibold">{dish.name}</p>
                <div className="flex items-center gap-1.5">
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                    style={{ backgroundColor: accent, color: readableOn(accent) }}
                  >
                    {["New", "Offer", "Popular"][n]}
                  </span>
                  <HugeiconsIcon
                    icon={StarIcon}
                    className="size-3 text-muted-foreground"
                  />
                </div>
                <p className="text-xs font-semibold">{dish.price}</p>
              </div>
            </div>
          ))}
        </div>

        <ul className="flex shrink-0 border-t bg-background px-1 pb-2">
          {tabs.map(({ icon, label, active, prominent }) =>
            prominent ? (
              <li
                key={label}
                className="flex flex-1 items-center justify-center"
              >
                <span
                  className="flex size-10 items-center justify-center rounded-full shadow-md"
                  style={{ backgroundColor: primary, color: fg }}
                  aria-label={label}
                >
                  <HugeiconsIcon
                    icon={icon}
                    strokeWidth={2.5}
                    className="size-5"
                  />
                </span>
              </li>
            ) : (
              <li
                key={label}
                className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium"
                style={active ? { color: primary } : undefined}
              >
                <HugeiconsIcon
                  icon={icon}
                  strokeWidth={2}
                  className={cn("size-5", !active && "text-muted-foreground")}
                />
                <span className={cn(!active && "text-muted-foreground")}>
                  {label}
                </span>
              </li>
            )
          )}
        </ul>
      </div>
    </div>
  )
}
