"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Call02Icon, FavouriteIcon, Menu01Icon, Package01Icon, ShoppingCart01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { STORE_CONTENT } from "@/components/restaurant/store/layout"
import { useCart } from "@/components/restaurant/cart-provider"
import { useFavourites } from "@/components/restaurant/store/favourites"
import { LocationChip } from "@/components/restaurant/store/location"
import { buttonVariants } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"


const LINKS = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/offers", label: "Offers" },
  { href: "/about", label: "Our Story" },
  { href: "/contact", label: "Contact" },
]

function IconLink({ href, label, count, children }: { href: string; label: string; count?: number; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={count ? `${label} (${count})` : label}
      className="relative inline-flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {children}
      {count ? (
        <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  )
}

/** Floating pill header: brand on the left, page links in the middle, favourites / orders / cart on the right. */
export function StoreHeader({ name, logoUrl, phone }: { name: string; logoUrl: string | null; phone: string | null }) {
  const pathname = usePathname()
  const cart = useCart()
  const fav = useFavourites()
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`))

  const home = pathname === "/"

  return (
    <>
    <header className="fixed inset-x-0 top-0 z-50">
      <div className={cn(STORE_CONTENT, "py-3 sm:py-4")}>
        <nav
          aria-label="Primary navigation"
          className={cn(
            "grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-full border px-3 py-2 shadow-sm backdrop-blur-md sm:px-4",
            home ? "border-border/40 bg-background/85 shadow-lg" : "border-border/60 bg-background/90"
          )}
        >
          <Link href="/" aria-label={`${name} home`} className="flex min-w-0 items-center gap-2 justify-self-start">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-9 shrink-0 rounded-full bg-muted object-contain" />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate text-base font-semibold tracking-tight sm:text-lg">{name}</span>
          </Link>

          <ul className="hidden items-center gap-1 justify-self-center lg:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active(l.href) ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-2 text-sm font-semibold transition-colors hover:bg-primary/10 hover:text-primary",
                    active(l.href) ? "bg-primary/10 text-primary" : "text-muted-foreground"
                  )}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-1.5 justify-self-end sm:gap-2">
            <LocationChip />
            <span className="hidden sm:inline-flex">
              <IconLink href="/favourites" label="Favourites" count={fav.ids.length}>
                <HugeiconsIcon icon={FavouriteIcon} strokeWidth={2} className="size-5" />
              </IconLink>
            </span>
            <span className="hidden sm:inline-flex">
              <IconLink href="/track-order" label="Track order">
                <HugeiconsIcon icon={Package01Icon} strokeWidth={2} className="size-5" />
              </IconLink>
            </span>
            <IconLink href="/cart" label="Cart" count={cart.count}>
              <HugeiconsIcon icon={ShoppingCart01Icon} strokeWidth={2} className="size-5" />
            </IconLink>
            {phone ? (
              <a href={`tel:${phone}`} className={cn(buttonVariants({ size: "sm" }), "hidden font-semibold lg:inline-flex")}>
                <HugeiconsIcon icon={Call02Icon} strokeWidth={2} className="size-4" />
                Call us
              </a>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Open menu"
                className="inline-flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none lg:hidden"
              >
                <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                {[...LINKS, { href: "/favourites", label: "Favourites" }, { href: "/track-order", label: "Track order" }].map((l) => (
                  <DropdownMenuItem key={l.href} render={<Link href={l.href} />}>
                    {l.label}
                  </DropdownMenuItem>
                ))}
                {phone ? <DropdownMenuItem render={<a href={`tel:${phone}`} />}>Call us</DropdownMenuItem> : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>
      </div>
    </header>
    {home ? null : <div className="h-20 sm:h-[92px] md:h-24" aria-hidden="true" />}
    </>
  )
}
