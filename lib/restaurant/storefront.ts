export type StoreDish = {
  id: string
  name: string
  description: string
  price: number
  compareAt: number | null
  portions: { label: string; price: number }[]
  imageUrl: string | null
  isVeg: boolean
  isAvailable: boolean
  isFeatured: boolean
  categoryId: string | null
  categoryName: string
}

export type StoreCategory = { id: string; name: string; slug: string; count: number }

/** URL-safe name for a category page. Two categories that collapse to the same slug get a numeric suffix. */
export function categorySlugs(names: { id: string; name: string }[]): Map<string, string> {
  const used = new Map<string, number>()
  const out = new Map<string, string>()
  for (const c of names) {
    const base = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "category"
    const n = used.get(base) ?? 0
    used.set(base, n + 1)
    out.set(c.id, n === 0 ? base : `${base}-${n + 1}`)
  }
  return out
}

/** Whole-percent saving when a dish is on offer, else null. */
export function offerPercent(d: Pick<StoreDish, "price" | "compareAt">): number | null {
  if (d.compareAt === null || d.compareAt <= d.price) return null
  return Math.round(((d.compareAt - d.price) / d.compareAt) * 100)
}

export const isOnOffer = (d: Pick<StoreDish, "price" | "compareAt">) => offerPercent(d) !== null

export type DishFilterKey = "inStock" | "veg" | "nonVeg" | "bestseller" | "offer" | "portions"

export const DISH_FILTERS: { key: DishFilterKey; label: string }[] = [
  { key: "inStock", label: "Available" },
  { key: "veg", label: "Veg" },
  { key: "nonVeg", label: "Non-veg" },
  { key: "bestseller", label: "Bestseller" },
  { key: "offer", label: "On offer" },
  { key: "portions", label: "Portions" },
]

/** Search by name, description and category, then every active filter must pass. */
export function filterDishes(dishes: StoreDish[], query: string, active: ReadonlySet<DishFilterKey>): StoreDish[] {
  const q = query.trim().toLowerCase()
  return dishes.filter((d) => {
    if (q && !`${d.name} ${d.description} ${d.categoryName}`.toLowerCase().includes(q)) return false
    if (active.has("inStock") && !d.isAvailable) return false
    if (active.has("veg") && !d.isVeg) return false
    if (active.has("nonVeg") && d.isVeg) return false
    if (active.has("bestseller") && !d.isFeatured) return false
    if (active.has("offer") && !isOnOffer(d)) return false
    if (active.has("portions") && d.portions.length === 0) return false
    return true
  })
}
