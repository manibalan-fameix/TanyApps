import { asc } from "drizzle-orm"

import { PageHeader } from "@/components/restaurant/page-header"
import { HomepageEditor } from "@/components/restaurant/homepage-editor"
import { menuCategories, menuItems } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { readHomepage } from "@/lib/restaurant/homepage"
import { storeTerms } from "@/lib/verticals/terms"

export const metadata = { title: "Home page" }
export const dynamic = "force-dynamic"

export default async function HomepagePage() {
  const { dealer, owner } = await requireRestaurant()
  const t = storeTerms(dealer.industry, dealer.businessType)
  const db = scopedDb(dealer.id)
  const [items, categories, bannerRows] = await Promise.all([
    db.menuItems.select(undefined, { orderBy: [asc(menuItems.name)] }),
    db.menuCategories.select(undefined, { orderBy: [asc(menuCategories.sortOrder)] }),
    db.banners.select(),
  ])
  const used = new Set(items.map((i) => i.categoryId))
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <PageHeader title="Home page" description={`Arrange what customers see on your ${dealer.industry === "retail" ? "store" : "menu"}'s home page. The preview changes as you edit; customers see it after you save.`} />
      <HomepageEditor
        key={dealer.id}
        initial={readHomepage(dealer.profile)}
        owner={owner}
        itemsNoun={t.items}
        bannersShowing={bannerRows.filter((b) => b.isActive).length}
        // A category with nothing in it never shows on the store, so it is not offered here.
        categories={categories.filter((c) => used.has(c.id)).map((c) => ({ id: c.id, name: c.name }))}
        products={items.map((i) => ({ id: i.id, name: i.name, imageUrl: i.imageUrl }))}
      />
    </div>
  )
}
