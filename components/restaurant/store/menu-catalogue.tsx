"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { DishCard, VegMark } from "@/components/restaurant/store/dish-card"
import { StoreEmpty, DISH_GRID } from "@/components/restaurant/store/ui"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DISH_FILTERS, type DishFilterKey, type StoreCategory, type StoreDish, filterDishes } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"

/**
 * Menu browser, laid out like the Lala Sweets menu: a category card on the left, a search and filter bar on top,
 * and only the dish grid scrolls.
 */
export function MenuCatalogue({ dishes, categories, canOrder }: { dishes: StoreDish[]; categories: StoreCategory[]; canOrder: boolean }) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState<Set<DishFilterKey>>(new Set())
  const shown = useMemo(() => filterDishes(dishes, query, active), [dishes, query, active])
  const toggle = (k: DishFilterKey) =>
    setActive((cur) => {
      const next = new Set(cur)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  return (
    <div className="mt-6 grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-x-hidden md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)]">
      <aside className="min-w-0 self-start rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur md:row-span-2">
        <p className="text-sm font-medium">Menu</p>
        <div className="mt-5 grid gap-2 text-sm">
          {categories.map((c) => (
            <Link key={c.id} href={`/category/${c.slug}`} className="text-muted-foreground hover:text-foreground">
              {c.name} ({c.count})
            </Link>
          ))}
        </div>
      </aside>

      <section className="min-w-0">
        <div className="max-w-full rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-64">
              <HugeiconsIcon icon={Search01Icon} className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 w-full rounded-xl pl-9" placeholder="Search Menu" aria-label="Search menu" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {DISH_FILTERS.map((f) => {
              const on = active.has(f.key)
              return (
                <button key={f.key} type="button" aria-pressed={on} onClick={() => toggle(f.key)} className={cn(buttonVariants({ variant: on ? "default" : "outline", size: "sm" }), "rounded-xl")}>
                  {f.key === "veg" ? <VegMark veg /> : null}
                  {f.key === "nonVeg" ? <VegMark veg={false} /> : null}
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="min-h-0 min-w-0 md:pr-2">
        <div className="flex h-full min-h-0 flex-col">
          <p className="mb-4 shrink-0 text-sm text-muted-foreground" role="status">
            {shown.length} {shown.length === 1 ? "dish" : "dishes"} found
          </p>
          <div className="min-h-0 overflow-y-auto pr-1 pb-24 md:pb-6">
            {shown.length === 0 ? (
              <StoreEmpty title="No dishes found" body="Try another search or clear a filter." />
            ) : (
              <div className={DISH_GRID}>
                {shown.map((d) => (
                  <DishCard key={d.id} dish={d} canOrder={canOrder} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
