import { notFound } from "next/navigation"

import { DISH_GRID } from "@/components/restaurant/store/ui"
import { cn } from "@/lib/utils"
import { DishCard } from "@/components/restaurant/store/dish-card"
import { restaurantPage } from "@/lib/restaurant/page-data"

export default async function CategoryPage({ params }: { params: Promise<{ dealer: string; slug: string }> }) {
  const { slug } = await params
  const { store } = await restaurantPage(params)
  const category = store.categories.find((c) => c.slug === slug)
  if (!category) notFound()
  const dishes = store.dishes.filter((d) => d.categoryId === category.id)
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">{category.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {dishes.length} {dishes.length === 1 ? "dish" : "dishes"} on the menu
      </p>
      <div className={cn("mt-6", DISH_GRID)}>
        {dishes.map((d) => (
          <DishCard key={d.id} dish={d} canOrder={store.canOrder} />
        ))}
      </div>
    </main>
  )
}
