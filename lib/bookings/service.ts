import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm"

import { audit } from "../core/audit"
import { countMetric } from "../core/metrics"
import { clearException, recordException } from "../core/payment-exceptions"
import { safeErrorMessage } from "../core/safe-error"
import { unscopedDb } from "../db/client"
import { auditLog, bookings, cars, leads } from "../db/schema"
import { scopedDb, scopedTransaction, type ScopedDb } from "../db/scoped"
import { getCapturedPaymentId, getRefundStatus, RefundError, refundBookingPayment, type RefundResult } from "../route/razorpay"
import { getDealerRouteAccountByAccountId, updateDealerRouteAccount } from "../tenant/route"

type Booking = typeof bookings.$inferSelect

/**
 * Where a booking's refund stands, in words a caller can show. Never `processed` unless Razorpay says so.
 *  - owed:      we must refund and have not created the refund yet (it is retried automatically)
 *  - pending:   Razorpay accepted the refund and is sending it (normal-speed refunds take days)
 *  - processed: Razorpay reports it sent
 *  - failed:    Razorpay created the refund and it failed; a person has to look at it
 */
export type BookingRefund = "owed" | "pending" | "processed" | "failed"

export type BookingPaymentResult = {
  /** True only when this call took the booking (marked it paid and the car on hold). */
  applied: boolean
  /**
   * applied:        this call took the booking and the car
   * already_applied: this same payment was applied before (webhook and client confirmation both arrive)
   * lost:           another buyer got the car first; this payment is being refunded (see `refund`)
   * other_payment:  the booking already holds a different payment (a double charge); the booking is unchanged and the extra
   *                 payment is refunded (see `refund`)
   * not_found:      no booking has this Razorpay order
   */
  status: "applied" | "already_applied" | "lost" | "other_payment" | "not_found"
  refund?: BookingRefund
  /** The refund could not be created just now and should be tried again; the webhook answers non-2xx so Razorpay retries. */
  refundFailed?: boolean
}

/** Thrown inside the claim transaction to undo the car claim when the booking turns out to have been settled by someone else. */
class SettledElsewhere extends Error {}

const isUniqueViolation = (e: unknown) => ((e as { cause?: { code?: string }; code?: string })?.cause?.code ?? (e as { code?: string })?.code) === "23505"

/**
 * Marks a booking paid and puts the car on hold for it, or, when the car is no longer available, starts a refund. Called by both
 * the checkout confirmation and the webhook (in either order, any number of times), so it must give the same answer every time.
 *
 * One short transaction, nothing but database statements:
 *  1. claim the car: live -> on_hold. This is the serialisation point, so two buyers can never both get it;
 *  2. claim the booking: created -> paid. Whoever fails here undoes step 1 and re-reads;
 *  3. write the lead, once, because only the claimant reaches this step.
 * The car is claimed first on purpose: a buyer who loses the car never touches `paid`, so the one-paid-booking-per-car index is
 * a backstop that is never hit in normal running. Razorpay is called only after the transaction has committed.
 */
export async function applyBookingPayment(orderId: string, paymentId: string): Promise<BookingPaymentResult> {
  const [booking] = await unscopedDb.select().from(bookings).where(eq(bookings.razorpayOrderId, orderId)).limit(1)
  if (!booking) return { applied: false, status: "not_found" }
  return settle(booking, paymentId, 0)
}

async function settle(booking: Booking, paymentId: string, depth: number): Promise<BookingPaymentResult> {
  if (booking.status !== "created" && booking.razorpayPaymentId && booking.razorpayPaymentId !== paymentId) {
    // A second, different payment on an order that already holds one: the buyer was charged twice. The first payment is the one
    // we hold; the second is sent back, once (its refund key is its own payment id), and the event is recorded.
    countMetric("booking_payment_mismatch")
    const r = await refundExtraPayment(booking, paymentId)
    return { applied: false, status: "other_payment", refund: r.refund, ...(r.retry ? { refundFailed: true } : {}) }
  }
  if (booking.status === "paid") return { applied: false, status: "already_applied" }
  if (booking.status === "refund_pending" || booking.status === "refunded") {
    // The dealer refunded a booking that was properly paid: a late duplicate event is not "someone else got the car".
    return booking.refundReason === "dealer" ? { applied: false, status: "already_applied" } : lost(booking)
  }
  if (depth > 2) throw new Error("booking could not be settled")

  const now = new Date()
  let outcome: "applied" | "car_taken" | "raced" | "closed"
  try {
    outcome = await scopedTransaction(booking.dealerId, async (db) => {
      if (booking.status !== "created") {
        // Cancelled or failed before the money arrived: the payment cannot be honoured.
        const owed = await owe(db, booking.id, paymentId, "booking_closed", now, ["failed", "cancelled"])
        return owed ? "closed" : "raced"
      }
      const car = await db.cars.update({ status: "on_hold" }, and(eq(cars.id, booking.carId), eq(cars.status, "live"))!).returning({ id: cars.id })
      if (car.length === 0) {
        const owed = await owe(db, booking.id, paymentId, "car_unavailable", now, ["created"])
        return owed ? "car_taken" : "raced"
      }
      const paid = await db.bookings
        .update({ status: "paid", paidAt: now, razorpayPaymentId: paymentId }, and(eq(bookings.id, booking.id), eq(bookings.status, "created"))!)
        .returning({ id: bookings.id })
      if (paid.length === 0) throw new SettledElsewhere() // rolls the car claim back too
      const [lead] = await db.leads
        .insert({ carId: booking.carId, name: booking.buyerName, phone: booking.buyerPhone, source: "hold", status: "won", consentAt: now })
        .returning({ id: leads.id })
      await db.bookings.update({ leadId: lead.id }, eq(bookings.id, booking.id))
      return "applied"
    })
  } catch (error) {
    if (!(error instanceof SettledElsewhere) && !isUniqueViolation(error)) throw error
    outcome = "raced" // the one-paid-booking index or a concurrent claim got there first: look again
  }

  if (outcome === "applied") return { applied: true, status: "applied" }
  const [fresh] = await scopedDb(booking.dealerId).bookings.select(eq(bookings.id, booking.id), { limit: 1 })
  if (!fresh) throw new Error("booking disappeared")
  return settle(fresh, paymentId, depth + 1)
}

/** Moves a booking that cannot be honoured into the refund workflow. Conditional, so it never overwrites a paid booking. */
async function owe(db: ScopedDb, id: string, paymentId: string, reason: string, now: Date, from: Booking["status"][]): Promise<boolean> {
  const rows = await db.bookings
    .update(
      { status: "refund_pending", razorpayPaymentId: paymentId, paidAt: now, refundReason: reason, refundRequestedAt: now },
      and(eq(bookings.id, id), or(...from.map((s) => eq(bookings.status, s))))!,
    )
    .returning({ id: bookings.id })
  return rows.length === 1
}

/**
 * Sends back a payment that is not the one the booking holds. Idempotent: the refund key comes from the payment id, so webhook
 * retries and the two event types for one payment make one refund. The audit entry is written once per payment.
 */
async function refundExtraPayment(booking: Booking, paymentId: string): Promise<{ refund: BookingRefund; retry: boolean }> {
  const db = scopedDb(booking.dealerId)
  try {
    const r = await refundBookingPayment(paymentId, booking.amount)
    const seen = await db.auditLog.select(and(eq(auditLog.entity, "booking"), eq(auditLog.entityId, booking.id), eq(auditLog.action, "payment.duplicate_refunded"), sql`${auditLog.diff}->>'paymentId' = ${paymentId}`), { limit: 1 })
    if (seen.length === 0) {
      await audit(db, { actorType: "webhook", actorId: "razorpay", action: "payment.duplicate_refunded", entity: "booking", entityId: booking.id, diff: { paymentId, keptPaymentId: booking.razorpayPaymentId, refundId: r.refundId, refundStatus: r.status } })
    }
    await recordException({ kind: "duplicate_payment", ref: paymentId, businessId: booking.dealerId, detail: `Double charge on booking ${booking.id}: the second payment was refunded automatically (refund ${r.status}).`, status: "resolved" })
    return { refund: r.status, retry: false }
  } catch (error) {
    const providerFailed = error instanceof RefundError && error.kind === "failed"
    console.error(`duplicate payment refund not completed: ${describe(error)}`)
    countMetric("booking_duplicate_refund_failed", { kind: providerFailed ? "failed" : "retryable" })
    await recordException({ kind: "duplicate_payment", ref: paymentId, businessId: booking.dealerId, detail: `Double charge on booking ${booking.id}: refunding the second payment failed (${describe(error)}).` })
    return providerFailed ? { refund: "failed", retry: false } : { refund: "owed", retry: true }
  }
}

async function lost(booking: Booking): Promise<BookingPaymentResult> {
  const r = await settleBookingRefund(booking.dealerId, booking.id)
  return { applied: false, status: "lost", refund: r.refund, ...(r.retry ? { refundFailed: true } : {}) }
}

// ---------- refunds ----------

const describe = (error: unknown) => safeErrorMessage(error)

/** Records what Razorpay says about a refund we created. Only a processed refund finishes the booking. */
async function recordRefund(db: ScopedDb, id: string, refund: Pick<RefundResult, "refundId" | "status">): Promise<BookingRefund> {
  const processed = refund.status === "processed"
  await db.bookings.update(
    { refundId: refund.refundId, refundStatus: refund.status, refundError: null, ...(processed ? { status: "refunded" as const, refundedAt: new Date() } : {}) },
    and(eq(bookings.id, id), eq(bookings.status, "refund_pending"))!,
  )
  if (processed) await clearException("refund_stuck", id)
  return processed ? "processed" : "pending"
}

/**
 * Takes a booking that is owed a refund as far as it can go right now. The owed state is already saved, so a crash anywhere here
 * only delays the refund: the cron job picks it up. The Razorpay call carries the shared wrapper's stable idempotency key, so
 * repeating it (concurrent clicks, webhook retries, the job) can never create a second refund. Never inside a transaction.
 * `retry` is true when the refund could not be created now and trying again is the right response.
 */
export async function settleBookingRefund(dealerId: string, bookingId: string): Promise<{ refund: BookingRefund; retry: boolean }> {
  const db = scopedDb(dealerId)
  const [b] = await db.bookings.select(eq(bookings.id, bookingId), { limit: 1 })
  if (!b) return { refund: "owed", retry: false }
  if (b.status === "refunded") return { refund: "processed", retry: false }
  if (b.status !== "refund_pending") return { refund: "owed", retry: false }
  if (b.refundStatus === "failed") return { refund: "failed", retry: false } // Razorpay failed it: needs a person, not a loop
  if (b.refundStatus === "pending" && b.refundId) return { refund: "pending", retry: false }
  if (!b.razorpayPaymentId) return { refund: "owed", retry: false }
  try {
    return { refund: await recordRefund(db, b.id, await refundBookingPayment(b.razorpayPaymentId, b.amount)), retry: false }
  } catch (error) {
    const providerFailed = error instanceof RefundError && error.kind === "failed"
    console.error(`booking refund not completed: ${describe(error)}`)
    await db.bookings.update({ refundError: describe(error), ...(providerFailed ? { refundStatus: "failed" } : {}) }, and(eq(bookings.id, b.id), eq(bookings.status, "refund_pending"))!)
    if (providerFailed) await recordException({ kind: "refund_failed", ref: b.id, businessId: dealerId, detail: `Razorpay created the refund for a car booking and then failed it (${describe(error)}). The buyer has not been repaid.` })
    return providerFailed ? { refund: "failed", retry: false } : { refund: "owed", retry: true }
  }
}

/**
 * The dealer refunds a paid booking. The intent is saved first (paid -> refund_pending, one conditional statement), then Razorpay is
 * called, then the result is recorded. A crash between any two steps leaves a state the job or a second click finishes. The car is
 * NOT returned to live: whether a refunded car is on sale again is the dealer's call.
 */
export async function startDealerRefund(dealerId: string, bookingId: string, actorId = "unknown"): Promise<{ ok: true; refund: "pending" | "processed" } | { ok: false; error: string }> {
  const db = scopedDb(dealerId)
  const [b] = await db.bookings.select(eq(bookings.id, bookingId), { limit: 1 })
  if (!b) return { ok: false, error: "Booking not found." }
  if (b.status === "refunded") return { ok: false, error: "This booking has already been refunded." }
  if (b.status === "paid") {
    if (!b.razorpayPaymentId) return { ok: false, error: "No payment recorded for this booking." }
    // The intent and the record of who asked for it commit together, before Razorpay is called.
    await scopedTransaction(dealerId, async (tx) => {
      const moved = await tx.bookings.update({ status: "refund_pending", refundReason: "dealer", refundRequestedAt: new Date() }, and(eq(bookings.id, b.id), eq(bookings.status, "paid"))!).returning({ id: bookings.id })
      if (moved.length === 1) await audit(tx, { actorType: "user", actorId, action: "payment.refund", entity: "booking", entityId: b.id, diff: { amountRupees: b.amount, reason: "dealer" } })
    })
  } else if (b.status !== "refund_pending") {
    return { ok: false, error: "Only a paid booking can be refunded." }
  }
  const r = await settleBookingRefund(dealerId, bookingId)
  if (r.refund === "pending" || r.refund === "processed") return { ok: true, refund: r.refund }
  if (r.refund === "failed") return { ok: false, error: "Razorpay could not complete this refund. Please contact support." }
  return { ok: false, error: "The refund is saved but could not be sent right now. It will be retried automatically, or try again in a minute." }
}

/** Refunds that are owed but not created, and refunds Razorpay is still sending, are looked at this long after they began. */
export const REFUND_RETRY_AFTER_MS = 2 * 60_000

/**
 * The cron job's work: create refunds that are owed, and ask Razorpay how pending ones ended. Safe to run again at any time.
 * Refunds Razorpay marked failed are left alone for a person. `only.dealerId` limits the pass to one business (the cron job passes
 * nothing and covers everyone).
 */
export async function reconcileBookingRefunds(now = new Date(), limit = 50, only: { dealerId?: string } = {}): Promise<{ created: number; processed: number; failed: number; stillPending: number }> {
  const due = await unscopedDb
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "refund_pending"),
        lte(bookings.refundRequestedAt, new Date(now.getTime() - REFUND_RETRY_AFTER_MS)),
        or(isNull(bookings.refundStatus), eq(bookings.refundStatus, "pending")),
        only.dealerId ? eq(bookings.dealerId, only.dealerId) : undefined,
      ),
    )
    .orderBy(asc(bookings.refundRequestedAt))
    .limit(limit)
  const out = { created: 0, processed: 0, failed: 0, stillPending: 0 }
  for (const b of due) {
    try {
      const db = scopedDb(b.dealerId)
      if (b.refundStatus === "pending" && b.refundId) {
        const status = await getRefundStatus(b.refundId)
        if (status === "processed") {
          await recordRefund(db, b.id, { refundId: b.refundId, status: "processed" })
          out.processed++
        } else if (status === "failed") {
          await db.bookings.update({ refundStatus: "failed", refundError: "Razorpay reported the refund as failed" }, and(eq(bookings.id, b.id), eq(bookings.status, "refund_pending"))!)
          await recordException({ kind: "refund_failed", ref: b.id, businessId: b.dealerId, detail: "Razorpay accepted the refund for a car booking and then reported it as failed. The buyer has not been repaid." })
          out.failed++
        } else out.stillPending++
        continue
      }
      const r = await settleBookingRefund(b.dealerId, b.id)
      if (r.refund === "processed") out.processed++
      else if (r.refund === "pending") out.created++
      else if (r.refund === "failed") out.failed++
    } catch (error) {
      console.error(`booking refund reconcile failed for one booking: ${describe(error)}`)
    }
  }
  return out
}

/** Reconciles a Route linked account's activation status onto its dealer. */
export async function applyAccountStatus(accountId: string, status: string): Promise<{ applied: boolean }> {
  const dealer = await getDealerRouteAccountByAccountId(accountId)
  if (!dealer) return { applied: false }
  await updateDealerRouteAccount(dealer.id, { razorpayAccountStatus: status })
  return { applied: true }
}

/** A booking is looked at once it has been waiting this long for its payment confirmation, and for a week after. */
export const UNCONFIRMED_AFTER_MS = 15 * 60_000
export const UNCONFIRMED_GIVE_UP_MS = 7 * 86_400_000

/**
 * The scheduled run's safety net for a payment whose notification never arrived: for each booking still waiting for payment, ask
 * Razorpay (a read) whether it was in fact paid, and if so apply it exactly as a webhook would (including refunding the buyer when
 * the car has gone to someone else). Bounded, oldest first; a Razorpay error leaves the booking for the next run.
 */
export async function reconcileUnconfirmedBookings(now = new Date(), limit = 50, only: { dealerId?: string } = {}): Promise<{ checked: number; recovered: number }> {
  const due = await unscopedDb
    .select({ id: bookings.id, orderId: bookings.razorpayOrderId, dealerId: bookings.dealerId })
    .from(bookings)
    .where(and(eq(bookings.status, "created"), lte(bookings.createdAt, new Date(now.getTime() - UNCONFIRMED_AFTER_MS)), gte(bookings.createdAt, new Date(now.getTime() - UNCONFIRMED_GIVE_UP_MS)), only.dealerId ? eq(bookings.dealerId, only.dealerId) : undefined))
    .orderBy(asc(bookings.createdAt))
    .limit(limit)
  let recovered = 0
  for (const b of due) {
    try {
      const paymentId = await getCapturedPaymentId(b.orderId)
      if (!paymentId) continue
      await applyBookingPayment(b.orderId, paymentId)
      recovered++
      countMetric("payment_recovered_by_poll", { product: "motors" })
      await recordException({ kind: "webhook_failed", ref: paymentId, businessId: b.dealerId, detail: `Booking ${b.id} was paid but no notification arrived; the payment was found by asking Razorpay and applied.`, status: "resolved" })
    } catch (error) {
      console.error(`could not check a waiting booking with Razorpay: ${describe(error)}`)
    }
  }
  return { checked: due.length, recovered }
}
