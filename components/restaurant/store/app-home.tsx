"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDown01Icon,
  DiscountTag01Icon,
  FilterHorizontalIcon,
  Medal01Icon,
  Restaurant01Icon,
  Search01Icon,
  SortByDown01Icon,
  Clock01Icon,
  Location01Icon,
  RestaurantTableIcon,
  Scooter01Icon,
  Store01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { DishTile } from "@/components/restaurant/store/dish-tile"
import { PromoBanners } from "@/components/restaurant/store/promo-banners"
import type { StoreBanner } from "@/lib/restaurant/banners"
import {
  StoreTabs,
  type StoreInfo,
  type StoreReview,
} from "@/components/restaurant/store/store-tabs"
import { VegMark } from "@/components/restaurant/store/dish-card"
import {
  readFulfilmentPref,
  writeFulfilmentPref,
} from "@/components/restaurant/store/fulfilment-pref"
import { useGuestLocation } from "@/components/restaurant/store/location"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

type Sort = "popular" | "low" | "high"
type Diet = "all" | "veg" | "nonVeg"

const MODE_ICON = {
  delivery: Scooter01Icon,
  pickup: Store01Icon,
  dine_in: RestaurantTableIcon,
} as const
const SORT_LABEL: Record<Sort, string> = {
  popular: "Popular",
  low: "Price: low to high",
  high: "Price: high to low",
}
const DIET_LABEL: Record<Diet, string> = {
  all: "Dietary",
  veg: "Veg",
  nonVeg: "Non-veg",
}

const PILL =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-background px-3.5 text-sm whitespace-nowrap text-foreground shadow-[0_0_6px_1px_color-mix(in_oklab,var(--foreground)_9%,transparent),0_0_2px_color-mix(in_oklab,var(--foreground)_10%,transparent)] transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
const PILL_ON = "border-foreground bg-foreground text-background"

type Props = {
  restaurant: string
  logoUrl: string | null
  fulfilments: Fulfilment[]
  dishes: StoreDish[]
  categories: StoreCategory[]
  rating: { value: number; count: number } | null
  couponHint: string | null
  canOrder: boolean
  info: StoreInfo
  reviews: StoreReview[]
  banners: StoreBanner[]
  /** Where the restaurant is, so the strip can estimate a delivery time. */
  origin?: { lat: number; lng: number } | null
}

/** Phone home screen: a delivery / pickup switch, search, filter pills, category circles and swipeable rows of cards. */
export function StoreAppHome({
  restaurant,
  logoUrl,
  fulfilments,
  dishes,
  categories,
  rating,
  couponHint,
  canOrder,
  info,
  reviews,
  banners,
  origin = null,
}: Props) {
  const modes: Fulfilment[] = fulfilments.filter((f) => f !== "dine_in")
  const [mode, setMode] = useState<Fulfilment | null>(modes[0] ?? null)
  const [sort, setSort] = useState<Sort>("popular")
  const [diet, setDiet] = useState<Diet>("all")
  const [open, setOpen] = useState(false)
  const [offers, setOffers] = useState(false)
  const [best, setBest] = useState(false)
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
  // Once the menu's own tabs (Categories / About / Reviews) reach the top and dock there, the order tabs and the delivery strip slide away
  // so only those tabs stay fixed. Read from a marker that sits where those tabs naturally start, so docking never feeds back on itself.
  const [docked, setDocked] = useState(false)
  const dockedRef = useRef(false)
  const fullRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const on = () => {
      const y = window.scrollY
      setStuck(y > brandH)
      const main = mainRef.current
      // Pinned, the tabs below must start exactly where the strip's visible part ends (it loses 24px to the clip), so read it from the screen.
      const strip = stripRef.current
      if (strip && y > brandH && !dockedRef.current) fullRef.current = Math.max(strip.getBoundingClientRect().bottom - 24, 0)
      const marker = sentinelRef.current
      const d = marker ? marker.getBoundingClientRect().top <= fullRef.current + 52 + 1 : false
      dockedRef.current = d
      setDocked(d)
      if (main) main.style.setProperty("--head-h", d ? `${strip ? Math.max(strip.getBoundingClientRect().bottom - 24, 0) : 0}px` : `${fullRef.current}px`)
    }
    on()
    window.addEventListener("scroll", on, { passive: true })
    window.addEventListener("resize", on)
    return () => {
      window.removeEventListener("scroll", on)
      window.removeEventListener("resize", on)
    }
  }, [brandH, mode])
  // Docking moves the strip on the next render, so measure again once it has landed.
  useEffect(() => {
    if (!docked) return
    const id = requestAnimationFrame(() => {
      const strip = stripRef.current
      const main = mainRef.current
      if (strip && main) main.style.setProperty("--head-h", `${Math.max(strip.getBoundingClientRect().bottom - 24, 0)}px`)
    })
    return () => cancelAnimationFrame(id)
  }, [docked])
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
      main.style.setProperty("--card-h", `${card}px`)
      if (!dockedRef.current) {
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

  const anyFilter =
    diet !== "all" || open || offers || best || sort !== "popular"
  const shown = useMemo(() => {
    const list = dishes.filter((d) => {
      if (diet === "veg" && !d.isVeg) return false
      if (diet === "nonVeg" && d.isVeg) return false
      if (open && !d.isAvailable) return false
      if (offers && offerPercent(d) === null) return false
      if (best && !d.isFeatured) return false
      return true
    })
    const unit = (d: StoreDish) =>
      d.portions.length ? Math.min(...d.portions.map((p) => p.price)) : d.price
    if (sort === "low") return [...list].sort((a, b) => unit(a) - unit(b))
    if (sort === "high") return [...list].sort((a, b) => unit(b) - unit(a))
    return list
  }, [dishes, diet, open, offers, best, sort])

  const picks = shown.filter((d) => d.isFeatured)
  const gems = (picks.length ? picks : shown).slice(0, 8)
  const onOffer = shown.filter((d) => offerPercent(d) !== null).slice(0, 8)
  const clear = () => {
    setDiet("all")
    setOpen(false)
    setOffers(false)
    setBest(false)
    setSort("popular")
  }

  const circleImage = (c: StoreCategory) =>
    dishes.find((d) => d.categoryId === c.id && d.imageUrl)?.imageUrl ?? null

  return (
    <main ref={mainRef} className="relative pb-40 md:hidden">
      {/* iOS 26 Safari ignores theme-color and tints its status bar from the fixed element at the top edge, so pin a brand-coloured one there. */}
      <div aria-hidden className={cn("fixed inset-x-0 top-0 z-50 h-[max(env(safe-area-inset-top),0.5rem)] transition-colors", "bg-background")} />
      <div ref={headRef} style={{ top: -(brandH + 4) }} className={cn("sticky z-40 transform-gpu transition-transform duration-300", docked && "pointer-events-none -translate-y-full", "rounded-b-3xl border-x border-b border-foreground/10 px-4 shadow-sm transition-colors", stuck ? "bg-background/70 backdrop-blur-3xl backdrop-saturate-200" : "bg-background", " pt-[calc(0.75rem+var(--safe-area-inset-top,0px))] pb-0")}>
        <div ref={brandRef} className="flex items-center justify-center gap-3 pb-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {logoUrl ? (
              <Link
                href="/"
                aria-label={`${restaurant} home`}
                className="shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt=""
                  className="size-10 rounded-full bg-muted object-contain"
                />
              </Link>
            ) : null}
            <div className="flex min-w-0 flex-col items-center text-center">
              <Link
                href="/"
                className="line-clamp-2 text-3xl leading-tight font-bold tracking-tight text-primary [-webkit-text-stroke:0.75px_currentColor]"
              >
                {restaurant}
              </Link>
            </div>
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
            aria-label="Search dishes"
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
              className="group relative flex min-w-0 flex-1 flex-col items-center gap-1 pt-1 pb-4 text-xs font-medium text-muted-foreground transition-colors aria-checked:font-semibold aria-checked:text-foreground focus-visible:outline-none"
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
              <span aria-hidden className="absolute bottom-0 z-10 h-[3px] w-12 rounded-full bg-foreground opacity-0 transition-opacity group-aria-checked:opacity-100" />
            </button>
          ))}
                    <Link
            href="/book-table"
            className="relative flex min-w-0 flex-1 flex-col items-center gap-1 pt-1 pb-4 text-xs font-medium text-muted-foreground transition-colors focus-visible:outline-none"
          >
            <HugeiconsIcon icon={RestaurantTableIcon} strokeWidth={1.75} className="size-6 shrink-0" style={{ color: "var(--logo-tanyecom)" }} />
            Book table
            <OpenTag open={statusOf("book")} />
          </Link>
        </div>
      ) : null}
      </div>

      {/* The delivery strip sits between two cards: the orange header above and the page below, both with rounded corners that overlap its ends. */}
      {mode === "delivery" || mode === "pickup" ? (
        <div ref={stripRef} className={cn("sticky -mt-6", stuck ? "z-30 [clip-path:inset(0_0_1.5rem_0)]" : "z-0")} style={{ top: docked ? "calc(max(env(safe-area-inset-top), 0.5rem) - 1.5rem)" : "calc(var(--card-h, 0px) - 1.5rem)" }}>
          <DeliveryStrip origin={origin} solid={stuck} closed={hoursOpen === false ? (opensAt ?? "later") : null} pickup={mode === "pickup"} restaurant={restaurant} directionsUrl={info.directionsUrl} />
        </div>
      ) : null}

      <div className="relative z-10 -mt-6 rounded-t-3xl bg-background pt-2">
      <PromoBanners banners={banners} />

      {categories.length > 0 ? (
        <nav
          aria-label="Categories"
          className="mt-4 flex scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden"
        >
          {categories.map((c) => {
            const img = circleImage(c)
            return (
              <Link
                key={c.id}
                href={`/category/${c.slug}`}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5"
              >
                <span className="relative flex size-16 items-center justify-center overflow-hidden rounded-full bg-muted">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={Restaurant01Icon}
                      strokeWidth={1.5}
                      className="size-6 text-muted-foreground"
                    />
                  )}
                </span>
                <span className="w-full truncate text-center text-xs">
                  {c.name}
                </span>
              </Link>
            )
          })}
        </nav>
      ) : null}

      {shown.length === 0 ? (
        <p className="mx-4 mt-8 rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {dishes.length === 0
            ? "Our menu is coming soon. Please check back shortly."
            : "No dishes match these filters."}
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
      ) : (
        <>
          <Row
            title={picks.length ? "Chef's Picks" : "Popular Now"}
            dishes={gems}
            canOrder={canOrder}
          />
          {onOffer.length > 0 ? (
            <Row
              title="Offers for You"
              subtitle={couponHint ?? "Fresh deals on dishes you will love"}
              dishes={onOffer}
              canOrder={canOrder}
              badge
            />
          ) : couponHint ? (
            <section className="mt-6 px-4">
              <h2 className="text-lg font-bold tracking-tight">
                Offers for You
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {couponHint}
              </p>
            </section>
          ) : null}
        </>
      )}
      <div
        className="sticky top-[var(--head-h,10rem)] z-30 mt-6 flex bg-background scroll-px-4 [scrollbar-width:none] gap-3 h-[3.25rem] shrink-0 items-center overflow-x-auto border-y border-border px-4 [&::-webkit-scrollbar]:hidden"
        aria-label="Filters"
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(PILL, sort !== "popular" && PILL_ON)}
          >
            <HugeiconsIcon
              icon={SortByDown01Icon}
              strokeWidth={2}
              className="size-4"
            />
            Sort
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-52">
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(v) => setSort(v as Sort)}
            >
              {(Object.keys(SORT_LABEL) as Sort[]).map((k) => (
                <DropdownMenuRadioItem key={k} value={k}>
                  {SORT_LABEL[k]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(PILL, diet !== "all" && PILL_ON)}>
            {diet === "all" ? null : (
              <VegMark veg={diet === "veg"} className="bg-background" />
            )}
            {DIET_LABEL[diet]}
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={2}
              className="size-4"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            <DropdownMenuRadioGroup
              value={diet}
              onValueChange={(v) => setDiet(v as Diet)}
            >
              <DropdownMenuRadioItem value="all">
                All dishes
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="veg">Veg</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="nonVeg">
                Non-veg
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          aria-pressed={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(PILL, open && PILL_ON)}
        >
          <HugeiconsIcon
            icon={Clock01Icon}
            strokeWidth={2}
            className="size-4"
          />
          Open Now
        </button>
        <button
          type="button"
          aria-pressed={offers}
          onClick={() => setOffers((v) => !v)}
          className={cn(PILL, offers && PILL_ON)}
        >
          <HugeiconsIcon
            icon={DiscountTag01Icon}
            strokeWidth={2}
            className="size-4"
          />
          Offers
        </button>
        <button
          type="button"
          aria-pressed={best}
          onClick={() => setBest((v) => !v)}
          className={cn(PILL, best && PILL_ON)}
        >
          <HugeiconsIcon
            icon={Medal01Icon}
            strokeWidth={2}
            className="size-4 text-primary"
          />
          Bestsellers
        </button>
        {anyFilter ? (
          <button
            type="button"
            onClick={clear}
            className={cn(PILL, "text-muted-foreground")}
          >
            <HugeiconsIcon
              icon={FilterHorizontalIcon}
              strokeWidth={2}
              className="size-4"
            />
            Clear
          </button>
        ) : null}
      </div>

      <div ref={sentinelRef} aria-hidden className="h-0" />
      <StoreTabs
        dishes={shown}
        categories={categories}
        canOrder={canOrder}
        info={info}
        reviews={reviews}
        rating={rating}
      />
      </div>
    </main>
  )
}

/** "Open" or "Closed" under a top tab. Nothing until the hours are known. */
function OpenTag({ open }: { open: boolean | null }) {
  if (open === null) return <span aria-hidden className="h-3" />
  return <span className={cn("-mt-0.5 text-[10px] leading-3 font-semibold", open ? "text-success" : "text-destructive")}>{open ? "Open" : "Closed"}</span>
}

// Kitchen time on top of the ride, and how wide the quoted range is. Rough on purpose: shown as a range, never as a promise.
const KITCHEN_MIN = 10
const RANGE_MIN = 10

/** "Deliver to <place> | in 15 - 25 minutes": a light band at the foot of the header. The time needs both pins, so it is left out until the guest has set a spot. */
function DeliveryStrip({
  origin,
  solid,
  closed,
  pickup,
  restaurant,
  directionsUrl,
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
    <div className={`relative isolate flex items-center justify-center gap-3 overflow-hidden ${solid ? "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--primary)_30%,var(--background)),color-mix(in_oklab,var(--primary)_88%,var(--foreground))_30%,color-mix(in_oklab,var(--primary)_88%,var(--foreground))_70%,color-mix(in_oklab,var(--primary)_30%,var(--background)))]" : "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--primary)_22%,transparent),color-mix(in_oklab,var(--primary)_88%,var(--foreground))_30%,color-mix(in_oklab,var(--primary)_88%,var(--foreground))_70%,color-mix(in_oklab,var(--primary)_22%,transparent))]"} px-4 pt-[calc(1.5rem+0.625rem)] pb-[calc(1.5rem+0.625rem)] text-sm text-primary-foreground shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--background)_55%,transparent)] ${solid ? "" : "backdrop-blur-xl backdrop-saturate-150"} before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-z-10 before:h-1/2 before:bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--background)_40%,transparent),transparent)] before:content-['']`}>
      {pickup ? (
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
