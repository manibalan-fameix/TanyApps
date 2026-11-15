"use client"

import Link from "next/link"
import { useState } from "react"
import { Restaurant01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useCart } from "@/components/restaurant/cart-provider"
import { VegMark } from "@/components/restaurant/store/dish-card"
import { formatRupees } from "@/lib/restaurant/menu"
import { type StoreDish, offerPercent } from "@/lib/restaurant/storefront"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"

/** "sm" is the phone tile (about 112 px wide), "lg" the desktop one. The look is the same, only the sizes change. */
export type TileSize = "sm" | "lg"

/** A tile: photo with the veg mark and an ADD button over it, a price pill, then a two-line name and a quiet line below. */
export function DishTile({ dish, canOrder, badge, size = "sm" }: { dish: StoreDish; canOrder: boolean; badge?: boolean; size?: TileSize }) {
  const lg = size === "lg"
  const cart = useCart()
  const [added, setAdded] = useState(false)
  const off = offerPercent(dish)
  const from = dish.portions.length ? Math.min(...dish.portions.map((p) => p.price)) : dish.price
  const options = dish.portions.length > 1
  const href = `/dish/${dish.id}`

  function add() {
    cart.add({ itemId: dish.id, name: dish.name, portion: dish.portions[0]?.label ?? null, price: from })
    toast.success(`${dish.name} added`)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1500)
  }

  const addClass = cn("absolute flex flex-col items-center rounded-lg border border-primary bg-background font-bold text-primary shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none", lg ? "right-2.5 bottom-2.5 min-w-20 px-3 py-1.5 text-sm leading-tight" : "right-1.5 bottom-1.5 min-w-14 px-2 py-1 text-xs leading-tight")
  return (
    <div className={cn(!dish.isAvailable && "opacity-70")}>
      <div className={cn("relative aspect-square overflow-hidden bg-muted", lg ? "rounded-2xl" : "rounded-xl")}>
        <Link href={href} aria-label={`View ${dish.name}`} className="block size-full">
          {dish.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dish.imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-muted-foreground/50">
              <HugeiconsIcon icon={Restaurant01Icon} strokeWidth={1.5} className={lg ? "size-10" : "size-7"} />
            </span>
          )}
        </Link>
        <span className={cn("pointer-events-none absolute rounded-[4px] bg-background p-px", lg ? "bottom-2.5 left-2.5" : "bottom-1.5 left-1.5")}>
          <VegMark veg={dish.isVeg} className={lg ? "size-4" : "size-3.5"} />
        </span>
        {badge && off !== null ? (
          <span className={cn("pointer-events-none absolute rounded-md bg-success/15 font-medium text-success backdrop-blur-sm", lg ? "top-2.5 left-2.5 px-2 py-1 text-xs" : "top-1.5 left-1.5 px-1.5 py-0.5 text-[11px]")}>{off}% off</span>
        ) : !dish.isAvailable ? (
          <span className={cn("pointer-events-none absolute rounded-md bg-background/90 font-medium", lg ? "top-2.5 left-2.5 px-2 py-1 text-xs" : "top-1.5 left-1.5 px-1.5 py-0.5 text-[11px]")}>Sold out</span>
        ) : null}
        {canOrder && dish.isAvailable ? (
          options ? (
            <Link href={href} className={addClass}>
              ADD
              <span className={cn("font-medium text-muted-foreground", lg ? "text-xs" : "text-[10px]")}>{dish.portions.length} options</span>
            </Link>
          ) : (
            <button type="button" onClick={add} aria-label={`Add ${dish.name}`} className={cn(addClass, "justify-center", lg ? "py-2" : "py-1.5")}>
              {added ? "ADDED" : "ADD"}
            </button>
          )
        ) : null}
      </div>
      <p className={cn("flex items-baseline gap-1.5", lg ? "mt-2.5" : "mt-1.5")}>
        <span className={cn("rounded-md bg-success font-bold text-background", lg ? "px-2 py-0.5 text-base leading-tight" : "px-1.5 py-0.5 text-sm leading-tight")}>{formatRupees(from)}</span>
        {off !== null && dish.portions.length === 0 ? <span className={cn("text-muted-foreground line-through", lg ? "text-sm" : "text-xs")}>{formatRupees(dish.compareAt!)}</span> : null}
      </p>
      <Link href={href} className={cn("mt-1 line-clamp-2 leading-snug font-semibold", lg ? "text-base" : "text-xs")}>
        {dish.name}
      </Link>
      {dish.categoryName ? <p className={cn("mt-0.5 truncate text-muted-foreground", lg ? "text-sm" : "text-[11px]")}>{dish.categoryName}</p> : null}
    </div>
  )
}
