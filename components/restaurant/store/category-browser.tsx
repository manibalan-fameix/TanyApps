"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { CategoryIcon } from "@/components/restaurant/category-icon"
import { PromoBanners } from "@/components/restaurant/store/promo-banners"
import { Input } from "@/components/ui/input"
import { DishTile } from "@/components/restaurant/store/dish-tile"
import { StoreEmpty } from "@/components/restaurant/store/ui"
import { useStoreTerms } from "@/components/restaurant/store/terms-context"
import type { StoreBanner } from "@/lib/restaurant/banners"
import {
  filterDishes,
  type StoreCategory,
  type StoreDish,
} from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"

/**
 * Phone category browser: a rail of categories on the left (photo + name) and a two-column grid of the selected
 * category's items on the right. The rail and the grid scroll on their own, under a title row with search.
 * `activeSlug` null means "All".
 */
export function CategoryBrowser({
  dishes,
  categories,
  canOrder,
  activeSlug,
  banners = [],
}: {
  dishes: StoreDish[]
  categories: StoreCategory[]
  canOrder: boolean
  activeSlug: string | null
  banners?: StoreBanner[]
}) {
  const terms = useStoreTerms()
  const active = categories.find((c) => c.slug === activeSlug) ?? null
  const [query, setQuery] = useState("")
  const inCategory = active
    ? dishes.filter((d) => d.categoryId === active.id)
    : dishes
  const shown = filterDishes(inCategory, query, new Set())
  const title = active?.name ?? `All ${terms.items}`
  const railRef = useRef<HTMLUListElement>(null)

  // Keep the selected category in view when the page opens on one far down the rail.
  useEffect(() => {
    railRef.current
      ?.querySelector("[aria-current=page]")
      ?.scrollIntoView({ block: "center" })
  }, [activeSlug])

  const rail = [
    ...categories.map((c) => ({
      key: c.id,
      href: `/category/${c.slug}`,
      name: c.name,
      image:
        dishes.find((d) => d.categoryId === c.id && d.imageUrl)?.imageUrl ??
        null,
      on: c.id === active?.id,
    })),
  ]

  return (
    <div className="flex h-[calc(100dvh-4rem-var(--safe-area-inset-bottom,0px))] min-h-0 flex-col overflow-hidden md:hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 pt-[calc(0.75rem+var(--safe-area-inset-top,0px))] pb-3">
        <Link
          href="/menu"
          aria-label="Back to categories"
          className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-full"
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            className="size-5"
          />
        </Link>
        <h1 className="sr-only">{title}</h1>
        <div className="relative min-w-0 flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search in ${title}`}
            aria-label={`Search in ${title}`}
            className="h-10 w-full rounded-xl pl-9"
          />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[84px_minmax(0,1fr)]">
        <ul
          ref={railRef}
          className="min-h-0 overflow-y-auto border-r border-border bg-card/60 pb-4"
          aria-label="Categories"
        >
          {rail.map((c) => (
            <li key={c.key}>
              <Link
                href={c.href}
                aria-current={c.on ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-1.5 px-1.5 py-3 text-center text-xs leading-tight",
                  c.on
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-muted-foreground"
                )}
              >
                {c.on ? (
                  <span
                    aria-hidden
                    className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary"
                  />
                ) : null}
                <CategoryIcon name={c.name} className={cn("size-14 rounded-xl border", c.on ? "border-primary" : "border-border")} iconClassName="size-7" />
                <span className="line-clamp-2 break-words">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="min-h-0 overflow-y-auto px-3 pt-3 pb-4">
          {banners.length > 0 ? (
            <div className="-mx-3 mb-4 [&>section]:mt-0">
              <PromoBanners banners={banners} />
            </div>
          ) : null}
          {shown.length === 0 ? (
            <StoreEmpty
              title={`No ${terms.items} found`}
              body={query ? "Try another search." : "Pick another category."}
            />
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-5">
              {shown.map((d) => (
                <DishTile key={d.id} dish={d} canOrder={canOrder} badge />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
