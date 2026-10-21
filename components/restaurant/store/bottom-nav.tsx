"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { FavouriteIcon, Home01Icon, Restaurant01Icon, Search01Icon, ShoppingCart01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useCart } from "@/components/restaurant/cart-provider"
import { cn } from "@/lib/utils"

const ITEMS = [
  { href: "/", label: "Home", icon: Home01Icon },
  { href: "/menu", label: "Menu", icon: Restaurant01Icon },
  { href: "/search", label: "Search", icon: Search01Icon },
  { href: "/favourites", label: "Saved", icon: FavouriteIcon },
  { href: "/cart", label: "Cart", icon: ShoppingCart01Icon },
]

/** Phone-only bottom bar, the same five tabs as the Lala Sweets site. */
export function StoreBottomNav() {
  const pathname = usePathname()
  const cart = useCart()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[var(--safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Mobile navigation">
      <ul className="grid h-16 grid-cols-5">
        {ITEMS.map((item) => {
          const on = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn("relative flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors", on ? "font-medium text-primary" : "text-muted-foreground")}
              >
                <HugeiconsIcon icon={item.icon} strokeWidth={2} className="size-5" />
                {item.label}
                {item.href === "/cart" && cart.count > 0 ? (
                  <span className="absolute top-1.5 left-1/2 ml-2 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">
                    {cart.count}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
