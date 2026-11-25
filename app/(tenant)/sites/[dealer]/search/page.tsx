import { DishCard } from "@/components/restaurant/store/dish-card"
import { StoreEmpty, StorePage, DISH_GRID } from "@/components/restaurant/store/ui"
import { Input } from "@/components/ui/input"
import { restaurantPage } from "@/lib/restaurant/page-data"
import { filterDishes } from "@/lib/restaurant/storefront"
import { storeTerms } from "@/lib/verticals/terms"

export const metadata = { title: "Search" }

export default async function SearchPage({ params, searchParams }: { params: Promise<{ dealer: string }>; searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").slice(0, 80)
  const { dealer, store } = await restaurantPage(params)
  const t = storeTerms(dealer.industry, dealer.businessType)
  const results = q.trim() ? filterDishes(store.dishes, q, new Set()) : []
  return (
    <StorePage>
      <h1 className="text-3xl font-semibold tracking-tight">Search</h1>
      <form className="mt-5 max-w-xl" role="search">
        <label className="text-sm font-medium" htmlFor="q">Search {t.items}</label>
        <Input id="q" name="q" className="mt-2" defaultValue={q} placeholder={dealer.industry === "retail" ? t.searchHint : "Try biryani, dosa, paneer"} />
      </form>
      <div className="mt-8">
        {!q.trim() ? (
          <StoreEmpty title={dealer.industry === "retail" ? "What are you looking for?" : "What are you craving?"} body={`Search by ${t.item} name, description or category.`} action={{ href: "/menu", label: `Browse the ${t.catalogue.toLowerCase()}` }} />
        ) : results.length === 0 ? (
          <StoreEmpty title={`No ${t.items} found`} body={`Nothing matched “${q}”. Try another word or browse all categories.`} action={{ href: "/menu", label: `Browse the ${t.catalogue.toLowerCase()}` }} />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">{results.length} {results.length === 1 ? t.item : t.items} for “{q}”</p>
            <div className={DISH_GRID}>
              {results.map((d) => <DishCard key={d.id} dish={d} canOrder={store.canOrder} />)}
            </div>
          </>
        )}
      </div>
    </StorePage>
  )
}
