"use client"

import { useStorePathname } from "@/components/restaurant/store/store-path"
import { useRouter } from "next/navigation"
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import { useStoreTerms } from "@/components/restaurant/store/terms-context"

const TITLES: Record<string, string> = {
  offers: "Offers",
  about: "Our story",
  contact: "Contact",
  favourites: "Saved",
  cart: "Cart",
  search: "Search",
  info: "Store info",
  "track-order": "Track order",
  checkout: "Checkout",
  addresses: "Saved addresses",
  account: "Account",
  "book-table": "Book a table",
}

/** Phone top bar for the inner pages: just the page title (the cart lives in the bottom bar). The home, categories and category pages have their own headers. */
export function StoreHeader() {
  const terms = useStoreTerms()
  const pathname = useStorePathname()
  const router = useRouter()

  // The phone home, categories and category pages have their own header or search bar.
  if (pathname === "/" || pathname === "/menu" || pathname.startsWith("/category/")) return null

  const first = pathname.split("/")[1] ?? ""
  const title = first === "menu" ? terms.catalogue : (TITLES[first] ?? first.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()))

  // Profile and the shop info page are reached from the home header, so they get a way back.
  const back = first === "profile" || first === "addresses" || first === "info" || first === "cart" || first === "checkout"

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
        {back ? (
          <button
            type="button"
            aria-label="Back"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
            className="-ml-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} className="size-6" />
          </button>
        ) : null}
        <h1 className={cn("truncate font-extrabold tracking-tight", first === "cart" || first === "checkout" ? "text-[22px]" : "text-2xl")}>{title}</h1>
      </header>
      <div className="h-14 md:hidden" aria-hidden="true" />
    </>
  )
}
