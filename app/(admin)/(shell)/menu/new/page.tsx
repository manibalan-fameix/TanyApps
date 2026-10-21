import { asc } from "drizzle-orm"

import { MenuItemForm } from "@/components/restaurant/menu-item-form"
import { SettingsPage } from "@/components/settings/settings-page"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { menuCategories } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"

export const metadata = { title: "Add a dish" }

export default async function NewDishPage() {
  const { dealer } = await requireRestaurant()
  const categories = await scopedDb(dealer.id).menuCategories.select(undefined, {
    orderBy: [asc(menuCategories.sortOrder)],
  })
  return (
    <SettingsPage title="Add a dish" description="It shows on your menu page as soon as you save.">
      <MenuItemForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </SettingsPage>
  )
}
