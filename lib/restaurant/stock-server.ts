import { and, eq, gte, isNotNull, sql } from "drizzle-orm"

import { menuItems, stockAdjustments } from "../db/schema"
import { scopedDb } from "../db/scoped"
import { unitsByItem } from "./stock"

export type Reserved = { itemId: string; qty: number; after: number }

/**
 * Takes stock for an order. Each dish is decremented in a single conditional UPDATE ("only if enough is left"),
 * so two guests ordering the last portion at once cannot both get it. If any dish falls short, what was already
 * taken is put back. Dishes without tracked stock are left alone.
 */
export async function reserveStock(dealerId: string, lines: { itemId: string; qty: number }[]): Promise<{ ok: true; reserved: Reserved[] } | { ok: false; error: string }> {
  const db = scopedDb(dealerId)
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
    if (item && item.stockQuantity !== null) {
      await releaseStock(dealerId, reserved, null)
      return { ok: false, error: item.stockQuantity <= 0 ? `${item.name} just sold out.` : `Only ${item.stockQuantity} left of ${item.name}.` }
    }
  }
  return { ok: true, reserved }
}

/** Puts stock back (a failed order, or a cancelled one) and, with a reason, records it in the audit trail. */
export async function releaseStock(dealerId: string, reserved: Reserved[], reason: string | null) {
  const db = scopedDb(dealerId)
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
export async function logReserved(dealerId: string, reserved: Reserved[], reason: string) {
  const db = scopedDb(dealerId)
  for (const r of reserved) await db.stockAdjustments.insert({ itemId: r.itemId, delta: -r.qty, quantityAfter: r.after, reason })
}

/** Puts back exactly what an order took, as recorded when it was placed. Safe to call for an order that took nothing. */
export async function releaseOrderStock(dealerId: string, code: string, why: string) {
  const taken = await scopedDb(dealerId).stockAdjustments.select(eq(stockAdjustments.reason, `Order ${code}`))
  await releaseStock(dealerId, taken.filter((a) => a.delta < 0).map((a) => ({ itemId: a.itemId, qty: -a.delta, after: 0 })), `Order ${code} ${why}`)
}
