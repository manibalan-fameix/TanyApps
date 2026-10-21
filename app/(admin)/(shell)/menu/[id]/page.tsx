import { requireRestaurant } from "@/lib/restaurant/guard"
import { eq } from "drizzle-orm"
import { notFound } from "next/navigation"
import { asc } from "drizzle-orm"
import { z } from "zod"

import { MenuItemForm } from "@/components/restaurant/menu-item-form"
import { SettingsPage } from "@/components/settings/settings-page"
import { menuCategories, menuItems } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"

export const metadata = { title: "Edit dish" }

export default async function EditDishPage({ params }: { params: Promise<{ id: string }> }) {
  const { dealer } = await requireRestaurant()
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()
  const db = scopedDb(dealer.id)
  const [[item], categories] = await Promise.all([
    db.menuItems.select(eq(menuItems.id, id), { limit: 1 }),
    db.menuCategories.select(undefined, { orderBy: [asc(menuCategories.sortOrder)] }),
  ])
  if (!item) notFound()
  return (
    <SettingsPage title="Edit dish" description={item.name}>
      <MenuItemForm
        itemId={item.id}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        initial={{
          name: item.name,
          description: item.description,
          categoryId: item.categoryId,
          price: item.price,
          compareAtPrice: item.compareAtPrice,
          portions: item.portions,
          imageUrl: item.imageUrl ?? "",
          isVeg: item.isVeg,
          isAvailable: item.isAvailable,
          isFeatured: item.isFeatured,
        }}
      />
    </SettingsPage>
  )
}
