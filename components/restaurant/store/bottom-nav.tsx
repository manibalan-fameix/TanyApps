"use client"

import Link from "next/link"
import { useStorePathname } from "@/components/restaurant/store/store-path"
import {
  CalendarCheckIn01Icon,
  FavouriteIcon,
  GridViewIcon,
  Home01Icon,
  ShoppingCart01Icon,
  Store01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useCart } from "@/components/restaurant/cart-provider"
import { cn } from "@/lib/utils"

const INFO = { href: "/info", label: "Info", icon: Store01Icon }
/** Shops that run the monthly-groceries offer swap Info for it; their Info page stays reachable from the shop name at the top. */
const MONTHLY = { href: "/monthly", label: "Monthly", icon: CalendarCheckIn01Icon }

const items = (monthly: boolean) => [
  { href: "/", label: "Home", icon: Home01Icon },
  { href: "/menu", label: "Categories", icon: GridViewIcon },
  monthly ? MONTHLY : INFO,
  { href: "/favourites", label: "Saved", icon: FavouriteIcon },
  { href: "/cart", label: "Cart", icon: ShoppingCart01Icon },
]

/** Phone-only bottom bar, the same five tabs as the Lala Sweets site. */
export function StoreBottomNav({ monthly = false }: { monthly?: boolean }) {
  const pathname = useStorePathname()
  const cart = useCart()
  // Checkout has its own pinned pay bar at the bottom, so the tab bar steps aside there.
  if (pathname.startsWith("/checkout") || pathname === "/cart") return null
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[var(--safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Mobile navigation"
    >
      <ul className="grid h-16 grid-cols-5">
        {items(monthly).map((item) => {
          const on =
            item.href === "/"
              ? pathname === "/"
              : item.href === "/menu"
                ? pathname.startsWith("/menu") ||
                  pathname.startsWith("/category")
                : pathname.startsWith(item.href)
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors",
                  on ? "bg-muted font-semibold text-info" : "text-muted-foreground"
                )}
              >
                <HugeiconsIcon
                  icon={item.icon}
                  strokeWidth={2}
                  className={cn(
                    "size-5",
                    on && "[&_path]:fill-current"
                  )}
                />
                {item.label}
                {on ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-[3px] bg-info"
                  />
                ) : null}
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
