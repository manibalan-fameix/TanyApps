import { and, asc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm"

import { audit } from "../core/audit"
import { countMetric } from "../core/metrics"
import { clearException, recordException } from "../core/payment-exceptions"
import { safeErrorMessage } from "../core/safe-error"
import { unscopedDb } from "../db/client"
import { auditLog, orders } from "../db/schema"
import { scopedDb } from "../db/scoped"
import { razorpayCredentials } from "../billing/razorpay"
import { getCapturedPaymentId, getRefundStatus, isFinalRefundFailure, refundPayment } from "../route/razorpay"
import { PAYMENT_WINDOW_MINUTES } from "./orders"
import { cancelAndRestock } from "./stock-server"

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
  // A different payment id on an order that already took (or is refunding) one: the guest was charged twice. The first payment is
  // the one we hold; the second is sent back once (its refund key is its own payment id) and recorded, never just ignored.
  if (order.razorpayPaymentId && order.razorpayPaymentId !== paymentId && ["paid", "refunded", "refunding"].includes(order.paymentStatus)) {
    return refundExtraOrderPayment(order, paymentId)
  }
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") return { found: true, applied: false, code: order.code }

  const db = scopedDb(order.dealerId)
  if (order.status === "pending_payment") {
    // Conditional on the status, so a cancel and a payment arriving together cannot both win.
    const rows = await db.orders
      .update({ status: "new", paymentStatus: "paid", paidAt: now, createdAt: now, updatedAt: now, razorpayPaymentId: paymentId }, and(eq(orders.id, order.id), eq(orders.status, "pending_payment"))!)
      .returning({ id: orders.id })
    if (rows.length === 1) return { found: true, applied: true, code: order.code }
  }
  // Cancelled or expired first: give the money back, once. Two events can arrive for the same payment (order.paid and
  // payment.captured), even at the same instant, so the refund is claimed with a conditional update: only the caller that
  // flips the order from "pending" to "refunding" sends it. A claim left behind by a crash is taken over after a while.
  const [fresh] = await db.orders.select(eq(orders.id, order.id), { limit: 1 })
  if (fresh && fresh.paymentStatus !== "paid" && fresh.paymentStatus !== "refunded") {
    const stale = new Date(now.getTime() - REFUND_CLAIM_STALE_MS)
    const claimed = await db.orders
      .update(
        { paymentStatus: "refunding", razorpayPaymentId: paymentId, updatedAt: now },
        and(eq(orders.id, order.id), or(eq(orders.paymentStatus, "pending"), and(eq(orders.paymentStatus, "refunding"), lt(orders.updatedAt, stale))))!,
      )
      .returning({ id: orders.id })
    if (claimed.length === 0) return { found: true, applied: false, code: order.code } // someone else is refunding, or has
    const done = await refundOrder(order.dealerId, { ...fresh, razorpayPaymentId: paymentId, paymentStatus: "paid" })
    // A failed refund goes back to "pending" so Razorpay's retry of the webhook can claim it again.
    if (!done.ok) await db.orders.update({ paymentStatus: "pending" }, and(eq(orders.id, order.id), eq(orders.paymentStatus, "refunding"))!)
    return { found: true, applied: false, code: order.code, refunded: done.ok, refundFailed: !done.ok }
  }
  return { found: true, applied: false, code: order.code }
}

async function refundExtraOrderPayment(order: typeof orders.$inferSelect, paymentId: string): Promise<PaymentApplied> {
  const db = scopedDb(order.dealerId)
  const [dealer] = await unscopedDb.query.dealers.findMany({ where: (d, { eq: e }) => e(d.id, order.dealerId), limit: 1 })
  countMetric("order_payment_mismatch")
  try {
    const r = await refundPayment(paymentId, order.total, Boolean(dealer && payoutAccountFor(dealer)))
    const seen = await db.auditLog.select(and(eq(auditLog.entity, "order"), eq(auditLog.entityId, order.id), eq(auditLog.action, "payment.duplicate_refunded"), sql`${auditLog.diff}->>'paymentId' = ${paymentId}`), { limit: 1 })
    if (seen.length === 0) {
      await audit(db, { actorType: "webhook", actorId: "razorpay", action: "payment.duplicate_refunded", entity: "order", entityId: order.id, diff: { paymentId, keptPaymentId: order.razorpayPaymentId, refundId: r.refundId, refundStatus: r.status } })
    }
    await recordException({ kind: "duplicate_payment", ref: paymentId, businessId: order.dealerId, detail: `Double charge on order ${order.code}: the second payment was refunded automatically (refund ${r.status}).`, status: "resolved" })
    return { found: true, applied: false, code: order.code, refunded: true }
  } catch (error) {
    console.error(`duplicate payment refund failed: ${safeErrorMessage(error)}`)
    countMetric("order_duplicate_refund_failed")
    await recordException({ kind: "duplicate_payment", ref: paymentId, businessId: order.dealerId, detail: `Double charge on order ${order.code}: refunding the second payment failed (${safeErrorMessage(error, 120)}). Razorpay will retry.` })
    // Non-2xx makes Razorpay retry; the refund key is stable, so the retry cannot refund twice.
    return { found: true, applied: false, code: order.code, refunded: false, refundFailed: true }
  }
}

/** How long a refund claim may stay "refunding" before another call may take it over (a crashed worker). */
export const REFUND_CLAIM_STALE_MS = 5 * 60_000

/** After this many automatic attempts that did not complete, the recovery job stops and a person is told. */
export const MAX_AUTOMATIC_REFUND_ATTEMPTS = 8

/**
 * Sends a paid online order's money back (reversing the restaurant's transfer) and records it, including Razorpay's own status for
 * the refund: `refunded` here means "Razorpay has the refund", and `refund_status` says whether it is still pending or processed.
 * A failure is counted; a final one (Razorpay refused, or created the refund and failed it) is marked so automatic retries stop and
 * is recorded for a person. Safe to repeat: the refund carries a stable idempotency key. Never called inside a transaction.
 */
export async function refundOrder(
  dealerId: string,
  order: { id: string; total: number; razorpayPaymentId: string | null; paymentStatus: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (order.paymentStatus === "refunded") return { ok: true }
  if (!order.razorpayPaymentId) return { ok: false, error: "This order has no online payment to refund." }
  const [dealer] = await unscopedDb.query.dealers.findMany({ where: (d, { eq: e }) => e(d.id, dealerId), limit: 1 })
  const db = scopedDb(dealerId)
  try {
    // A payment made without a linked account (test keys) has no transfer to reverse.
    const r = await refundPayment(order.razorpayPaymentId, order.total, Boolean(dealer && payoutAccountFor(dealer)))
    await db.orders.update(
      { paymentStatus: "refunded", refundedAt: new Date(), refundId: r.refundId, refundStatus: r.status === "processed" ? "processed" : "pending", refundError: null },
      eq(orders.id, order.id),
    )
    await clearException("refund_failed", order.id)
    return { ok: true }
  } catch (error) {
    const final = isFinalRefundFailure(error)
    console.error(`refund failed: ${safeErrorMessage(error)}`)
    await db.orders
      .update({ refundAttempts: sql`${orders.refundAttempts} + 1` as unknown as number, refundError: safeErrorMessage(error, 200), ...(final ? { refundStatus: "failed" } : {}) }, eq(orders.id, order.id))
      .catch(() => {})
    if (final) {
      countMetric("order_refund_failed_final")
      await recordException({ kind: "refund_failed", ref: order.id, businessId: dealerId, detail: `Razorpay would not complete the refund of an online order: ${safeErrorMessage(error, 160)}` })
    }
    return { ok: false, error: "The refund could not be sent. Try again in a minute." }
  }
}

/**
 * The recovery job's work for Eats: finishes refunds the webhook path left behind, and asks Razorpay how pending ones ended. It
 * covers a claim left "refunding" by a crash, a late payment for a cancelled order whose refund failed and was released, and a
 * refund Razorpay accepted but has not yet processed. Bounded, oldest first. Safe to run at any moment, including while a webhook
 * is handling the same order: the claim is a conditional update, and the refund's idempotency key is the same either way, so one
 * logical refund can never become two. Definite failures and orders past the attempt limit are left for a person.
 */
export async function reconcileOrderRefunds(now = new Date(), limit = 50, only: { dealerId?: string } = {}): Promise<{ retried: number; completed: number; processed: number; failed: number; stillPending: number; leftForPerson: number }> {
  const out = { retried: 0, completed: 0, processed: 0, failed: 0, stillPending: 0, leftForPerson: 0 }
  const stale = new Date(now.getTime() - REFUND_CLAIM_STALE_MS)
  const settle = new Date(now.getTime() - 2 * 60_000)
  const scope = only.dealerId ? eq(orders.dealerId, only.dealerId) : undefined
  const due = await unscopedDb
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.paymentMethod, "online"),
        scope,
        or(
          // 1. a claim a crashed worker left behind
          and(eq(orders.paymentStatus, "refunding"), lt(orders.updatedAt, stale), isNull(orders.refundStatus)),
          // 2. a late payment for a cancelled order whose refund failed and was released (a person is not needed unless it is final)
          and(eq(orders.paymentStatus, "pending"), eq(orders.status, "cancelled"), isNotNull(orders.razorpayPaymentId), isNull(orders.refundStatus), lt(orders.updatedAt, settle)),
          // 3. Razorpay has the refund; has it finished?
          and(eq(orders.paymentStatus, "refunded"), eq(orders.refundStatus, "pending"), isNotNull(orders.refundId), lt(orders.updatedAt, settle)),
        ),
      ),
    )
    .orderBy(asc(orders.updatedAt))
    .limit(limit)

  for (const o of due) {
    try {
      const db = scopedDb(o.dealerId)
      if (o.paymentStatus === "refunded") {
        const status = await getRefundStatus(o.refundId as string)
        if (status === "processed") {
          await db.orders.update({ refundStatus: "processed", refundError: null, updatedAt: now }, and(eq(orders.id, o.id), eq(orders.refundStatus, "pending"))!)
          await clearException("refund_stuck", o.id)
          out.processed++
        } else if (status === "failed") {
          await db.orders.update({ refundStatus: "failed", refundError: "Razorpay reported the refund as failed", updatedAt: now }, and(eq(orders.id, o.id), eq(orders.refundStatus, "pending"))!)
          await recordException({ kind: "refund_failed", ref: o.id, businessId: o.dealerId, detail: "Razorpay accepted the refund and then reported it as failed. The guest has not been repaid." })
          out.failed++
        } else out.stillPending++
        continue
      }
      if (o.refundAttempts >= MAX_AUTOMATIC_REFUND_ATTEMPTS) {
        out.leftForPerson++
        await recordException({ kind: "refund_failed", ref: o.id, businessId: o.dealerId, detail: `The refund did not complete after ${o.refundAttempts} automatic attempts (${o.refundError ?? "no reason recorded"}).` })
        continue
      }
      // Take the order the same way the webhook path does, so the two can never both be refunding it.
      const claimed = await db.orders
        .update({ paymentStatus: "refunding", updatedAt: now }, and(eq(orders.id, o.id), or(eq(orders.paymentStatus, "pending"), and(eq(orders.paymentStatus, "refunding"), lt(orders.updatedAt, stale))))!)
        .returning({ id: orders.id })
      if (claimed.length !== 1) continue
      out.retried++
      const done = await refundOrder(o.dealerId, { ...o, paymentStatus: "paid" })
      if (done.ok) out.completed++
      else await db.orders.update({ paymentStatus: "pending" }, and(eq(orders.id, o.id), eq(orders.paymentStatus, "refunding"))!)
    } catch (error) {
      console.error(`order refund reconcile failed for one order: ${safeErrorMessage(error)}`)
    }
  }
  return out
}

/**
 * Drops online orders nobody paid for within the window and gives their stock back. Called lazily from the pages
 * and actions that read orders, so no background job is needed.
 */
export async function expireUnpaidOrders(dealerId: string, now = new Date(), opts: { verifyWithProvider?: boolean } = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - PAYMENT_WINDOW_MINUTES * 60_000)
  const db = scopedDb(dealerId)
  const stale = await db.orders.select(and(eq(orders.status, "pending_payment"), lt(orders.createdAt, cutoff)), { limit: 50 })
  let n = 0
  for (const o of stale) {
    // The scheduled run asks Razorpay first: if the order WAS paid and its notification never arrived, apply the payment instead of
    // cancelling an order the guest has paid for. If Razorpay cannot be asked, leave it for the next run (never guess with money).
    if (opts.verifyWithProvider && o.razorpayOrderId) {
      try {
        const paymentId = await getCapturedPaymentId(o.razorpayOrderId)
        if (paymentId) {
          await applyOrderPayment(o.razorpayOrderId, paymentId, now, dealerId)
          countMetric("payment_recovered_by_poll", { product: "eats" })
          await recordException({ kind: "webhook_failed", ref: paymentId, businessId: dealerId, detail: `Order ${o.code} was paid but no notification arrived; the payment was found by asking Razorpay and applied.`, status: "resolved" })
          continue
        }
      } catch (error) {
        console.error(`could not ask Razorpay about an unpaid order: ${safeErrorMessage(error)}`)
        continue
      }
    }
    // Cancel and restock in one transaction; if a payment, a guest or another run got there first, this returns false.
    if (await cancelAndRestock(dealerId, { id: o.id }, ["pending_payment"], "expired unpaid", { updatedAt: now })) n++
  }
  return n
}
