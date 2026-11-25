import { notFound } from "next/navigation"

import { CategoryBrowser } from "@/components/restaurant/store/category-browser"
import { DishTile } from "@/components/restaurant/store/dish-tile"
import { restaurantPage } from "@/lib/restaurant/page-data"
import { storeTerms } from "@/lib/verticals/terms"

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ dealer: string; slug: string }>
}) {
  const { slug } = await params
  const { dealer, store } = await restaurantPage(params)
  const t = storeTerms(dealer.industry, dealer.businessType)
  const category = store.categories.find((c) => c.slug === slug)
  if (!category) notFound()
  const dishes = store.dishes.filter((d) => d.categoryId === category.id)
  return (
    <>
      <CategoryBrowser
        dishes={store.dishes}
        categories={store.categories}
        canOrder={store.canOrder}
        banners={store.banners}
        activeSlug={slug}
      />
      <main className="mx-auto hidden max-w-6xl px-4 py-8 md:block">
        <h1 className="text-3xl font-semibold tracking-tight">
          {category.name}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {dishes.length} {dishes.length === 1 ? t.item : t.items} in{" "}
          {t.catalogue.toLowerCase()}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {dishes.map((d) => (
            <DishTile key={d.id} dish={d} canOrder={store.canOrder} badge size="lg" />
          ))}
        </div>
      </main>
    </>
  )
}
