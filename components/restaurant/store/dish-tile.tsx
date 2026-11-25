"use client"

import { DishTrigger } from "@/components/restaurant/store/dish-popup"
import { Restaurant01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { AddControl } from "@/components/restaurant/store/add-control"
import { formatRupees } from "@/lib/restaurant/menu"
import { type StoreDish, offerPercent } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"

/** "sm" is the phone tile (about 112 px wide), "lg" the desktop one. The look is the same, only the sizes change. */
export type TileSize = "sm" | "lg"

/** A tile: photo with an ADD button over it, a price pill, then a two-line name and a quiet line below. */
export function DishTile({ dish, canOrder, badge, size = "sm" }: { dish: StoreDish; canOrder: boolean; badge?: boolean; size?: TileSize }) {
  const lg = size === "lg"
  const off = offerPercent(dish)
  const from = dish.portions.length ? Math.min(...dish.portions.map((p) => p.price)) : dish.price
  const options = dish.portions.length > 1
  const portion = dish.portions[0]?.label ?? null

  return (
    <div className={cn(!dish.isAvailable && "opacity-70")}>
      <div className={cn("relative aspect-square overflow-hidden border border-foreground/10 bg-muted", lg ? "rounded-2xl" : "rounded-xl")}>
        <DishTrigger id={dish.id} aria-label={`View ${dish.name}`} className="block size-full">
          {dish.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dish.imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-muted-foreground/50">
              <HugeiconsIcon icon={Restaurant01Icon} strokeWidth={1.5} className={lg ? "size-10" : "size-7"} />
            </span>
          )}
        </DishTrigger>
        {badge && off !== null ? (
          <span className={cn("pointer-events-none absolute rounded-md bg-success font-semibold text-background shadow-sm", lg ? "top-2.5 left-2.5 px-2 py-1 text-xs" : "top-1.5 left-1.5 px-1.5 py-0.5 text-[11px]")}>{off}% off</span>
        ) : !dish.isAvailable ? (
          <span className={cn("pointer-events-none absolute rounded-md bg-background/90 font-medium", lg ? "top-2.5 left-2.5 px-2 py-1 text-xs" : "top-1.5 left-1.5 px-1.5 py-0.5 text-[11px]")}>Sold out</span>
        ) : null}
        {canOrder && dish.isAvailable ? (
          <AddControl dish={dish} portion={portion} price={from} optionsCount={options ? dish.portions.length : undefined} size={lg ? "lg" : "sm"} className={cn("absolute", lg ? "right-2.5 bottom-2.5" : "right-1.5 bottom-1.5")} />
        ) : null}
      </div>
      <p className={cn("flex items-baseline gap-1.5", lg ? "mt-2.5" : "mt-1.5")}>
        <span className={cn("rounded-md bg-info font-bold text-background", lg ? "px-2 py-0.5 text-base leading-tight" : "px-1.5 py-0.5 text-sm leading-tight")}>{formatRupees(from)}</span>
        {off !== null && dish.portions.length === 0 ? <span className={cn("text-muted-foreground line-through", lg ? "text-sm" : "text-xs")}>{formatRupees(dish.compareAt!)}</span> : null}
      </p>
      <DishTrigger id={dish.id} className={cn("mt-1 line-clamp-2 text-left leading-snug font-bold", lg ? "text-base" : "text-xs")}>
        {dish.name}
      </DishTrigger>
      {dish.categoryName ? <p className={cn("mt-0.5 truncate text-muted-foreground", lg ? "text-sm" : "text-[11px]")}>{dish.categoryName}</p> : null}
    </div>
  )
}
