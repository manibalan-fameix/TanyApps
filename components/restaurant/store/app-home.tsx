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
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3.5 text-sm whitespace-nowrap text-foreground transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
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

  // The tabs and category chips stick just under the pinned top bar, whatever height it has (a long name wraps to two lines).
  useEffect(() => {
    const head = headRef.current
    const main = mainRef.current
    if (!head || !main) return
    const apply = () =>
      main.style.setProperty(
        "--head-h",
        `calc(${head.offsetHeight}px + var(--safe-area-inset-top, 0px))`
      )
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(head)
    return () => ro.disconnect()
  }, [])

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
    <main ref={mainRef} className="pb-40 md:hidden">
      <div className="bg-primary px-4 pt-[calc(0.75rem+var(--safe-area-inset-top,0px))] pb-3">
        <div className="flex items-center justify-center gap-3 pb-4">
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
                className="line-clamp-2 text-3xl leading-tight font-bold tracking-tight text-primary-foreground [-webkit-text-stroke:0.75px_currentColor]"
              >
                {restaurant}
              </Link>
            </div>
          </div>
        </div>
        {modes.length > 1 ? (
          <div
            role="radiogroup"
            aria-label="Order type"
            className="relative isolate flex w-full rounded-full p-0.5"
          >
            {/* Light fill and outline are separate see-through layers (opacity works on every browser, unlike mixed colours). */}
            <span
              aria-hidden
              className="absolute inset-0 -z-10 rounded-full bg-primary-foreground opacity-15"
            />
            <span
              aria-hidden
              className="absolute inset-0 -z-10 rounded-full border border-primary-foreground opacity-40"
            />
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => pick(m)}
                className={cn(
                  "flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-medium transition-colors",
                  mode === m
                    ? "bg-primary-foreground text-primary"
                    : "text-primary-foreground"
                )}
              >
                <HugeiconsIcon
                  icon={MODE_ICON[m]}
                  strokeWidth={2}
                  className="size-4 shrink-0"
                />
                {FULFILMENT_LABEL[m]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {/* Only the search and the delivery strip stay pinned; the brand name and the order-type switch scroll away. The fill above covers the status bar. */}
      <div
        ref={headRef}
        className="sticky top-[var(--safe-area-inset-top,0px)] z-40 grid gap-3 bg-primary px-4 pt-1 pb-3 shadow-md before:absolute before:bottom-full before:left-0 before:h-[var(--safe-area-inset-top,0px)] before:w-full before:bg-primary after:absolute after:top-full after:left-0 after:h-2 after:w-full after:bg-muted"
      >
        <form
          action="/search"
          role="search"
          className="relative isolate flex h-11 items-center gap-2.5 rounded-full px-4 text-primary-foreground"
        >
          <span
            aria-hidden
            className="absolute inset-0 -z-10 rounded-full bg-foreground opacity-20"
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
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-primary-foreground"
          />
        </form>
        {mode === "delivery" ? <DeliveryStrip origin={origin} /> : null}
      </div>

      <PromoBanners banners={banners} />

      <div
        className="mt-3 flex scroll-px-4 [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 [&::-webkit-scrollbar]:hidden"
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

      {categories.length > 0 ? (
        <nav
          aria-label="Categories"
          className="mt-5 flex scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden"
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
      <StoreTabs
        dishes={shown}
        categories={categories}
        canOrder={canOrder}
        info={info}
        reviews={reviews}
        rating={rating}
      />
    </main>
  )
}

// Kitchen time on top of the ride, and how wide the quoted range is. Rough on purpose: shown as a range, never as a promise.
const KITCHEN_MIN = 10
const RANGE_MIN = 10

/** "Deliver to <place> | in 15 - 25 minutes": a light band at the foot of the header. The time needs both pins, so it is left out until the guest has set a spot. */
function DeliveryStrip({
  origin,
}: {
  origin: { lat: number; lng: number } | null
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
    <div className="-mx-4 mt-1 -mb-3 flex items-center justify-center gap-3 bg-muted px-4 pt-3.5 pb-1.5 text-sm">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-w-0 truncate text-primary"
        aria-label="Change delivery location"
      >
        <HugeiconsIcon
          icon={Location01Icon}
          strokeWidth={2}
          className="mr-1 inline size-4 align-text-bottom"
        />
        {place ? (
          <>
            <span className="text-muted-foreground">Deliver to </span>
            <span className="font-medium">{place}</span>
          </>
        ) : (
          <span className="font-medium">Set your delivery location</span>
        )}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className="ml-0.5 inline size-4 align-text-bottom"
        />
      </button>
      {lo !== null ? (
        <>
          <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
          <span className="shrink-0 font-bold">
            in {lo} - {lo + RANGE_MIN} minutes
          </span>
        </>
      ) : null}
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
