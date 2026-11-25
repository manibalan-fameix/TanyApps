"use client"

import Link from "next/link"
import { Discount01Icon, Restaurant01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useCart } from "@/components/restaurant/cart-provider"
import { DishTrigger } from "@/components/restaurant/store/dish-popup"
import { buttonVariants } from "@/components/ui/button"
import { formatRupees } from "@/lib/restaurant/menu"
import { gstOn } from "@/lib/restaurant/orders"
import type { StoreDish } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"

/** One line of the bill: label left, amount right, as on the checkout. */
function BillRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px] md:text-[15px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

/** One white block, edge to edge on the grey page: the same as the checkout. */
const CARD = "-mx-3 bg-card p-4 sm:-mx-6 sm:px-6"
const LABEL = "text-[13px] font-semibold tracking-[0.16em] text-muted-foreground uppercase md:text-[15px]"

/** The cart: the checkout's layout (white blocks on grey, pinned bottom sheet) around the cart's own content, the item cards and the order summary. */
export function CartPage({
  dishes,
  canOrder,
  minOrder,
  freeAbove,
  deliveryFee,
  gstPercent,
  signedIn,
}: {
  dishes: StoreDish[]
  canOrder: boolean
  minOrder: number
  freeAbove: number | null
  deliveryFee: number
  /** GST charged on the items, as a percent. */
  gstPercent: number
  /** Whether this browser is signed in to the shop with a phone number. */
  signedIn: boolean
}) {
  const cart = useCart()
  const byId = new Map(dishes.map((d) => [d.id, d]))
  if (cart.count === 0)
    return (
      <div className="-mx-4 flex flex-col items-center gap-4 bg-card px-4 py-16 text-center sm:-mx-6">
        <div>
          <h2 className="text-xl font-medium">Your cart is empty</h2>
          <p className="mt-2 text-sm text-muted-foreground">Add menu items to see them here.</p>
        </div>
        <Link href="/menu" className={cn(buttonVariants({ size: "lg" }), "rounded-full")}>
          Browse Menu
        </Link>
      </div>
    )

  const short = minOrder > cart.subtotal ? minOrder - cart.subtotal : 0
  const free = freeAbove !== null && cart.subtotal >= freeAbove
  const checkout = canOrder && short === 0
  // What the items were marked down from (lines with portions have no single compare-at price), and the GST on the items.
  const offerSaved = cart.lines.reduce((sum, l) => {
    const d = byId.get(l.itemId)
    return d && d.portions.length === 0 && d.compareAt !== null && d.compareAt > l.price ? sum + (d.compareAt - l.price) * l.qty : sum
  }, 0)
  const gst = gstOn(cart.subtotal, gstPercent)
  const total = cart.subtotal + gst
  // Everything the guest saves here: the offers on the items, plus the delivery fee when it is waived.
  const saved = offerSaved + (free && deliveryFee > 0 ? deliveryFee : 0)

  return (
    <div className="-mx-4 flex flex-col gap-3 bg-muted px-3 py-3 pb-[calc(11rem+var(--safe-area-inset-bottom,0px))] sm:-mx-6 sm:px-6">
      <section className={cn(CARD, "grid gap-3")} aria-label="Items in your cart">
        <h2 className={LABEL}>Your order</h2>
        <ul className="divide-y">
          {cart.lines.map((l) => {
            const dish = byId.get(l.itemId)
            return (
              <li key={`${l.itemId}:${l.portion}`} className="flex items-center gap-2.5 py-3 first:pt-0 last:pb-0">
                <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {dish?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={dish.imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted-foreground/50">
                      <HugeiconsIcon icon={Restaurant01Icon} strokeWidth={1.5} className="size-6" />
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <DishTrigger id={l.itemId} className="line-clamp-2 text-left text-sm leading-snug font-bold md:text-base">{l.name}</DishTrigger>
                  {l.portion ? <p className="text-sm text-muted-foreground md:text-base">{l.portion}</p> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {/* Quantity pill, the same look as the ADD control on the menu. */}
                  <div className="flex h-8 shrink-0 items-center rounded-lg border border-info bg-info/5 text-info">
                    <button type="button" aria-label={`Remove one ${l.name}`} onClick={() => cart.setQty(l.itemId, l.portion, l.qty - 1)} className="grid size-8 place-items-center text-lg font-semibold md:text-xl">−</button>
                    <span className="w-5 text-center text-sm font-semibold md:text-base" aria-live="polite">{l.qty}</span>
                    <button type="button" aria-label={`Add one ${l.name}`} onClick={() => cart.setQty(l.itemId, l.portion, l.qty + 1)} className="grid size-8 place-items-center text-lg font-semibold md:text-xl">+</button>
                  </div>
                  <p className="flex shrink-0 items-baseline justify-end gap-1.5 text-base font-semibold md:text-lg">
                    {dish && dish.portions.length === 0 && dish.compareAt !== null && dish.compareAt > l.price ? <span className="text-sm font-normal text-muted-foreground line-through md:text-base">{formatRupees(dish.compareAt * l.qty)}</span> : null}
                    {formatRupees(l.price * l.qty)}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className={cn(CARD, "grid gap-3")} aria-labelledby="cart-bill">
        <h2 id="cart-bill" className={LABEL}>Bill details</h2>
        <dl className="grid [&>div]:py-3 [&>div:first-child]:pt-1 [&>div+div]:border-t [&>div+div]:border-dashed">
          <BillRow label="Item total" value={<>{offerSaved > 0 ? <span className="mr-1.5 text-muted-foreground line-through">{formatRupees(cart.subtotal + offerSaved)}</span> : null}{formatRupees(cart.subtotal)}</>} />
          {gst > 0 ? <BillRow label={`GST (${gstPercent}%)`} value={formatRupees(gst)} /> : null}
          <BillRow
            label="Delivery fee"
            value={free || deliveryFee === 0 ? <>{free && deliveryFee > 0 ? <span className="mr-1.5 text-muted-foreground line-through">{formatRupees(deliveryFee)}</span> : null}<span className="font-semibold text-success">FREE</span></> : `${formatRupees(deliveryFee)} on delivery`}
          />
          <div className="flex items-baseline justify-between gap-3 text-[15px] font-bold md:text-[17px]">
            <dt>To pay</dt>
            <dd>{offerSaved > 0 ? <span className="mr-2 text-[13px] font-normal text-muted-foreground line-through md:text-[15px]">{formatRupees(total + offerSaved)}</span> : null}{formatRupees(total)}</dd>
          </div>
        </dl>
        {short > 0 ? <p role="alert" className="text-xs text-destructive md:text-sm">Add {formatRupees(short)} more to reach the {formatRupees(minOrder)} minimum order.</p> : null}
        {!canOrder ? <p className="text-xs text-muted-foreground md:text-sm">We are not taking online orders right now.</p> : null}
        {freeAbove !== null && !free ? <p className="text-xs text-muted-foreground md:text-sm">Add {formatRupees(freeAbove - cart.subtotal)} more for free delivery.</p> : null}
      </section>

      {/* Pinned at the bottom, like the checkout's pay sheet. */}
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto grid max-w-4xl gap-2 rounded-t-3xl bg-card px-4 pt-3 pb-[calc(0.75rem+var(--safe-area-inset-bottom,0px))] shadow-[0_-8px_24px_rgb(0_0_0/0.08)]">
        <div role="note" className="flex items-center justify-center gap-2 rounded-xl bg-success/10 px-4 py-2.5 text-sm text-success md:text-base">
          <HugeiconsIcon icon={Discount01Icon} strokeWidth={2} className="size-4 shrink-0" />
          {saved > 0 ? (
            <span>
              <span className="opacity-80">You saved </span>
              <span className="font-bold">{formatRupees(saved)}</span>
              <span className="opacity-80"> on this order</span>
            </span>
          ) : (
            <span>
              <span className="opacity-80">You saved </span>
              <span className="font-bold">{formatRupees(0)}</span>
              <span className="opacity-80"> so far. Add a coupon to save</span>
            </span>
          )}
        </div>
        {signedIn ? (
          <Link
            href="/checkout"
            aria-disabled={!checkout}
            className={cn(buttonVariants({ size: "lg" }), "h-14 rounded-full bg-info text-lg font-semibold text-background hover:bg-info/90", !checkout && "pointer-events-none opacity-50")}
          >
            Proceed to Checkout | {formatRupees(total)}
          </Link>
        ) : (
          // Signed-out guests log in first (phone number), then land on the checkout.
          <a
            href={`/api/t/auth/start?next=${encodeURIComponent("/checkout")}`}
            aria-disabled={!checkout}
            className={cn(buttonVariants({ size: "lg" }), "h-14 rounded-full bg-info text-lg font-semibold text-background hover:bg-info/90", !checkout && "pointer-events-none opacity-50")}
          >
            Login and proceed to pay
          </a>
        )}
      </div>
    </div>
  )
}
