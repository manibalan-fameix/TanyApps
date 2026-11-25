"use client"

import Link from "next/link"
import { useState } from "react"
import { Add01Icon, MinusSignIcon, ShoppingCart01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "@/lib/toast"

import { useCart } from "@/components/restaurant/cart-provider"
import { DishImage, PriceBlock } from "@/components/restaurant/store/dish-card"
import { FavouriteButton } from "@/components/restaurant/store/favourites"
import { Eyebrow } from "@/components/restaurant/store/ui"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { formatRupees } from "@/lib/restaurant/menu"
import type { StoreDish } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"
import { useStoreTerms } from "@/components/restaurant/store/terms-context"

export function DishDetails({ dish, canOrder, category, variant = "page" }: { dish: StoreDish; canOrder: boolean; category: { name: string; slug: string } | null; variant?: "page" | "modal" }) {
  const terms = useStoreTerms()
  const modal = variant === "modal"
  const Heading = modal ? "h2" : "h1"
  const cart = useCart()
  const [portion, setPortion] = useState(dish.portions[0]?.label ?? "")
  const [qty, setQty] = useState(1)
  const [label, setLabel] = useState("Add to cart")
  const chosen = dish.portions.find((p) => p.label === portion) ?? dish.portions[0]
  const unit = chosen?.price ?? dish.price
  const disabled = !dish.isAvailable || !canOrder
  const d = dish.details
  const facts = (
    [
      ["Brand", d.brand],
      ["Pack size", d.packSize ?? d.unit],
      ["Shelf life", d.shelfLife],
      ["Origin", d.origin],
      ["Barcode (EAN)", d.barcode],
      ["HSN code", d.hsn],
      ["GST", d.gst === undefined ? undefined : `${d.gst}%`],
    ] as [string, string | undefined][]
  ).filter((f): f is [string, string] => Boolean(f[1]))

  function add() {
    cart.add({ itemId: dish.id, name: dish.name, portion: chosen?.label ?? null, price: unit }, qty)
    toast.success(`${qty} × ${dish.name} added`)
    setLabel("Added to cart")
    window.setTimeout(() => setLabel("Add to cart"), 1800)
  }

  return (
    <div className={cn("grid gap-6", modal ? "md:grid-cols-2 md:gap-8" : "gap-8 lg:grid-cols-[0.9fr_1.1fr]")}>
      <div className="relative">
        {modal && dish.imageUrl ? (
          // In-flow image with its own height: iOS Safari collapses an aspect-ratio box whose only child is absolutely positioned.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dish.imageUrl} alt={dish.name} className="block h-80 w-full rounded-2xl border bg-muted object-cover md:aspect-square md:h-auto" />
        ) : (
          <DishImage src={dish.imageUrl} eager className={cn("rounded-2xl border", modal ? "h-80 w-full md:aspect-square md:h-auto" : "aspect-square")} />
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          {dish.isFeatured ? <Badge>Bestseller</Badge> : null}
          {!dish.isAvailable ? <Badge variant="secondary">Sold out</Badge> : null}
        </div>
        <FavouriteButton dishId={dish.id} name={dish.name} className={modal ? "absolute right-3 bottom-3" : "absolute top-4 right-4"} />
      </div>

      <section className={modal ? "md:pr-10" : undefined}>
        {category ? <Link href={`/category/${category.slug}`} className="text-sm text-muted-foreground hover:text-foreground">{category.name}</Link> : null}
        <Heading className={cn("flex items-start gap-3 font-bold tracking-tight", modal ? "mt-2 text-xl md:mt-3 md:text-3xl" : "mt-3 text-3xl")}>
          {dish.name}
        </Heading>
        <div className={cn("mt-2 md:mt-4", modal ? "text-lg md:text-2xl" : "text-2xl")}>
          <PriceBlock dish={dish} price={unit * qty} />
        </div>
        {dish.description ? <p className={cn("text-muted-foreground", modal ? "mt-2 line-clamp-3 text-sm leading-6 md:mt-4 md:line-clamp-none md:text-base md:leading-7" : "mt-4 leading-7")}>{dish.description}</p> : null}

        {dish.portions.length > 0 ? (
          <div className={cn("grid gap-3 rounded-2xl border border-border bg-card p-4", modal ? "mt-4 md:mt-6" : "mt-6")}>
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

        <div className={cn("mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4 text-sm sm:grid-cols-2", modal && "hidden md:grid")}>
          <div>
            <Eyebrow>Availability</Eyebrow>
            <p className="mt-1 text-muted-foreground">{dish.isAvailable ? "Available" : "Sold out"}</p>
          </div>
          {dish.portions.length > 0 || terms.diet ? (
            <div>
              <Eyebrow>{dish.portions.length > 0 ? (terms.units.length ? "Selected size" : "Selected portion") : "Type"}</Eyebrow>
              <p className="mt-1 text-muted-foreground">{dish.portions.length > 0 ? (chosen?.label ?? "") : dish.isVeg ? "Vegetarian" : "Non-vegetarian"}</p>
            </div>
          ) : null}
        </div>

        {facts.length > 0 ? (
          <div className={cn("mt-6 rounded-2xl border border-border bg-card p-4", modal && "hidden md:block")}>
            <Eyebrow>Product details</Eyebrow>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 font-medium break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        <div className={cn("mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4", modal && "hidden md:grid")}>
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

        {modal && canOrder ? (
          <div className="mt-4 flex items-center gap-3 md:hidden">
            <div className="inline-flex shrink-0 items-center rounded-full border border-border bg-background">
              <button type="button" className="inline-flex size-10 items-center justify-center disabled:opacity-50" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={disabled || qty <= 1} aria-label="Decrease quantity">
                <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="size-4" />
              </button>
              <span className="min-w-8 text-center text-sm font-medium" aria-live="polite">{qty}</span>
              <button type="button" className="inline-flex size-10 items-center justify-center disabled:opacity-50" onClick={() => setQty((q) => Math.min(20, q + 1))} disabled={disabled || qty >= 20} aria-label="Increase quantity">
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
              </button>
            </div>
            <Button type="button" size="lg" className="flex-1 gap-2" disabled={disabled} onClick={add}>
              <HugeiconsIcon icon={ShoppingCart01Icon} strokeWidth={2} className="size-4" />
              {dish.isAvailable ? `${label} · ${formatRupees(unit * qty)}` : "Sold out"}
            </Button>
          </div>
        ) : null}

        <div className={cn("mt-6", modal && canOrder && "hidden md:block")}>
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
