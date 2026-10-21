import { and, eq, lt } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { orders } from "../db/schema"
import { scopedDb } from "../db/scoped"
import { razorpayCredentials } from "../billing/razorpay"
import { refundPayment } from "../route/razorpay"
import { PAYMENT_WINDOW_MINUTES } from "./orders"
import { releaseOrderStock } from "./stock-server"

type PayoutAccount = { razorpayAccountId: string | null; razorpayAccountStatus: string | null }

/** Razorpay test keys never move real money, so they may be used before a restaurant has connected a bank account. */
export function usingTestKeys(): boolean {
  return razorpayCredentials()?.keyId.startsWith("rzp_test_") === true
}

/**
 * Whether guests can pay online at this restaurant: payments must be set up, and the restaurant must have an active
 * linked account to receive the money. Test keys may skip the linked account only when RAZORPAY_ALLOW_DIRECT=1.
 */
export function onlinePaymentsAvailable(dealer: PayoutAccount): boolean {
  if (!razorpayCredentials()) return false
  if (dealer.razorpayAccountId && dealer.razorpayAccountStatus === "activated") return true
  return process.env.RAZORPAY_ALLOW_DIRECT === "1" && usingTestKeys()
}

/** Where the money for a new order goes: the restaurant's account, or nowhere (test keys only). */
export function payoutAccountFor(dealer: PayoutAccount): string | null {
  return dealer.razorpayAccountId && dealer.razorpayAccountStatus === "activated" ? dealer.razorpayAccountId : null
}

export type PaymentApplied = { found: boolean; applied: boolean; code?: string; refunded?: boolean; refundFailed?: boolean }

/**
 * Records a captured payment against its order. Called by the guest's checkout (which passes `expectedDealerId`, the
 * restaurant of the host it is on) and by Razorpay's webhook (which does not), in either order, so it is safe to run more
 * than once. An order that was cancelled or expired before the payment arrived is
 * refunded instead of being revived, so a guest is never charged for an order nobody will cook.
 */
export async function applyOrderPayment(razorpayOrderId: string, paymentId: string, now = new Date(), expectedDealerId?: string): Promise<PaymentApplied> {
  const [order] = await unscopedDb.select().from(orders).where(eq(orders.razorpayOrderId, razorpayOrderId)).limit(1)
  if (!order) return { found: false, applied: false }
  // The checkout path knows which restaurant the guest is on; a payment for another restaurant's order is not theirs to confirm.
  if (expectedDealerId && order.dealerId !== expectedDealerId) return { found: false, applied: false }
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") return { found: true, applied: false, code: order.code }

  const db = scopedDb(order.dealerId)
  if (order.status === "pending_payment") {
    // Conditional on the status, so a cancel and a payment arriving together cannot both win.
    const rows = await db.orders
      .update({ status: "new", paymentStatus: "paid", paidAt: now, createdAt: now, updatedAt: now, razorpayPaymentId: paymentId }, and(eq(orders.id, order.id), eq(orders.status, "pending_payment"))!)
      .returning({ id: orders.id })
    if (rows.length === 1) return { found: true, applied: true, code: order.code }
  }
  // Cancelled or expired first: give the money back.
  const [fresh] = await db.orders.select(eq(orders.id, order.id), { limit: 1 })
  if (fresh && fresh.paymentStatus !== "paid") {
    await db.orders.update({ razorpayPaymentId: paymentId }, eq(orders.id, order.id))
    const done = await refundOrder(order.dealerId, { ...fresh, razorpayPaymentId: paymentId, paymentStatus: "paid" })
    return { found: true, applied: false, code: order.code, refunded: done.ok, refundFailed: !done.ok }
  }
  return { found: true, applied: false, code: order.code }
}

/** Sends a paid online order's money back (reversing the restaurant's transfer) and records it. */
export async function refundOrder(
  dealerId: string,
  order: { id: string; total: number; razorpayPaymentId: string | null; paymentStatus: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (order.paymentStatus === "refunded") return { ok: true }
  if (!order.razorpayPaymentId) return { ok: false, error: "This order has no online payment to refund." }
  const [dealer] = await unscopedDb.query.dealers.findMany({ where: (d, { eq: e }) => e(d.id, dealerId), limit: 1 })
  try {
    // A payment made without a linked account (test keys) has no transfer to reverse.
    await refundPayment(order.razorpayPaymentId, order.total, Boolean(dealer && payoutAccountFor(dealer)))
  } catch (error) {
    console.error(`refund failed: ${error instanceof Error ? error.message : "unknown"}`)
    return { ok: false, error: "The refund could not be sent. Try again in a minute." }
  }
  await scopedDb(dealerId).orders.update({ paymentStatus: "refunded", refundedAt: new Date() }, eq(orders.id, order.id))
  return { ok: true }
}

/**
 * Drops online orders nobody paid for within the window and gives their stock back. Called lazily from the pages
 * and actions that read orders, so no background job is needed.
 */
export async function expireUnpaidOrders(dealerId: string, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PAYMENT_WINDOW_MINUTES * 60_000)
  const db = scopedDb(dealerId)
  const stale = await db.orders.select(and(eq(orders.status, "pending_payment"), lt(orders.createdAt, cutoff)), { limit: 50 })
  let n = 0
  for (const o of stale) {
    const rows = await db.orders
      .update({ status: "cancelled", updatedAt: now, stockReleased: true }, and(eq(orders.id, o.id), eq(orders.status, "pending_payment"))!)
      .returning({ id: orders.id })
    if (rows.length === 1) {
      await releaseOrderStock(dealerId, o.code, "expired unpaid")
      n++
    }
  }
  return n
}
