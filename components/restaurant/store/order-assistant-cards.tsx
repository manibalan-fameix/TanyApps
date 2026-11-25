"use client"

import { Add01Icon, MinusSignIcon, Restaurant01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { CategoryIcon } from "@/components/restaurant/category-icon"
import { useCart } from "@/components/restaurant/cart-provider"
import { formatRupees } from "@/lib/restaurant/menu"
import type { BotAction, BotMedia } from "@/lib/restaurant/order-bot"
import { offerPercent, type StoreDish } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"

/** A photo, or a quiet placeholder when the dish has none. */
function Photo({ src, className }: { src: string | null; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-muted-foreground/50">
          <HugeiconsIcon icon={Restaurant01Icon} strokeWidth={1.5} className="size-6" />
        </span>
      )}
    </div>
  )
}

/** The green / red veg mark every Indian menu uses. */
export function VegMark({ veg }: { veg: boolean }) {
  return (
    <span aria-label={veg ? "Veg" : "Non-veg"} className={cn("inline-flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border", veg ? "border-success" : "border-destructive")}>
      <span className={cn("size-1.5 rounded-full", veg ? "bg-success" : "bg-destructive")} />
    </span>
  )
}

const FRAME = "flex h-8 shrink-0 items-center rounded-lg border border-info bg-background text-xs font-bold text-info"

/** The same ADD / "- 1 +" control the store uses. Reads and writes the real cart, so it is always current. */
function Stepper({ itemId, name, portion, price }: { itemId: string; name: string; portion: string | null; price: number }) {
  const cart = useCart()
  const qty = cart.lines.find((l) => l.itemId === itemId && l.portion === portion)?.qty ?? 0
  if (qty === 0) {
    return (
      <button type="button" aria-label={`Add ${name}`} onClick={() => cart.add({ itemId, name, portion, price })} className={cn(FRAME, "min-w-16 justify-center px-3 transition-colors hover:bg-muted")}>
        ADD
      </button>
    )
  }
  return (
    <div className={FRAME}>
      <button type="button" aria-label={`Decrease ${name}`} onClick={() => cart.setQty(itemId, portion, qty - 1)} className="flex size-8 items-center justify-center rounded-l-lg hover:bg-muted">
        <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2.5} className="size-3.5" />
      </button>
      <span className="min-w-5 text-center text-sm" aria-live="polite">{qty}</span>
      <button type="button" aria-label={`Increase ${name}`} onClick={() => cart.setQty(itemId, portion, qty + 1)} className="flex size-8 items-center justify-center rounded-r-lg hover:bg-muted">
        <HugeiconsIcon icon={Add01Icon} strokeWidth={2.5} className="size-3.5" />
      </button>
    </div>
  )
}

/** One dish as a compact row: small photo, name and price, and its ADD / - 1 + control. */
function DishRow({ dish, canOrder, onPick }: { dish: StoreDish; canOrder: boolean; onPick: (a: BotAction, said: string) => void }) {
  const cart = useCart()
  const off = offerPercent(dish)
  const from = dish.portions.length ? Math.min(...dish.portions.map((p) => p.price)) : dish.price
  const sizes = dish.portions.length > 1
  const inCart = cart.lines.filter((l) => l.itemId === dish.id).reduce((n, l) => n + l.qty, 0)
  return (
    <li className="flex items-center gap-2.5 p-2">
      <Photo src={dish.imageUrl} className="size-14 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <VegMark veg={dish.isVeg} />
          <span className="line-clamp-2 text-[13px] leading-tight font-semibold">{dish.name}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
          <span className="font-bold">{sizes ? "from " : ""}{formatRupees(from)}</span>
          {off !== null && !dish.portions.length ? <span className="text-xs text-muted-foreground line-through">{formatRupees(dish.compareAt!)}</span> : null}
          {off !== null ? <span className="text-xs font-semibold text-success">{off}% off</span> : null}
        </p>
        {sizes && inCart > 0 ? <p className="text-xs text-muted-foreground">{inCart} in cart</p> : null}
      </div>
      {!canOrder ? null : sizes ? (
        <button type="button" onClick={() => onPick({ t: "dish", id: dish.id }, dish.name)} className={cn(FRAME, "h-auto min-w-16 flex-col justify-center px-3 py-1 leading-tight transition-colors hover:bg-muted")}>
          ADD
          <span className="text-[10px] font-medium text-muted-foreground">{dish.portions.length} sizes</span>
        </button>
      ) : (
        <Stepper itemId={dish.id} name={dish.name} portion={dish.portions[0]?.label ?? null} price={dish.portions[0]?.price ?? dish.price} />
      )}
    </li>
  )
}

/** The cart inside the chat: every line with - 1 +, and the running subtotal. Always the real cart. */
function CartCard({ dishes }: { dishes: StoreDish[] }) {
  const cart = useCart()
  if (cart.lines.length === 0) return <p className="rounded-2xl bg-card px-3 py-3 text-center text-sm text-muted-foreground shadow-sm">Your cart is empty.</p>
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
      <ul className="divide-y divide-border">
        {cart.lines.map((l) => (
          <li key={`${l.itemId}|${l.portion}`} className="flex items-center gap-2.5 p-2">
            <Photo src={dishes.find((d) => d.id === l.itemId)?.imageUrl ?? null} className="size-11 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[13px] leading-tight font-semibold">{l.name}</p>
              <p className="text-xs text-muted-foreground">{l.portion ? `${l.portion} · ` : ""}{formatRupees(l.price)} each</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Stepper itemId={l.itemId} name={l.name} portion={l.portion} price={l.price} />
              <span className="text-[13px] font-bold">{formatRupees(l.qty * l.price)}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="flex justify-between border-t border-border bg-muted/50 px-3 py-2 text-sm font-bold">
        <span>Subtotal</span>
        <span>{formatRupees(cart.subtotal)}</span>
      </p>
    </div>
  )
}

/** The rich part of a bot message: dish rows, category circles, sizes, or the cart. */
export function MediaBlock({ media, dishes, canOrder, onPick, live }: { media: BotMedia; dishes: StoreDish[]; canOrder: boolean; onPick: (a: BotAction, said: string) => void; live: boolean }) {
  switch (media.kind) {
    case "dishes":
      return (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-sm">
          {media.dishes.map((d) => (
            <DishRow key={d.id} dish={d} canOrder={canOrder} onPick={onPick} />
          ))}
        </ul>
      )

    case "categories":
      return (
        <div className="grid grid-cols-4 gap-x-1 gap-y-3 rounded-2xl bg-card px-2 py-3 shadow-sm">
          {media.items.map((c) => {
            return (
              <button
                key={c.id}
                type="button"
                disabled={!live}
                onClick={() => onPick({ t: "category", id: c.id }, c.name)}
                className="flex min-w-0 flex-col items-center gap-1 transition-opacity disabled:pointer-events-none disabled:opacity-60"
              >
                <CategoryIcon name={c.name} className="size-14 rounded-full" iconClassName="size-7" />
                <span className="line-clamp-2 w-full text-center text-[11px] leading-tight">{c.name}</span>
              </button>
            )
          })}
        </div>
      )

    case "portions":
      return (
        <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
          <div className="flex items-center gap-2.5 p-2">
            <Photo src={media.dish.imageUrl} className="size-12 shrink-0 rounded-lg" />
            <p className="flex min-w-0 items-center gap-1.5">
              <VegMark veg={media.dish.isVeg} />
              <span className="line-clamp-2 text-[13px] leading-tight font-semibold">{media.dish.name}</span>
            </p>
          </div>
          <ul className="divide-y divide-border border-t border-border">
            {(media.dish.portions.length ? media.dish.portions : [{ label: "", price: media.dish.price }]).map((p) => (
              <li key={p.label} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 text-[13px]">
                  <span className="font-semibold">{p.label || "Regular"}</span>
                  <span className="ml-2 font-bold">{formatRupees(p.price)}</span>
                </span>
                <Stepper itemId={media.dish.id} name={media.dish.name} portion={p.label || null} price={p.price} />
              </li>
            ))}
          </ul>
        </div>
      )

    case "cart":
      return <CartCard dishes={dishes} />
  }
}
