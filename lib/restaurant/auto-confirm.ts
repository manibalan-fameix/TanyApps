import { and, eq, inArray } from "drizzle-orm"

import { audit } from "../core/audit"
import { countMetric } from "../core/metrics"
import { safeErrorMessage } from "../core/safe-error"
import { menuItems, orders, stockAdjustments } from "../db/schema"
import { scopedDb, scopedTransaction, type ScopedDb } from "../db/scoped"
import { orderStockProblems } from "./stock"

type OrderRow = typeof orders.$inferSelect

const BOT = { actorType: "system", actorId: "stock-bot" } as const

/** Checks one order against inventory as it is right now. Reads only; it never takes or returns stock. */
export async function checkOrderStock(db: ScopedDb, order: Pick<OrderRow, "code" | "lines">): Promise<string[]> {
  const ids = [...new Set(order.lines.map((l) => l.itemId))]
  const items = ids.length ? await db.menuItems.select(inArray(menuItems.id, ids)) : []
  // What placing the order took, as recorded by placeOrderAtomically.
  const taken = await db.stockAdjustments.select(eq(stockAdjustments.reason, `Order ${order.code}`))
  const reserved = new Map<string, number>()
  for (const a of taken) if (a.delta < 0) reserved.set(a.itemId, (reserved.get(a.itemId) ?? 0) - a.delta)
  return orderStockProblems(order.lines, items, reserved)
}

export type AutoConfirmResult = { outcome: "preparing" } | { outcome: "held"; problems: string[] } | { outcome: "skipped" }

/**
 * The stock bot. Once an order reaches the shop (status `new`), it checks every line against inventory. If all are covered,
 * the order is confirmed and goes straight to `preparing`; otherwise it stays `new` for a person to decide. Every later step
 * is manual. Safe to run more than once, or while staff act on the order: the move only happens while it is still `new`.
 */
export async function autoConfirmOrder(dealerId: string, code: string, now = new Date()): Promise<AutoConfirmResult> {
  return scopedTransaction(dealerId, async (db): Promise<AutoConfirmResult> => {
    const [order] = await db.orders.select(eq(orders.code, code), { limit: 1 })
    if (!order || order.status !== "new") return { outcome: "skipped" }
    if (order.paymentMethod === "online" && order.paymentStatus !== "paid") return { outcome: "skipped" }

    const problems = await checkOrderStock(db, order)
    if (problems.length > 0) {
      await audit(db, { ...BOT, action: "order.auto_confirm_held", entity: "order", entityId: order.id, diff: { problems } })
      return { outcome: "held", problems }
    }
    const moved = await db.orders
      .update({ status: "preparing", updatedAt: now }, and(eq(orders.id, order.id), eq(orders.status, "new"))!)
      .returning({ id: orders.id })
    if (moved.length !== 1) return { outcome: "skipped" }
    await audit(db, { ...BOT, action: "order.auto_confirmed", entity: "order", entityId: order.id, diff: { status: ["new", "confirmed", "preparing"] } })
    return { outcome: "preparing" }
  })
}

/**
 * What the places that release an order call, after it is committed. It never throws: the order is already placed (and maybe
 * paid), so if the bot fails the order simply stays `new` and staff confirm it by hand.
 */
export async function runStockBot(dealerId: string, code: string): Promise<void> {
  try {
    const r = await autoConfirmOrder(dealerId, code)
    if (r.outcome === "held") countMetric("order_auto_confirm_held")
  } catch (error) {
    countMetric("order_auto_confirm_failed")
    console.error(`stock bot failed: ${safeErrorMessage(error)}`)
  }
}

/** For the order page: why a still-new order is waiting. Computed live, so it clears once inventory is fixed. */
export async function heldReasons(dealerId: string, order: OrderRow): Promise<string[]> {
  return order.status === "new" ? checkOrderStock(scopedDb(dealerId), order) : []
}
