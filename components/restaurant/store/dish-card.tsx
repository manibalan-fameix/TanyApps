"use client"

import Link from "next/link"
import { useState } from "react"
import { Add01Icon, ArrowRight01Icon, Medal01Icon, Restaurant01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "sonner"

import { useCart } from "@/components/restaurant/cart-provider"
import { FavouriteButton } from "@/components/restaurant/store/favourites"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { formatRupees } from "@/lib/restaurant/menu"
import { type StoreDish, offerPercent } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"

export function DishImage({ src, className }: { src: string | null; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
          <HugeiconsIcon icon={Restaurant01Icon} className="size-10" />
        </div>
      )}
    </div>
  )
}

export function VegMark({ veg, className }: { veg: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={veg ? "Vegetarian" : "Non-vegetarian"}
      className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border-2", veg ? "border-success" : "border-destructive", className)}
    >
      <span className={cn("size-1.5 rounded-full", veg ? "bg-success" : "bg-destructive")} />
    </span>
  )
}

export function PriceBlock({ dish, price }: { dish: StoreDish; price?: number }) {
  const shown = price ?? (dish.portions.length ? Math.min(...dish.portions.map((p) => p.price)) : dish.price)
  const off = offerPercent(dish)
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 font-medium">
      {dish.portions.length > 1 && price === undefined ? <span className="text-xs font-normal text-muted-foreground">from</span> : null}
      <span>{formatRupees(shown)}</span>
      {off !== null ? (
        <>
          {dish.portions.length === 0 ? <span className="text-sm font-normal text-muted-foreground line-through">{formatRupees(dish.compareAt!)}</span> : null}
          <Badge variant="secondary">{off}% off</Badge>
        </>
      ) : null}
    </p>
  )
}

/**
 * The dish card, built like the motors listing card: a 4:3 photo with chips and a heart over it, a title and price
 * row, a strip of chips, and a footer. Portions are chips you can tap to choose; Add sits in the footer.
 */
export function DishCard({ dish, canOrder }: { dish: StoreDish; canOrder: boolean }) {
  const cart = useCart()
  const [portion, setPortion] = useState(dish.portions[0]?.label ?? "")
  const [added, setAdded] = useState(false)
  const chosen = dish.portions.find((p) => p.label === portion) ?? dish.portions[0]
  const off = offerPercent(dish)
  const unit = chosen?.price ?? dish.price

  function add() {
    cart.add({ itemId: dish.id, name: dish.name, portion: chosen?.label ?? null, price: unit })
    toast.success(`${dish.name}${chosen ? ` (${chosen.label})` : ""} added`)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1500)
  }

  return (
    <Card className={cn("group h-full gap-0 rounded-[16px] border border-border py-0 shadow-none transition-all duration-300 hover:-translate-y-1 hover:shadow-xl", !dish.isAvailable && "opacity-75")}>
      <div className="relative aspect-4/3 w-full overflow-hidden bg-muted">
        <Link href={`/dish/${dish.id}`} aria-label={`View ${dish.name}`} className="block size-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden">
          {dish.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dish.imageUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <HugeiconsIcon icon={Restaurant01Icon} strokeWidth={1.5} className="size-10" />
            </div>
          )}
        </Link>
        <div className="absolute top-3 left-3 flex items-center gap-2">
          {dish.categoryName ? <Badge className="bg-background/90 text-foreground shadow-sm backdrop-blur-sm">{dish.categoryName}</Badge> : null}
          {!dish.isAvailable ? <Badge variant="secondary">Sold out</Badge> : off !== null ? <Badge className="bg-primary text-primary-foreground">{off}% off</Badge> : dish.isFeatured ? <Badge className="bg-primary text-primary-foreground">Bestseller</Badge> : null}
        </div>
        <FavouriteButton dishId={dish.id} name={dish.name} className="absolute top-3 right-3 shadow-sm backdrop-blur-sm" />
      </div>

      <Link href={`/dish/${dish.id}`} className="flex flex-1 flex-col gap-4 p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold tracking-tight">{dish.name}</h3>
            <p className="mt-1 truncate text-sm text-muted-foreground">{dish.description || (dish.isVeg ? "Vegetarian" : "Non-vegetarian")}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold tracking-tight">{formatRupees(unit)}</p>
            {off !== null && dish.portions.length === 0 ? (
              <p className="mt-0.5 text-xs text-muted-foreground line-through">{formatRupees(dish.compareAt!)}</p>
            ) : dish.portions.length > 1 ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{chosen?.label}</p>
            ) : null}
          </div>
        </div>
      </Link>

      <ul className="mx-4 flex flex-wrap gap-2 border-y border-border/60 py-3">
        <li className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
          <VegMark veg={dish.isVeg} />
          {dish.isVeg ? "Veg" : "Non-veg"}
        </li>
        {dish.portions.length > 1
          ? dish.portions.map((p) => (
              <li key={p.label}>
                <button
                  type="button"
                  aria-pressed={p.label === chosen?.label}
                  onClick={() => setPortion(p.label)}
                  className={cn("flex items-center rounded-full px-2.5 py-1.5 text-xs transition-colors", p.label === chosen?.label ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")}
                >
                  {p.label} · {formatRupees(p.price)}
                </button>
              </li>
            ))
          : null}
      </ul>

      <div className="flex items-center justify-between gap-3 p-4">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <HugeiconsIcon icon={dish.isFeatured ? Medal01Icon : Restaurant01Icon} strokeWidth={2} className="size-4 shrink-0 text-primary" />
          <span className="truncate">{!dish.isAvailable ? "Sold out right now" : dish.isFeatured ? "Guest favourite" : "Freshly made"}</span>
        </span>
        {canOrder ? (
          <Button type="button" size="sm" className="gap-1.5" disabled={!dish.isAvailable} onClick={add}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-3.5" />
            {added ? "Added" : "Add"}
          </Button>
        ) : (
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
        )}
      </div>
    </Card>
  )
}
