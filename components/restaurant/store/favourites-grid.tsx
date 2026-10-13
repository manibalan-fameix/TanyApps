"use client"

import { DishCard } from "@/components/restaurant/store/dish-card"
import { useFavourites } from "@/components/restaurant/store/favourites"
import { StoreEmpty, DISH_GRID } from "@/components/restaurant/store/ui"
import type { StoreDish } from "@/lib/restaurant/storefront"

export function FavouritesGrid({ dishes, canOrder }: { dishes: StoreDish[]; canOrder: boolean }) {
  const fav = useFavourites()
  const saved = dishes.filter((d) => fav.has(d.id))
  if (saved.length === 0) return <StoreEmpty title="No favourites yet" body="Tap the heart on a dish to save it here for next time." action={{ href: "/menu", label: "Browse the menu" }} />
  return (
    <div className={DISH_GRID}>
      {saved.map((d) => (
        <DishCard key={d.id} dish={d} canOrder={canOrder} />
      ))}
    </div>
  )
}
