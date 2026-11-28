"use client"

import Link from "next/link"
import { Fragment, useEffect, useRef, useState } from "react"
import {
  ArrowDown01Icon,
  Search01Icon,
  Location01Icon,
  RestaurantTableIcon,
  Scooter01Icon,
  Store01Icon,
  StoreLocation01Icon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { CategoryIcon } from "@/components/restaurant/category-icon"
import { DishTile } from "@/components/restaurant/store/dish-tile"
import { PromoBanners } from "@/components/restaurant/store/promo-banners"
import type { StoreBanner } from "@/lib/restaurant/banners"
import { type HomeSectionId, type Homepage, rowProducts } from "@/lib/restaurant/homepage"
import {
  StoreTabs,
  type StoreInfo,
} from "@/components/restaurant/store/store-tabs"
import {
  readFulfilmentPref,
  writeFulfilmentPref,
} from "@/components/restaurant/store/fulfilment-pref"
import { useGuestLocation } from "@/components/restaurant/store/location"
import { FilterBar, useDishFilters } from "@/components/restaurant/store/filter-bar"
import { type Fulfilment, FULFILMENT_LABEL } from "@/lib/restaurant/settings"
import {
  type StoreCategory,
  type StoreDish,
  offerPercent,
} from "@/lib/restaurant/storefront"
import { distanceKm } from "@/lib/restaurant/service-area"
import { isOpenAt, nextOpeningLabel } from "@/lib/hours"
import { etaMinutes } from "@/lib/restaurant/tracking"
import { cn } from "@/lib/utils"
import { RequestPrompt } from "@/components/restaurant/store/request-prompt"
import { useStoreTerms } from "@/components/restaurant/store/terms-context"


const MODE_ICON = {
  delivery: Scooter01Icon,
  pickup: Store01Icon,
  dine_in: RestaurantTableIcon,
} as const
type Props = {
  restaurant: string
  logoUrl: string | null
  fulfilments: Fulfilment[]
  dishes: StoreDish[]
  categories: StoreCategory[]
  couponHint: string | null
  canOrder: boolean
  info: StoreInfo
  banners: StoreBanner[]
  /** The owner's home page layout. */
  layout: Homepage
  /** Where the restaurant is, so the strip can estimate a delivery time. */
  origin?: { lat: number; lng: number } | null
  /** Where the shop is, shown under its name. */
  location?: string | null
}

/** Phone home screen: a delivery / pickup switch, search, filter pills, category circles and swipeable rows of cards. */
export function StoreAppHome({
  restaurant,
  fulfilments,
  dishes,
  categories,
  couponHint,
  canOrder,
  info,
  banners,
  layout,
  origin = null,
  location = null,
}: Props) {
  const terms = useStoreTerms()
  const modes: Fulfilment[] = fulfilments.filter((f) => f !== "dine_in")
  const [mode, setMode] = useState<Fulfilment | null>(modes[0] ?? null)
  const mainRef = useRef<HTMLElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const brandRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  // The header card sticks, but slides up until the brand name is gone: search and the order tabs stay pinned. The tabs and chips below
  // stick just under whatever is left, so measure both (a long name wraps to two lines).
  const [brandH, setBrandH] = useState(0)
  // Open or closed right now, from the weekly hours. Read after mount (and every minute) so the server and first client render match.
  const [inHours, setInHours] = useState<boolean | null>(null)
  const [opensAt, setOpensAt] = useState<string | null>(null)
  const schedule = info.schedule ?? null
  useEffect(() => {
    const tick = () => {
      setInHours(isOpenAt(schedule))
      setOpensAt(nextOpeningLabel(schedule))
    }
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [schedule])
  // No schedule means the owner never set hours, so a restaurant taking orders reads as open.
  const hoursOpen = inHours ?? (schedule ? null : true)
  const statusOf = (m: Fulfilment | "book"): boolean | null => {
    if (hoursOpen === null) return null
    return m === "book" ? hoursOpen : hoursOpen && canOrder
  }
  // Once the brand name has scrolled away the header is floating over the dishes, so it turns to frosted glass.
  const [stuck, setStuck] = useState(false)
  // Once the sort / filter strip has pinned right under the delivery strip, the page card's rounded corners have scrolled away, so the corner pieces go.
  const [filtersPinned, setFiltersPinned] = useState(false)
  const filtersRef = useRef<HTMLDivElement>(null)
  const fullRef = useRef(0)
  // The header card (search and Delivery / Pickup) and the delivery strip, the sort / filter strip and the chips stay stacked at the top. Scrolling down
  // once the sort strip has reached the delivery strip slides the header card away, so the strips pin to the very top; scrolling back up brings it back,
  // and the next scroll down hides it again.
  const [hidden, setHidden] = useState(false)
  const hiddenRef = useRef(false)
  const belowRef = useRef(0)
  const lastY = useRef(0)
  useEffect(() => {
    const on = () => {
      const y = window.scrollY
      setStuck(y > brandH)
      const main = mainRef.current
      // Pinned, the tabs below must start exactly where the strip's visible part ends (it loses 24px to the clip), so read it from the screen.
      const strip = stripRef.current
      if (strip && y > brandH && !hiddenRef.current) fullRef.current = Math.max(strip.getBoundingClientRect().bottom - 24, 0)
      const filters = filtersRef.current
      const touching = filters ? y > brandH && filters.getBoundingClientRect().top <= fullRef.current + 1 : false
      const dy = y - lastY.current
      let hide = hiddenRef.current
      if (y <= brandH) hide = false
      else if (Math.abs(dy) >= 6) {
        lastY.current = y
        if (dy < 0) hide = false
        else if (touching) hide = true
      }
      hiddenRef.current = hide
      setHidden(hide)
      // Hidden, the strips sit at the top edge (under the status bar), so the stack below them starts right under the delivery strip.
      if (main) main.style.setProperty("--head-h", hide ? `calc(max(env(safe-area-inset-top), 0.5rem) + ${belowRef.current}px)` : `${fullRef.current}px`)
      setFiltersPinned(hide || touching)
    }
    on()
    window.addEventListener("scroll", on, { passive: true })
    window.addEventListener("resize", on)
    return () => {
      window.removeEventListener("scroll", on)
      window.removeEventListener("resize", on)
    }
  }, [brandH, mode])
  useEffect(() => {
    const head = headRef.current
    const brand = brandRef.current
    const main = mainRef.current
    if (!head || !brand || !main) return
    const strip = stripRef.current
    const apply = () => {
      setBrandH(brand.offsetHeight)
      const card = head.offsetHeight - brand.offsetHeight - 6
      // The delivery strip tucks 24px under the card and, when pinned, loses its bottom 24px to the clip, so only the middle of it adds to what the tabs below must clear.
      const below = strip ? Math.max(strip.offsetHeight - 48, 0) : 0
      belowRef.current = below
      main.style.setProperty("--card-h", `${card}px`)
      if (!hiddenRef.current) {
        fullRef.current = card + below
        main.style.setProperty("--head-h", `${card + below}px`)
      }
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(head)
    ro.observe(brand)
    if (strip) ro.observe(strip)
    return () => ro.disconnect()
  }, [modes.length, mode])

  // Read after mount so the server and first client render match.
  useEffect(() => {
    const saved = readFulfilmentPref()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && modes.includes(saved)) setMode(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = (m: Fulfilment) => {
    setMode(m)
    writeFulfilmentPref(m)
  }

  const filters = useDishFilters(dishes)
  const { shown, anyFilter, clear } = filters

  const picks = shown.filter((d) => d.isFeatured)
  const gems = rowProducts(layout.picks.productIds, dishes, shown, (picks.length ? picks : shown).slice(0, 8))
  const onOffer = rowProducts(layout.offers.productIds, dishes, shown, shown.filter((d) => offerPercent(d) !== null).slice(0, 8))
  const circles = categories.filter((c) => !layout.hiddenCategoryIds.includes(c.id))
  const offersTitle = layout.offers.title || "Offers for You"

  // Nothing to show is said once, where the product rows would start.
  const emptyNote = (
    <>
      {shown.length === 0 ? (
        <p className="mx-4 mt-8 rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {dishes.length === 0
            ? `Our ${terms.catalogue.toLowerCase()} is coming soon. Please check back shortly.`
            : `No ${terms.items} match these filters.`}
          {anyFilter ? (
            <button
              type="button"
              onClick={clear}
              className="mt-3 block w-full font-medium text-primary"
            >
              Clear filters
            </button>
          ) : null}
        </p>
      ) : null}
    </>
  )

  const blocks: Record<HomeSectionId, React.ReactNode> = {
    banners: <PromoBanners banners={banners} />,
    categories: (
      <>
      {circles.length > 0 ? (
        <nav
          aria-label="Categories"
          className="mt-4 flex scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden"
        >
          {circles.map((c) => {
            return (
              <Link
                key={c.id}
                href={`/category/${c.slug}`}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5"
              >
                <CategoryIcon name={c.name} className="size-16 rounded-full" iconClassName="size-7" />
                <span className="w-full truncate text-center text-xs">
                  {c.name}
                </span>
              </Link>
            )
          })}
        </nav>
      ) : null}
      </>
    ),
    picks:
      shown.length > 0 && gems.length > 0 ? (
        <Row title={layout.picks.title || (picks.length ? terms.picksTitle : "Popular Now")} dishes={gems} canOrder={canOrder} />
      ) : null,
    offers:
      shown.length === 0 ? null : onOffer.length > 0 ? (
        <Row title={offersTitle} subtitle={layout.offers.subtitle || (couponHint ?? `Fresh deals on ${terms.items} you will love`)} dishes={onOffer} canOrder={canOrder} badge />
      ) : couponHint ? (
        <section className="mt-6 px-4">
          <h2 className="text-lg font-bold tracking-tight">{offersTitle}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{layout.offers.subtitle || couponHint}</p>
        </section>
      ) : null,
    // The filter strip and the product list stay together; a fragment, so the strip can still pin while the page scrolls.
    catalogue: (
      <>
        {emptyNote}
      <FilterBar ref={filtersRef} filters={filters} className="top-[var(--head-h,10rem)]" />
      <StoreTabs
        dishes={shown}
        categories={categories}
        canOrder={canOrder}
        underBar
      />
      </>
    ),
  }
  return (
    <main ref={mainRef} className="relative md:hidden">
      {/* iOS 26 Safari ignores theme-color and tints its status bar from the fixed element at the top edge, so pin a brand-coloured one there. */}
      <div aria-hidden className={cn("fixed inset-x-0 top-0 z-50 h-[max(env(safe-area-inset-top),0.5rem)] transition-colors", "bg-background")} />
      <div ref={headRef} style={{ top: -(brandH + 4) }} className={cn("sticky z-40 transform-gpu transition-transform duration-300", hidden && "pointer-events-none -translate-y-full", "rounded-b-3xl border-x border-b border-foreground/10 px-4 shadow-sm transition-colors", stuck ? "bg-background/70 backdrop-blur-3xl backdrop-saturate-200" : "bg-background", " pt-[calc(0.75rem+var(--safe-area-inset-top,0px))] pb-0")}>
        <div ref={brandRef} className="flex items-center justify-between gap-3 pb-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex min-w-0 flex-col items-start text-left">
              <span className="line-clamp-2 text-[28px] leading-tight font-bold tracking-tight text-primary [-webkit-text-stroke:0.75px_currentColor]">
                {restaurant}
              </span>
              {location ? (
                <span className="mt-0.5 flex max-w-full items-center gap-1 text-xs font-medium text-muted-foreground">
                  <HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="size-3.5 shrink-0" />
                  <span className="truncate">{location}</span>
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/info"
              aria-label="About and reviews"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <HugeiconsIcon icon={StoreLocation01Icon} strokeWidth={2} className="size-6" />
            </Link>
            <Link
              href="/profile"
              aria-label="Profile"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <HugeiconsIcon icon={UserCircleIcon} strokeWidth={2} className="size-6" />
            </Link>
          </div>
        </div>
        <form
          action="/search"
          role="search"
          className="relative isolate mt-1 mb-4 flex h-14 items-center gap-2.5 rounded-full px-4 text-foreground"
        >
          <span
            aria-hidden
            className="absolute inset-0 -z-10 rounded-full border-[1.5px] border-foreground/12 bg-muted shadow-[inset_0_1px_0_color-mix(in_oklab,var(--background)_90%,transparent)]"
          />
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="size-5 shrink-0"
          />
          <input
            name="q"
            type="search"
            enterKeyHint="search"
            aria-label={`Search ${terms.items}`}
            placeholder={`Search ${restaurant}`}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </form>
      {modes.length > 0 ? (
        <div role="radiogroup" aria-label="Order type" className="-mx-4 flex px-4">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => pick(m)}
              style={{ "--duo": `var(--logo-${m === "pickup" ? "tanyeats" : "tanymotos"}-fg)` } as React.CSSProperties}
              className="group relative isolate flex min-w-0 flex-1 flex-col items-center gap-1 pt-1 pb-4 text-xs font-medium text-muted-foreground transition-colors before:absolute before:-top-2 before:bottom-0 before:left-1/2 before:w-24 before:-translate-x-1/2 before:-z-10 before:rounded-t-2xl before:bg-linear-to-t before:from-transparent before:to-[var(--duo)] before:opacity-0 aria-checked:before:opacity-25 aria-checked:font-semibold aria-checked:text-foreground focus-visible:outline-none"
            >
              <HugeiconsIcon
                icon={MODE_ICON[m]}
                strokeWidth={1.75}
                className="size-6 shrink-0 group-aria-checked:[&_path]:fill-[var(--duo)]"
                // Two shades of the product colour: the deep one draws the icon, the light one fills it when active.
                style={{ color: `var(--logo-${m === "pickup" ? "tanyeats" : "tanymotos"})`, "--duo": `var(--logo-${m === "pickup" ? "tanyeats" : "tanymotos"}-fg)` } as React.CSSProperties}
              />
              {FULFILMENT_LABEL[m]}
              <OpenTag open={statusOf(m)} />
              <span aria-hidden className="absolute bottom-0 z-10 h-[3px] w-24 rounded-full bg-foreground opacity-0 transition-opacity group-aria-checked:opacity-100" />
            </button>
          ))}
                    {terms.tableBookings ? (
          <Link
            href="/book-table"
            className="relative flex min-w-0 flex-1 flex-col items-center gap-1 pt-1 pb-4 text-xs font-medium text-muted-foreground transition-colors focus-visible:outline-none"
          >
            <HugeiconsIcon icon={RestaurantTableIcon} strokeWidth={1.75} className="size-6 shrink-0" style={{ color: "var(--logo-tanyecom)" }} />
            Book table
            <OpenTag open={statusOf("book")} />
          </Link>
          ) : null}
        </div>
      ) : null}
      </div>

      {/* The delivery strip sits between two cards: the orange header above and the page below, both with rounded corners that overlap its ends. */}
      {mode === "delivery" || mode === "pickup" ? (
        <div ref={stripRef} className={cn("sticky -mt-6", stuck ? "z-30 [clip-path:inset(0_0_1.5rem_0)]" : "z-0")} style={{ top: hidden ? "calc(max(env(safe-area-inset-top), 0.5rem) - 1.5rem)" : "calc(var(--card-h, 0px) - 1.5rem)" }}>
          <DeliveryStrip origin={origin} solid={stuck} closed={hoursOpen === false ? (opensAt ?? "later") : null} pickup={mode === "pickup"} restaurant={restaurant} directionsUrl={info.directionsUrl} />
        </div>
      ) : null}

      <div className="relative z-10 -mt-6 rounded-t-3xl bg-background pt-2">
      {/* While the strip is pinned, the page slides under it; these two corner pieces stay stuck just below it and paint the strip's colour around the card's rounded top corners, so the card keeps its shape as it scrolls. */}
      {stuck && !filtersPinned && (mode === "delivery" || mode === "pickup") ? (
        <div aria-hidden className="pointer-events-none sticky top-[var(--head-h,0px)] z-[31] -mt-2 h-0">
          <span className="absolute top-0 left-0 size-6 [background:radial-gradient(circle_at_100%_100%,transparent_calc(1.5rem-0.5px),color-mix(in_oklab,var(--primary)_30%,var(--background))_1.5rem)]" />
          <span className="absolute top-0 right-0 size-6 [background:radial-gradient(circle_at_0%_100%,transparent_calc(1.5rem-0.5px),color-mix(in_oklab,var(--primary)_30%,var(--background))_1.5rem)]" />
        </div>
      ) : null}
      {layout.sections.map((section) => (section.visible ? <Fragment key={section.id}>{blocks[section.id]}</Fragment> : null))}
      <RequestPrompt className="mx-4 my-8" />
      </div>
    </main>
  )
}

/** "Open" or "Closed" under a top tab. Nothing until the hours are known. */
export function OpenTag({ open }: { open: boolean | null }) {
  if (open === null) return <span aria-hidden className="h-3" />
  return <span className={cn("-mt-0.5 text-[10px] leading-3 font-semibold", open ? "text-success" : "text-destructive")}>{open ? "Open" : "Closed"}</span>
}

// Kitchen time on top of the ride, and how wide the quoted range is. Rough on purpose: shown as a range, never as a promise.
const KITCHEN_MIN = 10
const RANGE_MIN = 10

/** "Deliver to <place> | in 15 - 25 minutes": a light band at the foot of the header. The time needs both pins, so it is left out until the guest has set a spot. */
export function DeliveryStrip({
  origin,
  solid,
  closed,
  pickup,
  restaurant,
  directionsUrl,
  flat = false,
  children,
}: {
  origin: { lat: number; lng: number } | null
  /** Outside opening hours: when it next opens ("tomorrow 7 am"), shown in place of the time estimate. Null while open. */
  closed: string | null
  /** The Pickup tab: where to collect and how soon it is ready, instead of the guest's address and the ride. */
  pickup: boolean
  restaurant: string
  directionsUrl: string | null
  /** Pinned over the dishes: the gradient is fully filled, with no see-through ends. */
  solid: boolean
  /** The web header: a gradient bar under the header, without the overlap padding the phone card needs. */
  flat?: boolean
  /** Replaces the usual "Deliver to ..." line: the checkout page shows its own message inside the same band. */
  children?: React.ReactNode
}) {
  const { location, setOpen } = useGuestLocation()
  const place = location
    ? location.area || location.city || location.pincode || "your location"
    : null
  const point =
    location && location.lat !== null && location.lng !== null
      ? { lat: location.lat, lng: location.lng }
      : null
  const lo =
    origin && point ? etaMinutes(distanceKm(origin, point)) + KITCHEN_MIN : null
  return (
    <div className={flat ? "flex items-center justify-center gap-3 bg-[linear-gradient(90deg,color-mix(in_oklab,var(--primary)_22%,transparent),color-mix(in_oklab,var(--primary)_88%,var(--foreground))_30%,color-mix(in_oklab,var(--primary)_88%,var(--foreground))_70%,color-mix(in_oklab,var(--primary)_22%,transparent))] px-4 py-2 text-sm text-primary-foreground" : `relative isolate flex items-center justify-center gap-3 overflow-hidden ${solid ? "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--primary)_30%,var(--background)),color-mix(in_oklab,var(--primary)_88%,var(--foreground))_30%,color-mix(in_oklab,var(--primary)_88%,var(--foreground))_70%,color-mix(in_oklab,var(--primary)_30%,var(--background)))]" : "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--primary)_22%,transparent),color-mix(in_oklab,var(--primary)_88%,var(--foreground))_30%,color-mix(in_oklab,var(--primary)_88%,var(--foreground))_70%,color-mix(in_oklab,var(--primary)_22%,transparent))]"} px-4 pt-[calc(1.5rem+0.625rem)] pb-[calc(1.5rem+0.625rem)] text-sm text-primary-foreground shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--background)_55%,transparent)] ${solid ? "" : "backdrop-blur-xl backdrop-saturate-150"} before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-z-10 before:h-1/2 before:bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--background)_40%,transparent),transparent)] before:content-['']`}>
      {children ? children : pickup ? (
        <>
          {directionsUrl ? (
            <a href={directionsUrl} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1" aria-label={`Directions to ${restaurant}`}>
              <HugeiconsIcon icon={Store01Icon} strokeWidth={2} className="size-4 shrink-0" />
              <span className="min-w-0 truncate">
                <span className="font-medium">{restaurant}</span>
              </span>
            </a>
          ) : (
            <span className="flex min-w-0 items-center gap-1">
              <HugeiconsIcon icon={Store01Icon} strokeWidth={2} className="size-4 shrink-0" />
              <span className="min-w-0 truncate">
                <span className="font-medium">{restaurant}</span>
              </span>
            </span>
          )}
          <span aria-hidden className="h-5 w-px shrink-0 bg-primary-foreground/40" />
          <span className="shrink-0 font-bold">
            {closed ? `Opens ${closed}` : `ready in ${KITCHEN_MIN} - ${KITCHEN_MIN + RANGE_MIN} min`}
          </span>
        </>
      ) : (
        <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 items-center gap-1"
        aria-label="Change delivery location"
      >
        <HugeiconsIcon
          icon={Location01Icon}
          strokeWidth={2}
          className="size-4 shrink-0"
        />
        {place ? (
          <span className="min-w-0 truncate">
            <span className="opacity-80">Deliver to </span>
            <span className="font-medium">{place}</span>
          </span>
        ) : (
          <span className="min-w-0 truncate font-medium">Set your delivery location</span>
        )}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="size-4 shrink-0"
        />
      </button>
      {closed || lo !== null ? (
        <>
          <span aria-hidden className="h-5 w-px shrink-0 bg-primary-foreground/40" />
          <span className="shrink-0 font-bold">{closed ? `Opens ${closed}` : `in ${lo} - ${(lo ?? 0) + RANGE_MIN} minutes`}</span>
        </>
      ) : null}
        </>
      )}
    </div>
  )
}

function Row({
  title,
  subtitle,
  dishes,
  canOrder,
  badge,
}: {
  title?: string
  subtitle?: string
  dishes: StoreDish[]
  canOrder: boolean
  badge?: boolean
}) {
  return (
    <section className={cn(title ? "mt-6" : "mt-3")}>
      {title ? (
        <div className="px-4">
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      ) : null}
      <ul className="mt-3 flex snap-x scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-2 [&::-webkit-scrollbar]:hidden">
        {dishes.map((d) => (
          <li key={d.id} className="w-28 shrink-0 snap-start">
            <DishTile dish={d} canOrder={canOrder} badge={badge} />
          </li>
        ))}
      </ul>
    </section>
  )
}
