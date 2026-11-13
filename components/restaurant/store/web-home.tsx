"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowDown01Icon, Location01Icon, Restaurant01Icon, Scooter01Icon, Search01Icon, ShoppingBag01Icon, Store01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useCart } from "@/components/restaurant/cart-provider"
import { DishTile } from "@/components/restaurant/store/dish-tile"
import { readFulfilmentPref, writeFulfilmentPref } from "@/components/restaurant/store/fulfilment-pref"
import { useGuestLocation } from "@/components/restaurant/store/location"
import { PromoBanner } from "@/components/restaurant/store/promo-banners"
import { ScrollRow } from "@/components/restaurant/store/scroll-row"
import { type StoreInfo, type StoreReview, StoreTabs } from "@/components/restaurant/store/store-tabs"
import type { StoreBanner } from "@/lib/restaurant/banners"
import { type Fulfilment, FULFILMENT_LABEL } from "@/lib/restaurant/settings"
import { type StoreCategory, type StoreDish, offerPercent } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"

const MODE_ICON = { delivery: Scooter01Icon, pickup: Store01Icon, dine_in: Restaurant01Icon } as const

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
}

/**
 * The desktop home: one top bar (brand, Delivery / Pickup, location, search, sign in, cart), then category circles, promo banners and
 * rows of dish tiles with arrows, then the Categories / About / Reviews tabs. It is the wide version of the phone home screen and
 * uses the same tiles, banners and tabs.
 */
export function StoreWebHome({ restaurant, logoUrl, fulfilments, dishes, categories, rating, couponHint, canOrder, info, reviews, banners }: Props) {
  const modes: Fulfilment[] = fulfilments.filter((f) => f !== "dine_in")
  const [mode, setMode] = useState<Fulfilment | null>(modes[0] ?? null)
  const cart = useCart()
  const { location, setOpen } = useGuestLocation()

  // Read after mount so the server and first client render match.
  useEffect(() => {
    const saved = readFulfilmentPref()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && modes.includes(saved)) setMode(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const picks = dishes.filter((d) => d.isFeatured)
  const gems = (picks.length ? picks : dishes).slice(0, 12)
  const onOffer = useMemo(() => dishes.filter((d) => offerPercent(d) !== null).slice(0, 12), [dishes])
  const circleImage = (c: StoreCategory) => dishes.find((d) => d.categoryId === c.id && d.imageUrl)?.imageUrl ?? null
  const place = location ? location.area || location.city || "Your location" : "Set location"

  return (
    <main className="hidden pb-24 [--head-h:4rem] md:block">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Link href="/" aria-label={`${restaurant} home`} className="mr-2 flex min-w-0 shrink-0 items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-9 shrink-0 rounded-full bg-muted object-contain" />
            ) : null}
            <span className="max-w-[16rem] truncate text-2xl font-bold tracking-tight text-primary [-webkit-text-stroke:0.6px_currentColor]">{restaurant}</span>
          </Link>

          {modes.length > 1 ? (
            <div role="radiogroup" aria-label="Order type" className="flex shrink-0 rounded-full border border-border p-0.5">
              {modes.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => {
                    setMode(m)
                    writeFulfilmentPref(m)
                  }}
                  className={cn("flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors", mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                >
                  <HugeiconsIcon icon={MODE_ICON[m]} strokeWidth={2} className="size-4" />
                  {FULFILMENT_LABEL[m]}
                </button>
              ))}
            </div>
          ) : null}

          <button type="button" onClick={() => setOpen(true)} aria-label={`Delivery location: ${place}. Change`} className="flex h-9 min-w-0 shrink items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-medium">
            <HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="size-4 shrink-0 text-primary" />
            <span className="hidden max-w-40 truncate lg:inline">{place}</span>
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3.5 shrink-0 text-muted-foreground" />
          </button>

          <Link href="/search" aria-label="Search" className="ml-auto inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border lg:hidden">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-5" />
          </Link>
          <form action="/search" role="search" className="ml-auto hidden h-10 w-full max-w-sm min-w-0 items-center gap-2.5 rounded-full border border-border bg-background px-4 lg:flex">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-4.5 shrink-0" />
            <input name="q" type="search" enterKeyHint="search" aria-label="Search dishes" placeholder={`Search ${restaurant}`} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </form>

          <Link href="/account" className="inline-flex h-10 shrink-0 items-center rounded-full border border-border px-5 text-sm font-medium transition-colors hover:bg-muted">
            Sign in
          </Link>
          <Link href="/cart" aria-label={cart.count ? `Cart (${cart.count})` : "Cart"} className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted">
            <HugeiconsIcon icon={ShoppingBag01Icon} strokeWidth={2} className="size-6" />
            {cart.count ? (
              <span className="absolute top-0 right-0 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">{cart.count > 99 ? "99+" : cart.count}</span>
            ) : null}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl">
        {categories.length > 0 ? (
          <ScrollRow className="mt-6" listClassName="gap-3">
            {categories.map((c) => {
              const img = circleImage(c)
              return (
                <li key={c.id} className="shrink-0 snap-start">
                  <Link href={`/category/${c.slug}`} className="flex w-24 flex-col items-center gap-2 text-center">
                    <span className="relative flex size-20 items-center justify-center overflow-hidden rounded-full bg-muted">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                      ) : (
                        <HugeiconsIcon icon={Restaurant01Icon} strokeWidth={1.5} className="size-8 text-muted-foreground" />
                      )}
                    </span>
                    <span className="w-full truncate text-sm">{c.name}</span>
                  </Link>
                </li>
              )
            })}
          </ScrollRow>
        ) : null}

        {banners.length > 0 ? (
          <ScrollRow className="mt-6">
            {banners.map((b) => (
              <li key={b.id} className={cn("shrink-0 snap-start", banners.length === 1 ? "w-full" : "w-[26rem]")}>
                <PromoBanner banner={b} className="h-44" />
              </li>
            ))}
          </ScrollRow>
        ) : null}

        {dishes.length === 0 ? (
          <p className="mx-4 mt-10 rounded-2xl border bg-card p-10 text-center text-muted-foreground">Our menu is coming soon. Please check back shortly.</p>
        ) : (
          <>
            <ScrollRow className="mt-10" title={picks.length ? "Chef's Picks" : "Popular Now"}>
              {gems.map((d) => (
                <li key={d.id} className="w-60 shrink-0 snap-start">
                  <DishTile dish={d} canOrder={canOrder} size="lg" />
                </li>
              ))}
            </ScrollRow>
            {onOffer.length > 0 ? (
              <ScrollRow className="mt-10" title="Offers for You" subtitle={couponHint ?? "Fresh deals on dishes you will love"}>
                {onOffer.map((d) => (
                  <li key={d.id} className="w-60 shrink-0 snap-start">
                    <DishTile dish={d} canOrder={canOrder} badge size="lg" />
                  </li>
                ))}
              </ScrollRow>
            ) : null}
          </>
        )}

        <StoreTabs dishes={dishes} categories={categories} canOrder={canOrder} info={info} reviews={reviews} rating={rating} />
      </div>
    </main>
  )
}
