import { notFound } from "next/navigation"
import { z } from "zod"

import { DishDetails } from "@/components/restaurant/store/dish-details"
import { restaurantPage } from "@/lib/restaurant/page-data"

export async function generateMetadata({ params }: { params: Promise<{ dealer: string; id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return {}
  const { store } = await restaurantPage(params)
  const dish = store.dishes.find((d) => d.id === id)
  return dish ? { title: dish.name, description: dish.description || undefined } : {}
}

export default async function DishPage({ params }: { params: Promise<{ dealer: string; id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()
  const { store } = await restaurantPage(params)
  const dish = store.dishes.find((d) => d.id === id)
  if (!dish) notFound()
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <DishDetails dish={dish} canOrder={store.canOrder} category={store.categories.find((c) => c.id === dish.categoryId) ?? null} />
    </main>
  )
}
