import { getRetailType, storeTerms } from "@/lib/verticals"
import { asc, desc } from "drizzle-orm"

import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { type MenuRow, ProductsGrid } from "@/components/restaurant/products-grid"
import { MenuActions } from "@/components/restaurant/menu-actions"
import { effectivePlanKey } from "@/lib/billing/state"
import { menuCategories, menuItems, stockAdjustments } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import type { PlanKey } from "@/lib/plans"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { menuItemLimit } from "@/lib/restaurant/menu"
import { stockState } from "@/lib/restaurant/stock"

export const metadata = { title: "Catalogue" }
export const dynamic = "force-dynamic"

export default async function MenuPage() {
  const { dealer } = await requireRestaurant()
  const t = storeTerms(dealer.industry, dealer.businessType)
  const db = scopedDb(dealer.id)
  const [items, categories, adjustments] = await Promise.all([
    // Newest first. Many can share a creation time (an import), so name and id settle the order: otherwise a saved row could move.
    db.menuItems.select(undefined, { orderBy: [desc(menuItems.createdAt), asc(menuItems.name), asc(menuItems.id)] }),
    db.menuCategories.select(undefined, { orderBy: [asc(menuCategories.sortOrder)] }),
    db.stockAdjustments.select(undefined, { orderBy: [desc(stockAdjustments.createdAt)], limit: 400 }),
  ])
  const history = new Map<string, MenuRow["history"]>()
  for (const a of adjustments) {
    const list = history.get(a.itemId) ?? []
    if (list.length < 8) list.push({ delta: a.delta, after: a.quantityAfter, reason: a.reason, at: a.createdAt.toISOString() })
    history.set(a.itemId, list)
  }
  const limit = menuItemLimit(effectivePlanKey(dealer) as PlanKey, dealer.industry)
  const atLimit = limit !== null && items.length >= limit
  const type = getRetailType(dealer.businessType)
  const sample =
    dealer.industry === "retail"
      ? type.previewItems.slice(0, 3).map((p, i) => ({ name: p.name, category: type.starterCategories[i] ?? "", price: p.price }))
      : [{ name: "Chicken Biryani", category: "Biryani", price: "250" }, { name: "Paneer Butter Masala", category: "Mains", price: "240" }]

  const rows: MenuRow[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    imageUrl: i.imageUrl,
    categoryId: i.categoryId,
    price: i.price,
    mrp: i.compareAtPrice,
    quantity: i.stockQuantity,
    isVeg: i.isVeg,
    isAvailable: i.isAvailable,
    isFeatured: i.isFeatured,
    description: i.description,
    details: i.details ?? {},
    history: history.get(i.id) ?? [],
    draft: {
      name: i.name,
      description: i.description,
      categoryId: i.categoryId,
      price: i.price,
      compareAtPrice: i.compareAtPrice,
      portions: i.portions,
      imageUrl: i.imageUrl ?? "",
      isVeg: i.isVeg,
      isAvailable: i.isAvailable,
      isFeatured: i.isFeatured,
    },
  }))
  const low = items.filter((i) => ["low", "out"].includes(stockState(i.stockQuantity, i.isAvailable))).length

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <PageHeader
        title={t.catalogue}
        description={`${items.length} ${items.length === 1 ? t.item : t.items}${limit === null ? " · unlimited on your plan" : ` of ${limit} on your plan`}${low ? ` · ${low} low or out of stock` : ""}`}
      >
        <MenuActions
          industry={dealer.industry}
          businessType={dealer.businessType}
          atLimit={atLimit}
          categories={categories.map((c) => ({ id: c.id, name: c.name, itemCount: items.filter((i) => i.categoryId === c.id).length }))}
          sample={sample}
          products={items.map((i) => ({ id: i.id, name: i.name, hasPhoto: Boolean(i.imageUrl) }))}
        />
      </PageHeader>
      {rows.length === 0 ? (
        <EmptyState title={`No ${t.items} yet`} body={`Add your first ${t.item} in about a minute. It shows on your ${dealer.industry === "retail" ? "store" : "menu"} page straight away.`} />
      ) : (
        <ProductsGrid industry={dealer.industry} businessType={dealer.businessType} rows={rows} categories={categories.map((c) => ({ id: c.id, name: c.name }))} canAdd={!atLimit} />
      )}
    </div>
  )
}
