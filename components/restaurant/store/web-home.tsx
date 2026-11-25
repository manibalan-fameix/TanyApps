"use client"

import Link from "next/link"
import { Fragment, useMemo } from "react"

import { CategoryIcon } from "@/components/restaurant/category-icon"
import { DishTile } from "@/components/restaurant/store/dish-tile"
import { useWebStrip } from "@/components/restaurant/store/web-header"
import { PromoBanner } from "@/components/restaurant/store/promo-banners"
import { PRODUCT_SLOT, ScrollRow } from "@/components/restaurant/store/scroll-row"
import { StoreTabs } from "@/components/restaurant/store/store-tabs"
import type { StoreBanner } from "@/lib/restaurant/banners"
import { type HomeSectionId, type Homepage, rowProducts } from "@/lib/restaurant/homepage"
import { type StoreCategory, type StoreDish, offerPercent } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"
import { useStoreTerms } from "@/components/restaurant/store/terms-context"

type Props = {
  dishes: StoreDish[]
  categories: StoreCategory[]
  couponHint: string | null
  canOrder: boolean
  banners: StoreBanner[]
  layout: Homepage
}


/**
 * The desktop home: one top bar (brand, Delivery / Pickup, location, search, sign in, cart), then category circles, promo banners and
 * rows of dish tiles with arrows, then the categories. It is the wide version of the phone home screen and
 * uses the same tiles, banners and categories.
 */
export function StoreWebHome({ dishes, categories, couponHint, canOrder, banners, layout }: Props) {
  const terms = useStoreTerms()
  const strip = useWebStrip()

  const picks = dishes.filter((d) => d.isFeatured)
  const gems = rowProducts(layout.picks.productIds, dishes, dishes, (picks.length ? picks : dishes).slice(0, 12))
  const discounted = useMemo(() => dishes.filter((d) => offerPercent(d) !== null).slice(0, 12), [dishes])
  const onOffer = rowProducts(layout.offers.productIds, dishes, dishes, discounted)
  const circles = categories.filter((c) => !layout.hiddenCategoryIds.includes(c.id))
  const blocks: Record<HomeSectionId, React.ReactNode> = {
    banners: (
      <>
        {banners.length > 0 ? (
          <ScrollRow className="mt-4" dots={banners.length}>
            {banners.map((b, i) => (
              <li key={b.id} className={cn("shrink-0 snap-start", banners.length === 1 ? "w-full" : "w-[26rem]")}>
                <PromoBanner banner={b} look={i} className="h-44" />
              </li>
            ))}
          </ScrollRow>
        ) : null}
      </>
    ),
    categories: (
      <>
        {circles.length > 0 ? (
          <ScrollRow className="mt-6" listClassName="gap-3">
            {circles.map((c) => {
              return (
                <li key={c.id} className="shrink-0 snap-start">
                  <Link href={`/category/${c.slug}`} className="flex w-24 flex-col items-center gap-2 text-center">
                    <CategoryIcon name={c.name} className="size-20 rounded-full" iconClassName="size-9" />
                    <span className="w-full truncate text-sm">{c.name}</span>
                  </Link>
                </li>
              )
            })}
          </ScrollRow>
        ) : null}
      </>
    ),
    picks:
      dishes.length > 0 && gems.length > 0 ? (
        <ScrollRow className="mt-10" title={layout.picks.title || (picks.length ? terms.picksTitle : "Popular Now")}>
          {gems.map((d) => (
            <li key={d.id} className={PRODUCT_SLOT}>
              <DishTile dish={d} canOrder={canOrder} size="lg" />
            </li>
          ))}
        </ScrollRow>
      ) : null,
    offers:
      onOffer.length > 0 ? (
        <ScrollRow className="mt-10" title={layout.offers.title || "Offers for You"} subtitle={layout.offers.subtitle || (couponHint ?? `Fresh deals on ${terms.items} you will love`)}>
          {onOffer.map((d) => (
            <li key={d.id} className={PRODUCT_SLOT}>
              <DishTile dish={d} canOrder={canOrder} badge size="lg" />
            </li>
          ))}
        </ScrollRow>
      ) : null,
    catalogue: <StoreTabs dishes={dishes} categories={categories} canOrder={canOrder} />,
  }

  return (
    <main className={cn("hidden md:block", strip ? "[--head-h:7.5rem]" : "[--head-h:5rem]")}>
      <div className="relative z-10 bg-background pt-2 pb-24">
      <div className="mx-auto max-w-7xl">
        {dishes.length === 0 ? (
          <p className="mx-4 mt-10 rounded-2xl border bg-card p-10 text-center text-muted-foreground">Our {terms.catalogue.toLowerCase()} is coming soon. Please check back shortly.</p>
        ) : null}
        {layout.sections.map((section) => (section.visible ? <Fragment key={section.id}>{blocks[section.id]}</Fragment> : null))}
      </div>
      </div>
    </main>
  )
}
