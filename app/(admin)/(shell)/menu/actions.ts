"use server"

import { industrySession } from "@/lib/core/guards"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { billingState, effectivePlanKey } from "@/lib/billing/state"
import { menuCategories, menuItems } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { allow } from "@/lib/rate-limit"
import {
  categoryNameSchema,
  menuItemSchema,
  menuLimitReached,
} from "@/lib/restaurant/menu"
import type { PlanKey } from "@/lib/plans"
import { IMAGE_KINDS, type ImageKind, imageKey, isOwnImage } from "@/lib/restaurant/images"
import { getStorage } from "@/lib/storage"

type Result<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

const uuid = z.string().uuid()

/** The signed-in restaurant. The dealer id comes from the session, never from the request. */
async function restaurant() {
  return (await industrySession("restaurants"))?.dealer ?? null
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
  if (!allow(`menu-image:${d.id}`, 60, 60 * 60_000)) return { ok: false, error: "Too many uploads. Try again later." }
  const storage = getStorage()
  const key = imageKey(d.id, kind, crypto.randomUUID())
  const target = await storage.presignPut(key, "image/jpeg")
  return { ok: true, url: target.url, method: target.method, headers: target.headers, publicUrl: storage.publicUrl(key) }
}

export async function createMenuItem(draft: unknown): Promise<Result<{ id: string }>> {
  const d = await restaurant()
  if (!d) return unauthorised
  if (!allow(`menu-write:${d.id}`, 120, 60_000)) return { ok: false, error: "Too many changes. Try again in a minute." }
  const parsed = menuItemSchema.safeParse(draft)
  if (!parsed.success) return invalid(parsed.error)
  if (!(await ownsCategory(d.id, parsed.data.categoryId))) return { ok: false, error: "Pick a category from your list." }
  if (!isOwnImage(getStorage(), d.id, parsed.data.imageUrl)) return { ok: false, error: "Upload the photo again.", fieldErrors: { imageUrl: "Upload the photo again." } }

  const db = scopedDb(d.id)
  const count = await db.menuItems.count()
  if (menuLimitReached(count, effectivePlanKey(d) as PlanKey)) {
    return { ok: false, error: "You have reached your plan's menu limit. Upgrade to add more dishes." }
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
