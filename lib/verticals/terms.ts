import { getRetailType } from "./retail-types"
import type { IndustryKey } from "./keys"

/**
 * The words the ordering engine uses on screen, per business. TanyEats says "dish" and "menu"; TanyRetail says "product" or "item"
 * and "catalogue" or "collection" depending on the shop's business type. Plain data, safe in server and client components.
 */
export type StoreTerms = {
  /** Lower case singular and plural: "dish" / "dishes", "product" / "products". */
  item: string
  items: string
  /** Title case: "Dish" / "Dishes". */
  Item: string
  Items: string
  /** The range as a whole, title case: "Menu", "Catalogue", "Collection". */
  catalogue: string
  /** What the business is: "restaurant", "shop". */
  business: string
  /** Home page heading for the featured row: only a restaurant has a chef. */
  picksTitle: string
  /** Whether veg / non-veg marks and filters apply. */
  diet: boolean
  /** Units or portion labels a seller can pick from, first is the default. Empty means free text only. */
  units: readonly string[]
  /** Placeholder for the public search box. */
  searchHint: string
  /** Whether the business takes table bookings. */
  tableBookings: boolean
  /** Sample name and description for the add form. */
  itemPlaceholder: string
  descriptionPlaceholder: string
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "a product", "an item". */
export const aOrAn = (word: string) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`

const RESTAURANT_TERMS: StoreTerms = {
  item: "dish",
  items: "dishes",
  Item: "Dish",
  Items: "Dishes",
  catalogue: "Menu",
  business: "restaurant",
  picksTitle: "Chef's Picks",
  diet: true,
  units: [],
  searchHint: "Search dishes",
  tableBookings: true,
  itemPlaceholder: "Chicken Biryani",
  descriptionPlaceholder: "Slow-cooked with freshly ground spices.",
}

export function storeTerms(industry: IndustryKey | string | null | undefined, businessType?: string | null): StoreTerms {
  if (industry !== "retail") return RESTAURANT_TERMS
  const t = getRetailType(businessType)
  return {
    item: t.item,
    items: t.items,
    Item: cap(t.item),
    Items: cap(t.items),
    catalogue: t.catalogue,
    business: "shop",
    picksTitle: "Top Picks",
    diet: t.dietMarks,
    units: t.units,
    searchHint: t.searchHint,
    tableBookings: false,
    itemPlaceholder: t.previewItems[0]?.name ?? "Product name",
    descriptionPlaceholder: "Brand, size, material or anything a customer should know.",
  }
}
