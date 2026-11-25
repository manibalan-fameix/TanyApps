import { storeTerms } from "@/lib/verticals"
import { asc } from "drizzle-orm"

import { MenuItemForm } from "@/components/restaurant/menu-item-form"
import { SettingsPage } from "@/components/settings/settings-page"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { menuCategories } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"

export const metadata = { title: "Add an item" }

export default async function NewDishPage() {
  const { dealer } = await requireRestaurant()
  const t = storeTerms(dealer.industry, dealer.businessType)
  const categories = await scopedDb(dealer.id).menuCategories.select(undefined, {
    orderBy: [asc(menuCategories.sortOrder)],
  })
  return (
    <SettingsPage title={`Add ${t.item === "dish" ? "a dish" : `a ${t.item}`}`} description={`It shows on your ${dealer.industry === "retail" ? "store" : "menu"} page as soon as you save.`}>
      <MenuItemForm industry={dealer.industry} businessType={dealer.businessType} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </SettingsPage>
  )
}
