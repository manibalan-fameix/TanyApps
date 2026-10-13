import { asc, desc } from "drizzle-orm"

import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { type InventoryRow, InventoryGrid } from "@/components/restaurant/ops-grids"
import { menuCategories, menuItems, stockAdjustments } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { LOW_STOCK_AT, stockState } from "@/lib/restaurant/stock"

export const metadata = { title: "Inventory" }
export const dynamic = "force-dynamic"

export default async function InventoryPage() {
  const { dealer } = await requireRestaurant()
  const db = scopedDb(dealer.id)
  const [items, categories, adjustments] = await Promise.all([
    db.menuItems.select(undefined, { orderBy: [asc(menuItems.name)] }),
    db.menuCategories.select(undefined, { orderBy: [asc(menuCategories.sortOrder)] }),
    db.stockAdjustments.select(undefined, { orderBy: [desc(stockAdjustments.createdAt)], limit: 400 }),
  ])
  const cat = new Map(categories.map((c) => [c.id, c.name]))
  const history = new Map<string, InventoryRow["history"]>()
  for (const a of adjustments) {
    const list = history.get(a.itemId) ?? []
    if (list.length < 8) list.push({ delta: a.delta, after: a.quantityAfter, reason: a.reason, at: a.createdAt.toISOString() })
    history.set(a.itemId, list)
  }
  const rows: InventoryRow[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.categoryId ? (cat.get(i.categoryId) ?? "") : "",
    state: stockState(i.stockQuantity, i.isAvailable),
    quantity: i.stockQuantity,
    history: history.get(i.id) ?? [],
  }))
  const low = rows.filter((r) => r.state === "low" || r.state === "out").length
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Inventory" description={`Track units per dish. Every order takes stock, and a dish sells out by itself at zero. Low stock is ${LOW_STOCK_AT} or fewer${low ? ` · ${low} need attention` : ""}.`} />
      {rows.length === 0 ? <EmptyState title="No dishes yet" body="Add dishes first, then track their stock here." /> : <InventoryGrid rows={rows} />}
    </div>
  )
}
