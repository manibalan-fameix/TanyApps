import Link from "next/link"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { CategoryIcon } from "@/components/restaurant/category-icon"
import { PromoBanners } from "@/components/restaurant/store/promo-banners"
import { Input } from "@/components/ui/input"
import { StoreEmpty } from "@/components/restaurant/store/ui"
import type { StoreBanner } from "@/lib/restaurant/banners"
import type { StoreCategory, StoreDish } from "@/lib/restaurant/storefront"

/** Phone Categories page: the offers banner, then "Shop by category" as a four-column grid of photo tiles. Each tile opens that category's listing. */
export function CategoryGrid({
  categories,
  banners,
}: {
  dishes: StoreDish[]
  categories: StoreCategory[]
  banners: StoreBanner[]
}) {
  return (
    <div className="pb-24 md:hidden">
      <h1 className="sr-only">Categories</h1>
      <form
        action="/search"
        role="search"
        className="px-4 pt-[calc(0.75rem+var(--safe-area-inset-top,0px))] pb-1"
      >
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            name="q"
            placeholder="Search"
            aria-label="Search"
            className="h-10 w-full rounded-xl pl-9"
          />
        </div>
      </form>
      <div className="-mt-1 [&>section]:mt-3">
        <PromoBanners banners={banners} />
      </div>
      <h2 className="mt-6 px-4 text-xl font-semibold tracking-tight">
        Shop by category
      </h2>
      {categories.length === 0 ? (
        <div className="px-4 pt-4">
          <StoreEmpty
            title="No categories yet"
            body="Please check back shortly."
          />
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-4 gap-x-3 gap-y-5 px-4">
          {categories.map((c) => {
            return (
              <li key={c.id}>
                <Link
                  href={`/category/${c.slug}`}
                  className="flex flex-col items-center gap-1.5 text-center"
                >
                  <CategoryIcon name={c.name} className="aspect-square h-auto w-full rounded-2xl" iconClassName="size-2/5" />
                  <span className="line-clamp-2 text-xs leading-tight font-medium break-words">
                    {c.name}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
