"use client"

import { Add01Icon, MinusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useCart } from "@/components/restaurant/cart-provider"
import { DishTrigger } from "@/components/restaurant/store/dish-popup"
import type { StoreDish } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"

export type AddSize = "sm" | "md" | "lg"

const SIZE = {
  sm: { box: "text-xs", btn: "size-7", icon: "size-3", add: "min-w-14 px-2 py-1.5", opt: "text-[10px]" },
  md: { box: "text-sm", btn: "size-8", icon: "size-3.5", add: "min-w-16 px-3 py-1.5", opt: "text-[10px]" },
  lg: { box: "text-sm", btn: "size-9", icon: "size-4", add: "min-w-20 px-3 py-2", opt: "text-xs" },
} as const

const FOCUS = "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"

/**
 * The one add-to-cart control every dish card uses: a blue outlined "+ ADD" that becomes a "- 1 +" stepper once the
 * dish is in the cart. With `optionsCount` (several portions and none chosen) it opens the dish to pick one instead.
 * The caller positions it with `className`.
 */
export function AddControl({ dish, portion, price, optionsCount, size = "md", className }: { dish: StoreDish; portion: string | null; price: number; optionsCount?: number; size?: AddSize; className?: string }) {
  const cart = useCart()
  const s = SIZE[size]
  const qty = cart.lines.find((l) => l.itemId === dish.id && l.portion === portion)?.qty ?? 0
  const frame = cn("flex items-center rounded-lg border border-info bg-background font-bold text-info shadow-sm", s.box, className)

  if (optionsCount) {
    return (
      <DishTrigger id={dish.id} className={cn(frame, "flex-col justify-center leading-tight", s.add, FOCUS)}>
        <span className="flex items-center gap-1">
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2.5} className={s.icon} />
          ADD
        </span>
        <span className={cn("font-medium text-muted-foreground", s.opt)}>{optionsCount} options</span>
      </DishTrigger>
    )
  }

  if (qty > 0) {
    return (
      <div className={frame}>
        <button type="button" aria-label={`Decrease ${dish.name}`} className={cn("flex items-center justify-center rounded-l-lg", s.btn, FOCUS)} onClick={() => cart.setQty(dish.id, portion, qty - 1)}>
          <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2.5} className={s.icon} />
        </button>
        <span className="min-w-4 text-center" aria-live="polite">{qty}</span>
        <button type="button" aria-label={`Increase ${dish.name}`} className={cn("flex items-center justify-center rounded-r-lg", s.btn, FOCUS)} onClick={() => cart.setQty(dish.id, portion, qty + 1)}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2.5} className={s.icon} />
        </button>
      </div>
    )
  }

  return (
    <button type="button" aria-label={`Add ${dish.name}`} className={cn(frame, "justify-center gap-1", s.add, FOCUS)} onClick={() => cart.add({ itemId: dish.id, name: dish.name, portion, price })}>
      <HugeiconsIcon icon={Add01Icon} strokeWidth={2.5} className={s.icon} />
      ADD
    </button>
  )
}
