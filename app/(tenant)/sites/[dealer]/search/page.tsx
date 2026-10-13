import { DishCard } from "@/components/restaurant/store/dish-card"
import { StoreEmpty, StorePage, DISH_GRID } from "@/components/restaurant/store/ui"
import { Input } from "@/components/ui/input"
import { restaurantPage } from "@/lib/restaurant/page-data"
import { filterDishes } from "@/lib/restaurant/storefront"

export const metadata = { title: "Search" }

export default async function SearchPage({ params, searchParams }: { params: Promise<{ dealer: string }>; searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").slice(0, 80)
  const { store } = await restaurantPage(params)
  const results = q.trim() ? filterDishes(store.dishes, q, new Set()) : []
  return (
    <StorePage>
      <h1 className="text-3xl font-semibold tracking-tight">Search</h1>
      <form className="mt-5 max-w-xl" role="search">
        <label className="text-sm font-medium" htmlFor="q">Search dishes</label>
        <Input id="q" name="q" className="mt-2" defaultValue={q} placeholder="Try biryani, dosa, paneer" />
      </form>
      <div className="mt-8">
        {!q.trim() ? (
          <StoreEmpty title="What are you craving?" body="Search by dish name, description or category." action={{ href: "/menu", label: "Browse the menu" }} />
        ) : results.length === 0 ? (
          <StoreEmpty title="No dishes found" body={`Nothing matched “${q}”. Try another word or browse all categories.`} action={{ href: "/menu", label: "Browse the menu" }} />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">{results.length} {results.length === 1 ? "dish" : "dishes"} for “{q}”</p>
            <div className={DISH_GRID}>
              {results.map((d) => <DishCard key={d.id} dish={d} canOrder={store.canOrder} />)}
            </div>
          </>
        )}
      </div>
    </StorePage>
  )
}
