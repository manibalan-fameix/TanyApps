import { and, asc, desc, eq, inArray, lt, ne } from "drizzle-orm"

import { menuCategories, menuItems, orderReturnLines, orderReturns, returnMedia, returnMessages } from "../db/schema/index.ts"
import type { ScopedDb } from "../db/scoped.ts"
import { isSealed } from "../db/sealed.ts"
import { getStorage } from "../storage/index.ts"
import { COUNTED_STATUSES } from "./flow.ts"
import type { PriorReturn, ReturnReason } from "./rules.ts"

/** Reading and writing one conversation, for both sides. Every call goes through the shop's own scope. */

export type ReturnRow = typeof orderReturns.$inferSelect
export type Sender = "customer" | "assistant" | "shop" | "system"

export type ThreadMessage = { id: string; sender: Sender; body: string; event: string | null; at: string; photos: string[] }

/** Text that looks like our own encrypted values would be skipped by sealing, so it is spaced apart first. */
export const plainText = (body: string) => (isSealed(body.trim()) ? body.trim().replace(":", " :") : body.trim())

export type NewMessage = { sender: Sender; body?: string; event?: string; staffUserId?: string; clientId?: string; photoKeys?: string[] }

export async function postMessage(db: ScopedDb, returnId: string, m: NewMessage): Promise<void> {
  const [row] = await db.returnMessages
    .insert({ returnId, sender: m.sender, body: plainText(m.body ?? ""), event: m.event ?? null, staffUserId: m.staffUserId ?? null, clientId: m.clientId ?? null, createdAt: new Date() })
    .returning({ id: returnMessages.id })
  for (const storageKey of m.photoKeys ?? []) await db.returnMedia.insert({ returnId, messageId: row.id, storageKey })
}

export async function messagesOf(db: ScopedDb, returnId: string): Promise<ThreadMessage[]> {
  const [rows, media] = await Promise.all([
    db.returnMessages.select(eq(returnMessages.returnId, returnId), { orderBy: [asc(returnMessages.seq)], limit: 500 }),
    db.returnMedia.select(eq(returnMedia.returnId, returnId), { limit: 100 }),
  ])
  const storage = getStorage()
  return rows.map((r) => ({
    id: r.id,
    sender: r.sender as Sender,
    body: r.body,
    event: r.event,
    at: r.createdAt.toISOString(),
    photos: media.filter((x) => x.messageId === r.id && x.storageKey).map((x) => storage.publicUrl(x.storageKey)),
  }))
}

/** Changes a conversation. With `from`, only if it is still in one of those states: false means someone else moved it first. */
export async function patchReturn(db: ScopedDb, id: string, set: Partial<Omit<typeof orderReturns.$inferInsert, "dealerId">>, from?: readonly string[]): Promise<boolean> {
  const where = from ? and(eq(orderReturns.id, id), inArray(orderReturns.status, [...from]))! : eq(orderReturns.id, id)
  const rows = await db.orderReturns.update({ ...set, updatedAt: new Date() }, where).returning({ id: orderReturns.id })
  return rows.length === 1
}

/** The conversation now waits for the shop. The clock keeps running from when it first did. */
export const waitForShop = (row: Pick<ReturnRow, "waitingOn" | "waitingSince">) => ({ withShop: true, waitingOn: "shop", waitingSince: row.waitingOn === "shop" ? row.waitingSince : new Date() })

/** The other returns on an order that still hold items and money. */
export async function priorReturns(db: ScopedDb, orderId: string, exceptId?: string): Promise<PriorReturn[]> {
  const counted = and(eq(orderReturns.orderId, orderId), inArray(orderReturns.status, [...COUNTED_STATUSES]), exceptId ? ne(orderReturns.id, exceptId) : undefined)!
  const rows = await db.orderReturns.select(counted, { orderBy: [asc(orderReturns.createdAt)] })
  if (rows.length === 0) return []
  const lines = await db.orderReturnLines.select(inArray(orderReturnLines.returnId, rows.map((r) => r.id)))
  return rows.map((r) => ({
    reason: r.reason as ReturnReason,
    requested: r.amountRequested ?? 0,
    approved: r.amountApproved,
    lines: lines.filter((l) => l.returnId === r.id).map((l) => ({ position: l.orderLine, qty: l.qty })),
  }))
}

/** Finds each ordered item's category. An item since deleted has none, so the shop's default window applies to it. */
export async function categoryLookup(db: ScopedDb, itemIds: string[]) {
  const uuids = itemIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  const items = uuids.length ? await db.menuItems.select(inArray(menuItems.id, uuids)) : []
  const ids = [...new Set(items.map((i) => i.categoryId).filter((v): v is string => Boolean(v)))]
  const categories = ids.length ? await db.menuCategories.select(inArray(menuCategories.id, ids)) : []
  return (itemId: string) => {
    const c = categories.find((x) => x.id === items.find((i) => i.id === itemId)?.categoryId)
    return c ? { id: c.id, name: c.name } : null
  }
}

export const DRAFT_KEEP_DAYS = 7

/** Chats the shop never saw (only buttons were tapped) are removed after a week. */
export async function dropStaleDrafts(db: ScopedDb): Promise<void> {
  const cutoff = new Date(Date.now() - DRAFT_KEEP_DAYS * 86_400_000)
  await db.orderReturns.delete(and(eq(orderReturns.status, "draft"), eq(orderReturns.withShop, false), lt(orderReturns.updatedAt, cutoff))!)
}

export const latestFirst = [desc(orderReturns.createdAt)]
