"use client"

import Link from "next/link"
import { Add01Icon, Delete02Icon, MinusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useCart } from "@/components/restaurant/cart-provider"
import { DishImage } from "@/components/restaurant/store/dish-card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { formatRupees } from "@/lib/restaurant/menu"
import type { StoreDish } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"

/** Cart, laid out like the Lala Sweets cart: item cards on the left, order summary on the right, sticky bar on phones. */
export function CartPage({
  dishes,
  canOrder,
  minOrder,
  freeAbove,
  deliveryFee,
}: {
  dishes: StoreDish[]
  canOrder: boolean
  minOrder: number
  freeAbove: number | null
  deliveryFee: number
}) {
  const cart = useCart()
  const byId = new Map(dishes.map((d) => [d.id, d]))

  if (cart.count === 0)
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div>
            <h2 className="text-xl font-medium">Your cart is empty</h2>
            <p className="mt-2 text-sm text-muted-foreground">Add menu items to see them here.</p>
          </div>
          <Link href="/menu" className={cn(buttonVariants())}>
            Browse Menu
          </Link>
        </CardContent>
      </Card>
    )

  const short = minOrder > cart.subtotal ? minOrder - cart.subtotal : 0
  const free = freeAbove !== null && cart.subtotal >= freeAbove
  const checkout = canOrder && short === 0
  const cta = cn(buttonVariants({ size: "lg" }), !checkout && "pointer-events-none opacity-50")

  return (
    <div className="pb-28 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid gap-3">
          {cart.lines.map((l) => {
            const dish = byId.get(l.itemId)
            return (
              <Card key={`${l.itemId}:${l.portion}`} className="border-primary/10">
                <CardContent className="flex items-center gap-4">
                  <DishImage src={dish?.imageUrl ?? null} className="size-20 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    {dish?.categoryName ? <Badge variant="outline" className="text-[10px]">{dish.categoryName}</Badge> : null}
                    <Link href={`/dish/${l.itemId}`} className="mt-1 block truncate text-base font-medium hover:underline">{l.name}</Link>
                    {l.portion ? <p className="mt-0.5 text-xs text-muted-foreground">{l.portion}</p> : null}
                    <p className="mt-1 text-base font-semibold text-primary">{formatRupees(l.price * l.qty)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="inline-flex items-center rounded-full border border-border bg-background">
                      <button type="button" aria-label={`Decrease ${l.name}`} className="inline-flex size-8 items-center justify-center hover:bg-muted" onClick={() => cart.setQty(l.itemId, l.portion, l.qty - 1)}>
                        <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} className="size-3.5" />
                      </button>
                      <span className="min-w-8 text-center text-sm font-medium" aria-live="polite">{l.qty}</span>
                      <button type="button" aria-label={`Increase ${l.name}`} className="inline-flex size-8 items-center justify-center hover:bg-muted" onClick={() => cart.setQty(l.itemId, l.portion, l.qty + 1)}>
                        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-3.5" />
                      </button>
                    </div>
                    <button type="button" aria-label={`Remove ${l.name} from cart`} className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-destructive" onClick={() => cart.setQty(l.itemId, l.portion, 0)}>
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-3.5" />
                      Remove
                    </button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card className="h-fit border-primary/10">
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatRupees(cart.subtotal)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Delivery charge</span>
              <span className="font-medium">{free || deliveryFee === 0 ? "Free" : `${formatRupees(deliveryFee)} on delivery`}</span>
            </div>
            <Separator />
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-base font-medium">Total</span>
              <span className="text-2xl font-semibold text-primary">{formatRupees(cart.subtotal)}</span>
            </div>
            {short > 0 ? <p role="alert" className="text-xs text-destructive">Add {formatRupees(short)} more to reach the {formatRupees(minOrder)} minimum order.</p> : null}
            {!canOrder ? <p className="text-xs text-muted-foreground">We are not taking online orders right now.</p> : null}
            {freeAbove !== null && !free ? <p className="text-xs text-muted-foreground">Add {formatRupees(freeAbove - cart.subtotal)} more for free delivery.</p> : null}
            <Link href="/checkout" aria-disabled={!checkout} className={cn(cta, "mt-1 hidden w-full lg:inline-flex")}>
              Proceed to Checkout
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-40 border-t border-border bg-card/97 p-3 shadow-2xl backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-semibold text-primary">{formatRupees(cart.subtotal)}</p>
          </div>
          <Link href="/checkout" aria-disabled={!checkout} className={cn(cta, "gap-2 px-6")}>
            Proceed to Checkout
          </Link>
        </div>
      </div>
    </div>
  )
}
