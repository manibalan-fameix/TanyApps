"use client"

import Link from "next/link"
import { useState } from "react"
import { Add01Icon, MinusSignIcon, ShoppingCart01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "@/lib/toast"

import { useCart } from "@/components/restaurant/cart-provider"
import { DishImage, PriceBlock, VegMark } from "@/components/restaurant/store/dish-card"
import { FavouriteButton } from "@/components/restaurant/store/favourites"
import { Eyebrow } from "@/components/restaurant/store/ui"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { formatRupees } from "@/lib/restaurant/menu"
import type { StoreDish } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"

export function DishDetails({ dish, canOrder, category }: { dish: StoreDish; canOrder: boolean; category: { name: string; slug: string } | null }) {
  const cart = useCart()
  const [portion, setPortion] = useState(dish.portions[0]?.label ?? "")
  const [qty, setQty] = useState(1)
  const [label, setLabel] = useState("Add to cart")
  const chosen = dish.portions.find((p) => p.label === portion) ?? dish.portions[0]
  const unit = chosen?.price ?? dish.price
  const disabled = !dish.isAvailable || !canOrder

  function add() {
    cart.add({ itemId: dish.id, name: dish.name, portion: chosen?.label ?? null, price: unit }, qty)
    toast.success(`${qty} × ${dish.name} added`)
    setLabel("Added to cart")
    window.setTimeout(() => setLabel("Add to cart"), 1800)
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="relative">
        <DishImage src={dish.imageUrl} className="aspect-square rounded-2xl border" />
        <div className="absolute top-4 left-4 flex gap-2">
          {dish.isFeatured ? <Badge>Bestseller</Badge> : null}
          {!dish.isAvailable ? <Badge variant="secondary">Sold out</Badge> : null}
        </div>
        <FavouriteButton dishId={dish.id} name={dish.name} className="absolute top-4 right-4" />
      </div>

      <section>
        {category ? <Link href={`/category/${category.slug}`} className="text-sm text-muted-foreground hover:text-foreground">{category.name}</Link> : null}
        <h1 className="mt-3 flex items-start gap-3 text-3xl font-semibold tracking-tight">
          <VegMark veg={dish.isVeg} className="mt-2.5" />
          {dish.name}
        </h1>
        <div className="mt-4 text-2xl">
          <PriceBlock dish={dish} price={unit * qty} />
        </div>
        {dish.description ? <p className="mt-4 leading-7 text-muted-foreground">{dish.description}</p> : null}

        {dish.portions.length > 0 ? (
          <div className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4">
            <Eyebrow>Portion</Eyebrow>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Portion">
              {dish.portions.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  role="radio"
                  aria-checked={p.label === portion}
                  onClick={() => setPortion(p.label)}
                  className={cn(buttonVariants({ variant: p.label === portion ? "default" : "outline", size: "sm" }), "rounded-full")}
                >
                  {p.label} · {formatRupees(p.price)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4 text-sm sm:grid-cols-2">
          <div>
            <Eyebrow>Availability</Eyebrow>
            <p className="mt-1 text-muted-foreground">{dish.isAvailable ? "Available" : "Sold out"}</p>
          </div>
          <div>
            <Eyebrow>{dish.portions.length > 0 ? "Selected portion" : "Type"}</Eyebrow>
            <p className="mt-1 text-muted-foreground">{dish.portions.length > 0 ? (chosen?.label ?? "") : dish.isVeg ? "Vegetarian" : "Non-vegetarian"}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4">
          <Eyebrow>Quantity</Eyebrow>
          <div className="inline-flex w-fit items-center rounded-full border border-border bg-background">
            <button type="button" className="inline-flex size-10 items-center justify-center hover:bg-muted disabled:opacity-50" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={disabled || qty <= 1} aria-label="Decrease quantity">
              <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="size-4" />
            </button>
            <span className="min-w-12 px-4 text-center text-sm font-medium" aria-live="polite">{qty}</span>
            <button type="button" className="inline-flex size-10 items-center justify-center hover:bg-muted disabled:opacity-50" onClick={() => setQty((q) => Math.min(20, q + 1))} disabled={disabled || qty >= 20} aria-label="Increase quantity">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
            </button>
          </div>
        </div>

        <div className="mt-6">
          {canOrder ? (
            <Button type="button" size="lg" className="gap-2" disabled={disabled} onClick={add}>
              <HugeiconsIcon icon={ShoppingCart01Icon} strokeWidth={2} className="size-4" />
              {dish.isAvailable ? label : "Sold out"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">We are not taking online orders right now. Please call us.</p>
          )}
        </div>
      </section>
    </div>
  )
}
