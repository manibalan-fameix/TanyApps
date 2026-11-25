// The rules for editing products cell by cell. Pure, so they can be tested without a database.
import { z } from "zod"

import type { ProductDetails } from "./bulk-import"
import { menuItemSchema } from "./menu"

/** The extra facts a product page shows, as grid cells. The limits are the import's (importRowSchema). */
export const DETAIL_TEXT = {
  brand: { label: "Brand", max: 80 },
  packSize: { label: "Weight / pack size", max: 40 },
  unit: { label: "Unit", max: 30 },
  barcode: { label: "Barcode", max: 32 },
  hsn: { label: "HSN code", max: 16 },
  shelfLife: { label: "Shelf life", max: 40 },
  origin: { label: "Country of origin", max: 60 },
} as const
export type DetailTextField = keyof typeof DETAIL_TEXT
export const DETAIL_TEXT_FIELDS = Object.keys(DETAIL_TEXT) as DetailTextField[]

export const GRID_FIELDS = ["name", "categoryId", "price", "mrp", "stock", "status", "diet", "bestseller", "description", "brand", "packSize", "unit", "barcode", "hsn", "gst", "shelfLife", "origin"] as const
export type GridField = (typeof GRID_FIELDS)[number]

/** One changed cell: what it showed before, and what it should be now. */
export const cellEditSchema = z.object({
  id: z.string().uuid(),
  field: z.enum(GRID_FIELDS),
  previous: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  value: z.union([z.string().max(500), z.number(), z.boolean(), z.null()]),
})
export type CellEdit = z.infer<typeof cellEditSchema>

export const MAX_CELL_EDITS = 200

export type EditableProduct = {
  name: string
  description: string
  categoryId: string | null
  price: number
  compareAtPrice: number | null
  portions: { label: string; price: number }[]
  imageUrl: string | null
  isVeg: boolean
  isAvailable: boolean
  isFeatured: boolean
  stockQuantity: number | null
  details: ProductDetails
}

export type StockEdit = { from: number | null; to: number | null }

export type EditPlan =
  | { ok: true; values: Omit<EditableProduct, "stockQuantity" | "portions" | "imageUrl">; stock: StockEdit | null }
  | { ok: false; error: string }

const stockSchema = z.number().int("Stock must be a whole number.").min(0, "Stock cannot be negative.").max(100_000, "That is too much stock.").nullable()

/**
 * What one product becomes after its changed cells. Every change is held to the same rules as the product form, and nothing is
 * adjusted quietly: a value that cannot be saved is refused.
 */
export function planProductEdit(item: EditableProduct, edits: Pick<CellEdit, "field" | "previous" | "value">[]): EditPlan {
  const next = {
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
  }
  let stock: StockEdit | null = null
  // Only the facts that were edited change; the rest are kept. An emptied one is removed, not saved as blank.
  const details: ProductDetails = { ...item.details }
  const changed = new Set(edits.map((e) => e.field))

  for (const e of edits) {
    switch (e.field) {
      case "name":
        next.name = String(e.value ?? "")
        break
      case "categoryId":
        next.categoryId = e.value === null || e.value === "" || e.value === "none" ? null : String(e.value)
        break
      case "price":
        if (item.portions.length > 0) return { ok: false, error: "This product has sizes. Change its prices with Edit." }
        if (typeof e.value !== "number") return { ok: false, error: "Enter a price." }
        next.price = e.value
        break
      case "mrp":
        if (e.value !== null && typeof e.value !== "number") return { ok: false, error: "Enter the original price as a number." }
        next.compareAtPrice = e.value
        break
      case "stock": {
        const to = stockSchema.safeParse(e.value)
        const from = stockSchema.safeParse(e.previous ?? null)
        if (!to.success) return { ok: false, error: to.error.issues[0].message }
        if (!from.success) return { ok: false, error: "Stock changed while you were editing. Try again." }
        stock = { from: from.data, to: to.data }
        break
      }
      case "status":
        if (e.value !== "available" && e.value !== "sold_out") return { ok: false, error: "Choose Available or Sold out." }
        next.isAvailable = e.value === "available"
        break
      case "diet":
        if (e.value !== "veg" && e.value !== "nonveg") return { ok: false, error: "Choose Veg or Non-veg." }
        next.isVeg = e.value === "veg"
        break
      case "bestseller":
        next.isFeatured = e.value === true
        break
      case "description":
        next.description = String(e.value ?? "")
        if (next.description.trim().length > 400) return { ok: false, error: "Keep the description under 400 characters." }
        break
      case "gst": {
        if (e.value === null || e.value === "") delete details.gst
        else if (typeof e.value !== "number" || e.value < 0 || e.value > 100) return { ok: false, error: "GST must be a number from 0 to 100." }
        else details.gst = e.value
        break
      }
      default: {
        const { label, max } = DETAIL_TEXT[e.field]
        const text = String(e.value ?? "").trim()
        if (text.length > max) return { ok: false, error: `${label} can be at most ${max} characters.` }
        if (text) details[e.field] = text
        else delete details[e.field]
      }
    }
  }

  const parsed = menuItemSchema.safeParse(next)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const mrp = parsed.data.compareAtPrice
  if (mrp !== null && mrp <= parsed.data.price) {
    if (changed.has("mrp")) return { ok: false, error: "The original price must be higher than the price." }
    // A new price that reaches the old "original price" ends the offer, as in the product form.
    next.compareAtPrice = null
  }
  const { name, description, categoryId, price, isVeg, isAvailable, isFeatured } = parsed.data
  return { ok: true, values: { name, description, categoryId, price, compareAtPrice: next.compareAtPrice === null ? null : mrp, isVeg, isAvailable, isFeatured, details }, stock }
}
