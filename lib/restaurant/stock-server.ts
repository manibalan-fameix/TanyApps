import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm"

import { coupons, menuItems, orders, stockAdjustments } from "../db/schema"
import { scopedDb, scopedTransaction, type ScopedDb } from "../db/scoped"
import { newOrderCode } from "./orders"
import { unitsByItem } from "./stock"

export type Reserved = { itemId: string; qty: number; after: number }

/** Thrown inside a transaction when a dish cannot cover the order. It rolls back everything already taken. */
export class StockShortage extends Error {}

const isUniqueViolation = (e: unknown) => ((e as { cause?: { code?: string }; code?: string })?.cause?.code ?? (e as { code?: string })?.code) === "23505"

/**
 * Takes stock for an order, on the caller's (transaction) handle. Each dish is decremented in a single conditional UPDATE ("only
 * if enough is left"), so two guests ordering the last portion at once cannot both get it. If any dish falls short it throws
 * StockShortage, and the transaction rolls back whatever was already taken. Dishes without tracked stock are left alone.
 */
export async function reserveStockIn(db: ScopedDb, lines: { itemId: string; qty: number }[]): Promise<Reserved[]> {
  const reserved: Reserved[] = []
  for (const [itemId, qty] of unitsByItem(lines)) {
    const rows = await db.menuItems
      .update(
        {
          stockQuantity: sql`${menuItems.stockQuantity} - ${qty}` as unknown as number,
          isAvailable: sql`${menuItems.stockQuantity} - ${qty} > 0` as unknown as boolean,
        },
        and(eq(menuItems.id, itemId), isNotNull(menuItems.stockQuantity), gte(menuItems.stockQuantity, qty))!,
      )
      .returning({ after: menuItems.stockQuantity })
    if (rows.length === 1) {
      reserved.push({ itemId, qty, after: rows[0].after ?? 0 })
      continue
    }
    // Either stock is not tracked for this dish (fine), or someone else just took it (not fine).
    const [item] = await db.menuItems.select(eq(menuItems.id, itemId), { limit: 1 })
    if (item && item.stockQuantity !== null) throw new StockShortage(item.stockQuantity <= 0 ? `${item.name} just sold out.` : `Only ${item.stockQuantity} left of ${item.name}.`)
  }
  return reserved
}

/** Puts stock back (a cancelled order) and, with a reason, records it in the audit trail. */
export async function releaseStock(dealerId: string, reserved: Reserved[], reason: string | null, db: ScopedDb = scopedDb(dealerId)) {
  for (const r of reserved) {
    const rows = await db.menuItems
      .update(
        { stockQuantity: sql`${menuItems.stockQuantity} + ${r.qty}` as unknown as number, isAvailable: true },
        and(eq(menuItems.id, r.itemId), isNotNull(menuItems.stockQuantity))!,
      )
      .returning({ after: menuItems.stockQuantity })
    if (reason && rows.length === 1) await db.stockAdjustments.insert({ itemId: r.itemId, delta: r.qty, quantityAfter: rows[0].after ?? 0, reason })
  }
}

/** Records the stock taken by a placed order. */
async function logReserved(db: ScopedDb, reserved: Reserved[], reason: string) {
  for (const r of reserved) await db.stockAdjustments.insert({ itemId: r.itemId, delta: -r.qty, quantityAfter: r.after, reason })
}

/**
 * Puts back exactly what an order took, as recorded when it was placed. Safe to call for an order that took nothing. NOT safe to
 * call twice for the same order: use cancelAndRestock, which claims the order's `stock_released` flag in the same transaction.
 */
export async function releaseOrderStock(dealerId: string, code: string, why: string, db: ScopedDb = scopedDb(dealerId)) {
  const taken = await db.stockAdjustments.select(eq(stockAdjustments.reason, `Order ${code}`))
  await releaseStock(dealerId, taken.filter((a) => a.delta < 0).map((a) => ({ itemId: a.itemId, qty: -a.delta, after: 0 })), `Order ${code} ${why}`, db)
}

export type NewOrder = Omit<typeof orders.$inferInsert, "dealerId" | "code">

/**
 * Places an order: takes the stock, writes the order, and logs what was taken, all in ONE transaction. Either the whole order
 * exists with its stock taken and logged, or nothing happened: a shortage, a failed insert, or a crash at any point leaves the
 * stock exactly as it was. The order code is unique across the system; on a (very rare) collision the whole transaction is run
 * again with a new code, a limited number of times. Nothing here talks to Razorpay: the caller does that after this commits.
 */
export async function placeOrderAtomically(
  dealerId: string,
  input: { lines: { itemId: string; qty: number }[]; order: NewOrder; couponCode?: string | null },
  makeCode: () => string = newOrderCode,
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode()
    try {
      await scopedTransaction(dealerId, async (db) => {
        const reserved = await reserveStockIn(db, input.lines)
        await db.orders.insert({ ...input.order, code })
        await logReserved(db, reserved, `Order ${code}`)
        if (input.couponCode) await db.coupons.update({ usedCount: sql`${coupons.usedCount} + 1` as unknown as number }, eq(coupons.code, input.couponCode))
      })
      return { ok: true, code }
    } catch (error) {
      if (error instanceof StockShortage) return { ok: false, error: error.message }
      if (isUniqueViolation(error)) continue // the transaction rolled back, stock included: try again with a new code
      throw error
    }
  }
  throw new Error("could not find a free order code")
}

/**
 * Cancels an order that is still in one of the `from` statuses and gives its stock back, exactly once, in ONE transaction. The
 * cancel is a conditional update that also claims `stock_released`, so of any number of simultaneous callers (two staff members,
 * a guest and the expiry job) exactly one wins and restocks; the others get false and change nothing. A crash leaves either the
 * old state or the finished one, never "cancelled but the stock is gone".
 */
export async function cancelAndRestock(
  dealerId: string,
  ref: { id: string } | { code: string },
  from: string[],
  why: string,
  set: { updatedAt?: Date } = {},
): Promise<boolean> {
  return scopedTransaction(dealerId, async (db) => {
    const claimed = await db.orders
      .update(
        { status: "cancelled", stockReleased: true, updatedAt: set.updatedAt ?? new Date() },
        and("id" in ref ? eq(orders.id, ref.id) : eq(orders.code, ref.code), inArray(orders.status, from), eq(orders.stockReleased, false))!,
      )
      .returning({ code: orders.code })
    if (claimed.length !== 1) return false
    await releaseOrderStock(dealerId, claimed[0].code, why, db)
    return true
  })
}
