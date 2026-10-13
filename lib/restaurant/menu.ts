import { z } from "zod"

import { RESTAURANT_MENU_LIMITS, type PlanKey } from "../plans"

export const MAX_PORTIONS = 6

export const portionSchema = z.object({
  label: z.string().trim().min(1, "Name the portion, like Half or Full.").max(30),
  price: z.number().int("Use whole rupees.").min(0).max(1_000_000),
})

export const menuItemSchema = z.object({
  name: z.string().trim().min(2, "Enter the dish name.").max(80),
  description: z.string().trim().max(400).default(""),
  categoryId: z.string().uuid().nullable().default(null),
  price: z.number().int("Use whole rupees.").min(0, "Price cannot be negative.").max(1_000_000),
  compareAtPrice: z.number().int().min(1).max(1_000_000).nullable().default(null),
  portions: z.array(portionSchema).max(MAX_PORTIONS).default([]),
  /** A file uploaded by this restaurant (checked on the server), or empty. */
  imageUrl: z.string().trim().max(500).default(""),
  isVeg: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
})
export type MenuItemInput = z.infer<typeof menuItemSchema>
export type MenuItemDraft = z.input<typeof menuItemSchema>

export const categoryNameSchema = z.string().trim().min(2, "Enter a category name.").max(40)

/** Menu items a restaurant on this plan may have. Null means unlimited. */
export function menuItemLimit(plan: PlanKey): number | null {
  return RESTAURANT_MENU_LIMITS[plan]
}

export function menuLimitReached(count: number, plan: PlanKey): boolean {
  const max = menuItemLimit(plan)
  return max !== null && count >= max
}

export const formatRupees = (n: number) => `₹${n.toLocaleString("en-IN")}`

/** "₹120" for one price, "from ₹120" when portions differ. */
export function priceLabel(item: { price: number; portions: { price: number }[] }): string {
  if (item.portions.length === 0) return formatRupees(item.price)
  const lowest = Math.min(...item.portions.map((p) => p.price))
  return item.portions.length > 1 ? `from ${formatRupees(lowest)}` : formatRupees(lowest)
}
