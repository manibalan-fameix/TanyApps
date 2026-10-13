"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowRight01Icon, ShoppingCart01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useCart } from "@/components/restaurant/cart-provider"
import { formatRupees } from "@/lib/restaurant/menu"

/** Floating "View Cart" pill once something is in the cart. Hidden where the page has its own primary action. */
export function ViewCartBar() {
  const pathname = usePathname()
  const cart = useCart()
  if (cart.count === 0 || pathname.startsWith("/checkout") || pathname.startsWith("/cart")) return null
  return (
    <div className="fixed bottom-20 left-1/2 z-50 w-[min(17rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl bg-primary p-1 shadow-2xl md:bottom-5">
      <Link href="/cart" aria-label={`View cart with ${cart.count} items`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-3 py-2 text-primary-foreground">
        <span className="flex size-9 items-center justify-center rounded-full bg-primary-foreground text-primary">
          <HugeiconsIcon icon={ShoppingCart01Icon} strokeWidth={2} className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-lg leading-none font-semibold">View Cart</span>
          <span className="mt-1 block text-xs font-medium">
            {cart.count} {cart.count === 1 ? "item" : "items"} · {formatRupees(cart.subtotal)}
          </span>
        </span>
        <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-5" />
      </Link>
    </div>
  )
}
