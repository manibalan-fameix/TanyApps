import Link from "next/link"
import { asc, desc } from "drizzle-orm"

import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { type MenuRow, MenuGrid } from "@/components/restaurant/restaurant-grids"
import { buttonVariants } from "@/components/ui/button"
import { effectivePlanKey } from "@/lib/billing/state"
import { menuCategories, menuItems } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import type { PlanKey } from "@/lib/plans"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { menuItemLimit, priceLabel } from "@/lib/restaurant/menu"
import { cn } from "@/lib/utils"

export const metadata = { title: "Menu" }
export const dynamic = "force-dynamic"

export default async function MenuPage() {
  const { dealer } = await requireRestaurant()
  const db = scopedDb(dealer.id)
  const [items, categories] = await Promise.all([
    db.menuItems.select(undefined, { orderBy: [desc(menuItems.createdAt)] }),
    db.menuCategories.select(undefined, { orderBy: [asc(menuCategories.sortOrder)] }),
  ])
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))
  const limit = menuItemLimit(effectivePlanKey(dealer) as PlanKey)
  const atLimit = limit !== null && items.length >= limit

  const rows: MenuRow[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    imageUrl: i.imageUrl,
    categoryId: i.categoryId,
    category: i.categoryId ? (categoryName.get(i.categoryId) ?? "") : "",
    price: i.price,
    priceText: priceLabel(i),
    isVeg: i.isVeg,
    isAvailable: i.isAvailable,
    isFeatured: i.isFeatured,
    status: i.isAvailable ? "available" : "sold_out",
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

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Menu"
        description={`${items.length} ${items.length === 1 ? "dish" : "dishes"}${limit === null ? " · unlimited on your plan" : ` of ${limit} on your plan`}`}
      >
        <Link href="/categories" className={cn(buttonVariants({ variant: "outline" }))}>Categories</Link>
        {atLimit ? (
          <Link href="/settings/billing" className={cn(buttonVariants())}>Upgrade to add more</Link>
        ) : (
          <Link href="/menu/new" className={cn(buttonVariants())}>Add a dish</Link>
        )}
      </PageHeader>
      {rows.length === 0 ? (
        <EmptyState title="No dishes yet" body="Add your first dish in about a minute. It shows on your menu page straight away." />
      ) : (
        <MenuGrid rows={rows} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
      )}
    </div>
  )
}
