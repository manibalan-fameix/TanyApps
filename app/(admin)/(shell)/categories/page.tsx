import { asc } from "drizzle-orm"

import { CategoriesManager } from "@/components/restaurant/categories-manager"
import { PageHeader } from "@/components/restaurant/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { menuCategories } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"

export const metadata = { title: "Categories" }
export const dynamic = "force-dynamic"

export default async function CategoriesPage() {
  const { dealer } = await requireRestaurant()
  const db = scopedDb(dealer.id)
  const [categories, items] = await Promise.all([
    db.menuCategories.select(undefined, { orderBy: [asc(menuCategories.sortOrder)] }),
    db.menuItems.select(),
  ])
  const counts = new Map<string, number>()
  for (const i of items) if (i.categoryId) counts.set(i.categoryId, (counts.get(i.categoryId) ?? 0) + 1)
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Categories" description="Sections that group your dishes, like Starters or Biryani." />
      <Card>
        <CardContent className="pt-6">
          <CategoriesManager categories={categories.map((c) => ({ id: c.id, name: c.name, itemCount: counts.get(c.id) ?? 0 }))} />
        </CardContent>
      </Card>
    </div>
  )
}
