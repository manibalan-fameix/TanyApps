"use client"

import Link from "next/link"

import { DishTile } from "@/components/restaurant/store/dish-tile"
import { PRODUCT_SLOT, ScrollRow } from "@/components/restaurant/store/scroll-row"
import type { StoreDish } from "@/lib/restaurant/storefront"

/**
 * A category on the store page: its title with "See all", and a sideways row of tiles under it, the same row the
 * home page uses for "Offers for You". Phones swipe a row of small tiles; wider screens get the large tiles with arrows.
 */
export function DishListSection({ title, href, dishes, canOrder }: { title: string; href?: string; total?: number; dishes: StoreDish[]; canOrder: boolean }) {
  return (
    <section className="mt-6">
      <div className="flex items-end justify-between gap-3 px-4">
        <h2 className="text-lg font-bold tracking-tight md:text-2xl">{title}</h2>
        {href ? <Link href={href} className="shrink-0 text-sm font-semibold text-info hover:underline">See all</Link> : null}
      </div>
      <ul className="mt-3 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
        {dishes.map((d) => (
          <li key={d.id} className="w-28 shrink-0 snap-start">
            <DishTile dish={d} canOrder={canOrder} badge />
          </li>
        ))}
      </ul>
      <ScrollRow className="mt-3 hidden md:block">
        {dishes.map((d) => (
          <li key={d.id} className={PRODUCT_SLOT}>
            <DishTile dish={d} canOrder={canOrder} badge size="lg" />
          </li>
        ))}
      </ScrollRow>
    </section>
  )
}
