"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { billingState, effectivePlanKey } from "@/lib/billing/state"
import { rateLimit } from "@/lib/core/rate-limit"
import { industrySession } from "@/lib/core/guards"
import { menuCategories, menuItems } from "@/lib/db/schema"
import { scopedDb, scopedTransaction } from "@/lib/db/scoped"
import { recordSecurityEvent } from "@/lib/core/security-audit"
import {
  MAX_IMPORT_ROWS,
  type ExistingProduct,
  type ImportRow,
  type PlannedRow,
  type StockMode,
  detailsOf,
  mergeDuplicates,
  planImport,
  summarisePlan,
  validateRows,
} from "@/lib/restaurant/bulk-import"
import { menuItemLimit } from "@/lib/restaurant/menu"
import type { PlanKey } from "@/lib/plans"
import { ORDER_INDUSTRIES, storeTerms } from "@/lib/verticals"

const rowInput = z.object({
  name: z.string().max(200),
  category: z.string().max(200).nullable(),
  price: z.number().finite().nullable(),
  mrp: z.number().finite().nullable(),
  cost: z.number().finite().nullable(),
  stock: z.number().finite().nullable(),
  unit: z.string().max(200).nullable(),
  description: z.string().max(2000),
  brand: z.string().max(200).nullable().default(null),
  barcode: z.string().max(200).nullable().default(null),
  hsn: z.string().max(200).nullable().default(null),
  gst: z.number().finite().nullable().default(null),
  packSize: z.string().max(200).nullable().default(null),
  veg: z.boolean().nullable().default(null),
  shelfLife: z.string().max(200).nullable().default(null),
  origin: z.string().max(200).nullable().default(null),
  featured: z.boolean().nullable().default(null),
  imageUrl: z.string().max(2000).nullable().default(null),
})

const optionsInput = z.object({
  mode: z.enum(["set", "add"]),
  updateExisting: z.boolean(),
  /** Percent added to the purchase rate for rows with no selling price. */
  markupPercent: z.number().min(0).max(1000),
})

export type RowPlan = { action: PlannedRow["action"]; existingName?: string; newStock?: number | null; problem?: string }

export type PreviewResult =
  | { ok: true; rows: RowPlan[]; counts: { create: number; update: number; skip: number; invalid: number }; limit: number | null; capacityLeft: number | null }
  | { ok: false; error: string }

const session = async () => (await industrySession(ORDER_INDUSTRIES)) ?? null

async function load(dealerId: string): Promise<ExistingProduct[]> {
  const items = await scopedDb(dealerId).menuItems.select()
  return items.map((i) => ({ id: i.id, name: i.name, stockQuantity: i.stockQuantity, categoryId: i.categoryId, details: i.details }))
}

/** Reads and checks what the browser sent. The rows are the owner's edits; nothing about them is trusted. */
function parse(rows: unknown, options: unknown) {
  const r = z.array(rowInput).max(MAX_IMPORT_ROWS).safeParse(rows)
  const o = optionsInput.safeParse(options)
  if (!r.success || !o.success) return null
  const rowsIn: ImportRow[] = r.data.map((x) => ({
    ...x,
    price: x.price === null ? null : Math.round(x.price),
    mrp: x.mrp === null ? null : Math.round(x.mrp),
    cost: x.cost === null ? null : Math.round(x.cost),
    stock: x.stock === null ? null : Math.floor(x.stock),
  }))
  return { rows: rowsIn, options: o.data }
}

/** What an import would do, row by row, without writing anything. Shown on the review screen. */
export async function previewImport(rows: unknown, options: unknown): Promise<PreviewResult> {
  const s = await session()
  if (!s) return { ok: false, error: "Please sign in again." }
  const parsed = parse(rows, options)
  if (!parsed) return { ok: false, error: `Check the file: at most ${MAX_IMPORT_ROWS} products at a time.` }
  const { clean, problems } = validateRows(parsed.rows, parsed.options.markupPercent)
  const existing = await load(s.dealer.id)
  const valid = clean.flatMap((c, i) => (c ? [{ c, i }] : []))
  const plan = planImport(valid.map((v) => v.c), existing, { mode: parsed.options.mode as StockMode, updateExisting: parsed.options.updateExisting })
  const out: RowPlan[] = parsed.rows.map(() => ({ action: "skip" }))
  for (const p of problems) out[p.index] = { action: "skip", problem: p.message }
  valid.forEach((v, n) => {
    const p = plan[n]
    out[v.i] = p.action === "create" ? { action: "create" } : p.action === "update" ? { action: "update", existingName: p.existing.name, newStock: p.newStock } : { action: "skip", existingName: p.existing.name }
  })
  const counts = { ...summarisePlan(plan), invalid: problems.length }
  const limit = menuItemLimit(effectivePlanKey(s.dealer) as PlanKey, s.dealer.industry)
  return { ok: true, rows: out, counts, limit, capacityLeft: limit === null ? null : Math.max(0, limit - existing.length) }
}

export type CommitResult = { ok: true; created: number; updated: number; skipped: number; categories: number } | { ok: false; error: string }

/**
 * Writes the reviewed rows: new products are created (with their categories, created on the way), matching products are updated, and every
 * stock change is logged in the stock history. One transaction: either all of it is saved or none of it.
 */
export async function commitImport(rows: unknown, options: unknown, source: "spreadsheet" | "invoice"): Promise<CommitResult> {
  const s = await session()
  if (!s) return { ok: false, error: "Please sign in again." }
  if (!billingState(s.dealer).hasAccess) return { ok: false, error: "Your trial has ended. Add a payment method to keep editing." }
  if (!(await rateLimit(`product-import:${s.dealer.id}`, 20, 3_600_000))) return { ok: false, error: "Too many imports. Try again in a while." }
  const parsed = parse(rows, options)
  if (!parsed) return { ok: false, error: `Check the file: at most ${MAX_IMPORT_ROWS} products at a time.` }
  const t = storeTerms(s.dealer.industry, s.dealer.businessType)

  // The same product listed twice becomes one (units add up) before anything is checked.
  const { clean } = validateRows(mergeDuplicates(parsed.rows).rows, parsed.options.markupPercent)
  // Rows with problems are left out; the review screen already flagged them and the owner chose to continue.
  const cleanRows = clean.filter((c): c is NonNullable<typeof c> => c !== null)
  if (cleanRows.length === 0) return { ok: false, error: "There is nothing to import. Every row needs a name and a selling price." }

  try {
    const result = await scopedTransaction(s.dealer.id, async (db) => {
      const existingItems = await db.menuItems.select()
      const existing: ExistingProduct[] = existingItems.map((i) => ({ id: i.id, name: i.name, stockQuantity: i.stockQuantity, categoryId: i.categoryId, details: i.details }))
      const plan = planImport(cleanRows, existing, { mode: parsed.options.mode, updateExisting: parsed.options.updateExisting })
      const summary = summarisePlan(plan)

      const limit = menuItemLimit(effectivePlanKey(s.dealer) as PlanKey, s.dealer.industry)
      if (limit !== null && existing.length + summary.create > limit) {
        const room = Math.max(0, limit - existing.length)
        throw new ImportError(`Your plan allows ${limit.toLocaleString("en-IN")} ${t.items} and you have ${existing.length.toLocaleString("en-IN")}. This file adds ${summary.create.toLocaleString("en-IN")} new ones, and only ${room.toLocaleString("en-IN")} fit. Remove some rows or upgrade your plan.`)
      }

      // Categories: reuse by name (ignoring case), create the rest, in the order they first appear.
      const cats = await db.menuCategories.select()
      const catId = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]))
      let sort = cats.length
      let newCats = 0
      for (const p of plan) {
        const name = p.row.category
        if (!name || p.action === "skip" || catId.has(name.toLowerCase())) continue
        const [made] = await db.menuCategories.insert({ name, sortOrder: sort++ }).returning({ id: menuCategories.id })
        catId.set(name.toLowerCase(), made.id)
        newCats++
      }

      for (const p of plan) {
        if (p.action === "skip") continue
        const row = p.row
        const categoryId = row.category ? (catId.get(row.category.toLowerCase()) ?? null) : null
        if (p.action === "create") {
          const [made] = await db.menuItems
            .insert({
              name: row.name,
              description: row.description || (row.unit ? `Sold per ${row.unit}.` : ""),
              categoryId,
              price: row.price,
              compareAtPrice: row.mrp !== null && row.mrp > row.price ? row.mrp : null,
              portions: [],
              imageUrl: row.imageUrl,
              details: detailsOf(row),
              stockQuantity: row.stock,
              isAvailable: row.stock === null ? true : row.stock > 0,
              isVeg: row.veg ?? true,
              isFeatured: row.featured ?? false,
            })
            .returning({ id: menuItems.id })
          if (row.stock !== null && row.stock > 0)
            await db.stockAdjustments.insert({ itemId: made.id, delta: row.stock, quantityAfter: row.stock, reason: source === "invoice" ? "Imported from invoice" : "Imported from spreadsheet" })
        } else {
          const stockChanged = p.newStock !== p.existing.stockQuantity && p.newStock !== null
          await db.menuItems.update(
            {
              price: row.price,
              compareAtPrice: row.mrp !== null && row.mrp > row.price ? row.mrp : null,
              ...(row.category && categoryId ? { categoryId } : {}),
              ...(row.description ? { description: row.description } : {}),
              ...(Object.keys(detailsOf(row)).length ? { details: { ...(p.existing.details ?? {}), ...detailsOf(row) } } : {}),
              ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
              ...(row.veg !== null ? { isVeg: row.veg } : {}),
              ...(row.featured !== null ? { isFeatured: row.featured } : {}),
              ...(p.newStock !== null ? { stockQuantity: p.newStock, isAvailable: p.newStock > 0 } : {}),
            },
            eq(menuItems.id, p.existing.id),
          )
          if (stockChanged && p.newStock !== null)
            await db.stockAdjustments.insert({ itemId: p.existing.id, delta: p.newStock - (p.existing.stockQuantity ?? 0), quantityAfter: p.newStock, reason: source === "invoice" ? "Stock added from invoice" : "Stock set from spreadsheet" })
        }
      }
      return { created: summary.create, updated: summary.update, skipped: summary.skip, categories: newCats }
    })
    await recordSecurityEvent({ actorType: "user", actorId: s.userId, businessId: s.dealer.id, action: "products.imported", targetType: "business", targetId: s.dealer.id, outcome: "success", metadata: { source, ...result } }).catch(() => {})
    revalidatePath("/menu")
    revalidatePath("/categories")
    revalidatePath("/dashboard")
    return { ok: true, ...result }
  } catch (error) {
    if (error instanceof ImportError) return { ok: false, error: error.message }
    console.error("product import failed")
    return { ok: false, error: "Something went wrong and nothing was saved. Please try again." }
  }
}

class ImportError extends Error {}
