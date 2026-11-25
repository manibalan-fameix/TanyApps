"use server"

import { industrySession } from "@/lib/core/guards"
import { and, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { billingState, effectivePlanKey } from "@/lib/billing/state"
import { menuCategories, menuItems } from "@/lib/db/schema"
import { MAX_CELL_EDITS, cellEditSchema, planProductEdit } from "@/lib/restaurant/grid-edit"
import { scopedDb, scopedTransaction } from "@/lib/db/scoped"
import { rateLimit } from "@/lib/core/rate-limit"
import {
  categoryNameSchema,
  menuItemSchema,
  menuLimitReached,
} from "@/lib/restaurant/menu"
import type { PlanKey } from "@/lib/plans"
import { IMAGE_KINDS, type ImageKind, imageKey, isOwnImage } from "@/lib/restaurant/images"
import { getStorage } from "@/lib/storage"
import { ORDER_INDUSTRIES, storeTerms } from "@/lib/verticals"

type Result<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

const uuid = z.string().uuid()

/** The signed-in restaurant. The dealer id comes from the session, never from the request. */
async function restaurant() {
  return (await industrySession(ORDER_INDUSTRIES))?.dealer ?? null
}

const unauthorised = { ok: false as const, error: "Please sign in again." }

function done() {
  revalidatePath("/menu")
  revalidatePath("/dashboard")
}

/** A category id from the client must belong to this restaurant. */
async function ownsCategory(dealerId: string, categoryId: string | null) {
  if (!categoryId) return true
  const rows = await scopedDb(dealerId).menuCategories.select(eq(menuCategories.id, categoryId), { limit: 1 })
  return rows.length === 1
}

/** Where the browser should PUT a resized photo, and the public address it will have afterwards. */
export async function requestImageUpload(
  kind: ImageKind,
): Promise<{ ok: true; url: string; method: string; headers: Record<string, string>; publicUrl: string } | { ok: false; error: string }> {
  const d = await restaurant()
  if (!d) return unauthorised
  if (!(IMAGE_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "Invalid upload." }
  if (!(await rateLimit(`menu-image:${d.id}`, 60, 60 * 60_000))) return { ok: false, error: "Too many uploads. Try again later." }
  const storage = getStorage()
  const key = imageKey(d.id, kind, crypto.randomUUID())
  const target = await storage.presignPut(key, "image/jpeg")
  return { ok: true, url: target.url, method: target.method, headers: target.headers, publicUrl: storage.publicUrl(key) }
}

export async function createMenuItem(draft: unknown): Promise<Result<{ id: string }>> {
  const d = await restaurant()
  if (!d) return unauthorised
  if (!(await rateLimit(`menu-write:${d.id}`, 120, 60_000))) return { ok: false, error: "Too many changes. Try again in a minute." }
  const parsed = menuItemSchema.safeParse(draft)
  if (!parsed.success) return invalid(parsed.error)
  if (!(await ownsCategory(d.id, parsed.data.categoryId))) return { ok: false, error: "Pick a category from your list." }
  if (!isOwnImage(getStorage(), d.id, parsed.data.imageUrl)) return { ok: false, error: "Upload the photo again.", fieldErrors: { imageUrl: "Upload the photo again." } }

  const db = scopedDb(d.id)
  const count = await db.menuItems.count()
  const t = storeTerms(d.industry, d.businessType)
  if (menuLimitReached(count, effectivePlanKey(d) as PlanKey, d.industry)) {
    return { ok: false, error: `You have reached your plan's ${t.catalogue.toLowerCase()} limit. Upgrade to add more ${t.items}.` }
  }
  if (!billingState(d).hasAccess) return { ok: false, error: "Your trial has ended. Add a payment method to keep editing." }

  const [row] = await db.menuItems
    .insert(toRow(parsed.data))
    .returning({ id: menuItems.id })
  done()
  return { ok: true, id: row.id }
}

export async function updateMenuItem(id: string, draft: unknown): Promise<Result> {
  const d = await restaurant()
  if (!d) return unauthorised
  if (!uuid.safeParse(id).success) return { ok: false, error: "Dish not found." }
  const parsed = menuItemSchema.safeParse(draft)
  if (!parsed.success) return invalid(parsed.error)
  if (!(await ownsCategory(d.id, parsed.data.categoryId))) return { ok: false, error: "Pick a category from your list." }
  if (!isOwnImage(getStorage(), d.id, parsed.data.imageUrl)) return { ok: false, error: "Upload the photo again.", fieldErrors: { imageUrl: "Upload the photo again." } }
  await scopedDb(d.id).menuItems.update(toRow(parsed.data), eq(menuItems.id, id))
  done()
  return { ok: true }
}

/** Puts an uploaded photo on one product (bulk photo upload). The photo must be a file this business uploaded. */
export async function setProductPhoto(id: string, imageUrl: string): Promise<Result> {
  const d = await restaurant()
  if (!d) return unauthorised
  if (!uuid.safeParse(id).success) return { ok: false, error: "Product not found." }
  if (!(await rateLimit(`menu-write:${d.id}`, 120, 60_000))) return { ok: false, error: "Too many changes. Try again in a minute." }
  if (typeof imageUrl !== "string" || imageUrl === "" || imageUrl.length > 500 || !isOwnImage(getStorage(), d.id, imageUrl)) return { ok: false, error: "Upload the photo again." }
  const rows = await scopedDb(d.id).menuItems.update({ imageUrl }, eq(menuItems.id, id)).returning({ id: menuItems.id })
  if (rows.length !== 1) return { ok: false, error: "Product not found." }
  done()
  revalidatePath("/")
  return { ok: true }
}

class Refused extends Error {}

/**
 * Saves cells edited in the product grid. Every change is checked first and they are written together: if any one cannot be saved,
 * none is. A stock count only moves if it is still what the owner was looking at, and is recorded in the stock history.
 */
export async function saveProductCells(input: unknown): Promise<Result> {
  const d = await restaurant()
  if (!d) return unauthorised
  if (!(await rateLimit(`menu-write:${d.id}`, 120, 60_000))) return { ok: false, error: "Too many changes. Try again in a minute." }
  const parsed = z.array(cellEditSchema).min(1).max(MAX_CELL_EDITS).safeParse(input)
  if (!parsed.success) return { ok: false, error: `Those changes could not be read. Change at most ${MAX_CELL_EDITS} cells at a time.` }
  const byItem = Map.groupBy(parsed.data, (e) => e.id)

  try {
    await scopedTransaction(d.id, async (db) => {
      const categories = new Set((await db.menuCategories.select()).map((c) => c.id))
      for (const [id, edits] of byItem) {
        const [item] = await db.menuItems.select(eq(menuItems.id, id), { limit: 1 })
        if (!item) throw new Refused("One of those products no longer exists. Refresh and try again.")
        const plan = planProductEdit(item, edits)
        if (!plan.ok) throw new Refused(`${item.name}: ${plan.error}`)
        // The category must be this business's own.
        if (plan.values.categoryId && !categories.has(plan.values.categoryId)) throw new Refused(`${item.name}: pick a category from your list.`)
        const { stock } = plan
        if (!stock || stock.from === stock.to) {
          await db.menuItems.update(plan.values, eq(menuItems.id, id))
          continue
        }
        if (item.stockQuantity !== stock.from) throw new Refused(`${item.name}: stock changed while you were editing. Try again.`)
        const moved = await db.menuItems
          .update(
            { ...plan.values, stockQuantity: stock.to, ...(stock.to === null ? {} : { isAvailable: stock.to > 0 }) },
            and(eq(menuItems.id, id), stock.from === null ? isNull(menuItems.stockQuantity) : eq(menuItems.stockQuantity, stock.from))!,
          )
          .returning({ id: menuItems.id })
        if (moved.length !== 1) throw new Refused(`${item.name}: stock changed while you were editing. Try again.`)
        await db.stockAdjustments.insert({
          itemId: id,
          delta: stock.to === null ? 0 : stock.to - (stock.from ?? 0),
          quantityAfter: stock.to ?? 0,
          reason: stock.to === null ? "Stopped tracking" : stock.from === null ? "Started tracking" : "Edited in the product grid",
        })
      }
    })
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.message }
    console.error("save product cells failed")
    return { ok: false, error: "Could not save those changes. Try again." }
  }
  done()
  revalidatePath("/")
  return { ok: true }
}

export async function setMenuItemAvailable(id: string, isAvailable: boolean): Promise<Result> {
  const d = await restaurant()
  if (!d) return unauthorised
  if (!uuid.safeParse(id).success) return { ok: false, error: "Dish not found." }
  await scopedDb(d.id).menuItems.update({ isAvailable }, eq(menuItems.id, id))
  done()
  return { ok: true }
}

export async function deleteMenuItem(id: string): Promise<Result> {
  const d = await restaurant()
  if (!d) return unauthorised
  if (!uuid.safeParse(id).success) return { ok: false, error: "Dish not found." }
  await scopedDb(d.id).menuItems.delete(eq(menuItems.id, id))
  done()
  return { ok: true }
}

export async function createCategory(name: string): Promise<Result> {
  const d = await restaurant()
  if (!d) return unauthorised
  const parsed = categoryNameSchema.safeParse(name)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const db = scopedDb(d.id)
  const existing = await db.menuCategories.select(eq(menuCategories.name, parsed.data), { limit: 1 })
  if (existing.length) return { ok: false, error: "You already have a category with that name." }
  const sortOrder = await db.menuCategories.count()
  await db.menuCategories.insert({ name: parsed.data, sortOrder })
  done()
  return { ok: true }
}

/** Saves the order the owner dragged the categories into. The list must be exactly this business's categories. */
export async function reorderCategories(ids: string[]): Promise<Result> {
  const d = await restaurant()
  if (!d) return unauthorised
  const parsed = z.array(uuid).max(500).safeParse(ids)
  if (!parsed.success || new Set(parsed.data).size !== parsed.data.length) return { ok: false, error: "Could not save the new order." }
  if (!(await rateLimit(`menu-write:${d.id}`, 120, 60_000))) return { ok: false, error: "Too many changes. Try again in a minute." }
  try {
    await scopedTransaction(d.id, async (db) => {
      const owned = new Set((await db.menuCategories.select()).map((c) => c.id))
      if (parsed.data.some((id) => !owned.has(id))) throw new Error("not owned")
      for (const [sortOrder, id] of parsed.data.entries()) await db.menuCategories.update({ sortOrder }, eq(menuCategories.id, id))
    })
  } catch {
    return { ok: false, error: "Could not save the new order." }
  }
  done()
  revalidatePath("/categories")
  return { ok: true }
}

export async function renameCategory(id: string, name: string): Promise<Result> {
  const d = await restaurant()
  if (!d) return unauthorised
  if (!uuid.safeParse(id).success) return { ok: false, error: "Category not found." }
  const parsed = categoryNameSchema.safeParse(name)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  try {
    await scopedDb(d.id).menuCategories.update({ name: parsed.data }, and(eq(menuCategories.id, id))!)
  } catch {
    return { ok: false, error: "You already have a category with that name." }
  }
  done()
  return { ok: true }
}

/** Dishes in a deleted category stay on the menu, uncategorised. */
export async function deleteCategory(id: string): Promise<Result> {
  const d = await restaurant()
  if (!d) return unauthorised
  if (!uuid.safeParse(id).success) return { ok: false, error: "Category not found." }
  await scopedDb(d.id).menuCategories.delete(eq(menuCategories.id, id))
  done()
  return { ok: true }
}

function toRow(data: z.infer<typeof menuItemSchema>) {
  return {
    name: data.name,
    description: data.description,
    categoryId: data.categoryId,
    price: data.price,
    compareAtPrice: data.compareAtPrice !== null && data.compareAtPrice > data.price ? data.compareAtPrice : null,
    portions: data.portions,
    imageUrl: data.imageUrl || null,
    isVeg: data.isVeg,
    isAvailable: data.isAvailable,
    isFeatured: data.isFeatured,
  }
}

function invalid(error: z.ZodError): { ok: false; error: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) fieldErrors[String(issue.path[0])] ??= issue.message
  return { ok: false, error: error.issues[0].message, fieldErrors }
}
