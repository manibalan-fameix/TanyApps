"use client"

import Link from "next/link"
import { Add01Icon, ArrowRight01Icon, Restaurant01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

import { useCart } from "@/components/restaurant/cart-provider"
import { VegMark } from "@/components/restaurant/store/dish-card"
import { Card } from "@/components/ui/card"
import { formatRupees } from "@/lib/restaurant/menu"
import type { StoreDish } from "@/lib/restaurant/storefront"
import { offerPercent } from "@/lib/restaurant/storefront"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"

/**
 * One row of a vertical menu list: name, two lines of description, price and a badge on the left, the photo on the
 * right with a round + button over its corner. A dish with portions opens its page to choose one; others add straight away.
 */
export function DishListCard({ dish, canOrder }: { dish: StoreDish; canOrder: boolean }) {
  const cart = useCart()
  const [added, setAdded] = useState(false)
  const off = offerPercent(dish)
  const hasPortions = dish.portions.length > 1
  const from = dish.portions.length ? Math.min(...dish.portions.map((p) => p.price)) : dish.price
  const href = `/dish/${dish.id}`

  function add() {
    cart.add({ itemId: dish.id, name: dish.name, portion: dish.portions[0]?.label ?? null, price: from })
    toast.success(`${dish.name} added`)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1500)
  }

  return (
    <Card className={cn("flex-row items-stretch justify-between gap-3 rounded-xl border border-border py-0 shadow-none ring-0", !dish.isAvailable && "opacity-70")}>
      <Link href={href} className="flex min-w-0 flex-1 flex-col gap-1 py-3 pl-3.5 focus-visible:outline-none">
        <span className="flex items-center gap-1.5">
          <VegMark veg={dish.isVeg} className="size-3.5" />
          <span className="truncate text-sm font-semibold">{dish.name}</span>
        </span>
        {dish.description ? <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{dish.description}</span> : null}
        <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1.5">
          <span className="text-sm font-medium">
            {hasPortions ? "from " : ""}
            {formatRupees(from)}
          </span>
          {off !== null && dish.portions.length === 0 ? <span className="text-xs text-muted-foreground line-through">{formatRupees(dish.compareAt!)}</span> : null}
          {!dish.isAvailable ? (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium">Sold out</span>
          ) : off !== null ? (
            <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">{off}% off</span>
          ) : dish.isFeatured ? (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Best Seller</span>
          ) : null}
        </span>
      </Link>

      <div className="relative w-28 shrink-0 overflow-hidden rounded-r-xl bg-muted">
        <Link href={href} aria-label={`View ${dish.name}`} className="block size-full">
          {dish.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dish.imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
              <HugeiconsIcon icon={Restaurant01Icon} strokeWidth={1.5} className="size-7" />
            </span>
          )}
        </Link>
        {canOrder && dish.isAvailable ? (
          hasPortions ? (
            <Link href={href} aria-label={`Choose a portion of ${dish.name}`} className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full bg-background text-foreground shadow-md">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
            </Link>
          ) : (
            <button type="button" onClick={add} aria-label={`Add ${dish.name}`} className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full bg-background text-foreground shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
              <HugeiconsIcon icon={added ? Tick02Icon : Add01Icon} strokeWidth={2} className="size-4" />
            </button>
          )
        ) : null}
      </div>
    </Card>
  )
}

/** A section title with the dishes listed under it as full-width cards. */
export function DishListSection({ title, href, total, dishes, canOrder }: { title: string; href?: string; total?: number; dishes: StoreDish[]; canOrder: boolean }) {
  return (
    <section className="mt-6 px-4">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {dishes.map((d) => (
          <li key={d.id}>
            <DishListCard dish={d} canOrder={canOrder} />
          </li>
        ))}
      </ul>
      {href && total && total > dishes.length ? (
        <Link href={href} className="mt-3 flex items-center justify-center gap-1.5 rounded-full border border-border py-2 text-sm font-medium">
          See all {total}
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
        </Link>
      ) : null}
    </section>
  )
}
