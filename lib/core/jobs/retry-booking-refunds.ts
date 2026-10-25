import { and, eq, lt, or } from "drizzle-orm"

import { reconcileBookingRefunds, reconcileUnconfirmedBookings } from "../../bookings/service"
import { ATTENTION_LABEL, bookingAttention, EATS_REFUND_STALE_MIN, REFUND_PENDING_ALERT_DAYS, type RefundAttention } from "../../bookings/exceptions"
import { unscopedDb } from "../../db/client"
import { bookings, orders } from "../../db/schema"
import { countMetric } from "../metrics"
import { clearExceptionsExcept, type ExceptionKind, recordException } from "../payment-exceptions"
import type { Job } from "../scheduler"

export type AttentionKind = RefundAttention | "eats_refund_stuck" | "eats_refund_failed" | "eats_refund_slow" | "eats_cancelled_unrefunded"
export type AttentionCounts = Record<AttentionKind, number>
export type AttentionItem = { kind: AttentionKind; ref: string; businessId: string; exception: ExceptionKind; detail: string }

const EXCEPTION_OF: Record<AttentionKind, ExceptionKind> = {
  refund_failed: "refund_failed",
  refund_not_started: "refund_stuck",
  refund_slow: "refund_stuck",
  eats_refund_stuck: "refund_stuck",
  eats_refund_failed: "refund_failed",
  eats_refund_slow: "refund_stuck",
  eats_cancelled_unrefunded: "refund_stuck",
}

/**
 * Everything that needs a person right now, with the identifier to look it up by. Identifiers and plain-language reasons only: no
 * names, phone numbers or payment details, so it is safe to log and to keep. Motors: the three refund conditions in
 * lib/bookings/exceptions.ts. Eats: a refund claim stuck "in progress", a refund Razorpay failed, a refund pending far too long,
 * and a paid online order that is cancelled but whose money was never sent back.
 */
export async function paymentAttentionItems(now = new Date()): Promise<AttentionItem[]> {
  const items: AttentionItem[] = []
  const owed = await unscopedDb
    .select({ id: bookings.id, dealerId: bookings.dealerId, status: bookings.status, refundStatus: bookings.refundStatus, refundRequestedAt: bookings.refundRequestedAt })
    .from(bookings)
    .where(eq(bookings.status, "refund_pending"))
  for (const b of owed) {
    const kind = bookingAttention(b, now)
    if (kind) items.push({ kind, ref: b.id, businessId: b.dealerId, exception: EXCEPTION_OF[kind], detail: `Car booking refund: ${ATTENTION_LABEL[kind]}.` })
  }
  const stale = new Date(now.getTime() - EATS_REFUND_STALE_MIN * 60_000)
  const slow = new Date(now.getTime() - REFUND_PENDING_ALERT_DAYS * 86_400_000)
  const eats = await unscopedDb
    .select({ id: orders.id, dealerId: orders.dealerId, status: orders.status, paymentStatus: orders.paymentStatus, refundStatus: orders.refundStatus, updatedAt: orders.updatedAt })
    .from(orders)
    .where(
      and(
        eq(orders.paymentMethod, "online"),
        or(
          and(eq(orders.paymentStatus, "refunding"), lt(orders.updatedAt, stale)),
          eq(orders.refundStatus, "failed"),
          and(eq(orders.refundStatus, "pending"), lt(orders.updatedAt, slow)),
          and(eq(orders.status, "cancelled"), eq(orders.paymentStatus, "paid")),
        ),
      ),
    )
  for (const o of eats) {
    const kind: AttentionKind = o.refundStatus === "failed" ? "eats_refund_failed" : o.refundStatus === "pending" ? "eats_refund_slow" : o.paymentStatus === "refunding" ? "eats_refund_stuck" : "eats_cancelled_unrefunded"
    const what: Record<string, string> = {
      eats_refund_failed: "Online order refund failed: check it in Razorpay and refund by hand",
      eats_refund_slow: "Online order refund has been pending for too long",
      eats_refund_stuck: "Online order refund has been 'in progress' for too long",
      eats_cancelled_unrefunded: "A paid online order was cancelled but its money was never sent back",
    }
    items.push({ kind, ref: o.id, businessId: o.dealerId, exception: EXCEPTION_OF[kind], detail: `${what[kind]}.` })
  }
  return items
}

const ZERO: AttentionCounts = { refund_failed: 0, refund_not_started: 0, refund_slow: 0, eats_refund_stuck: 0, eats_refund_failed: 0, eats_refund_slow: 0, eats_cancelled_unrefunded: 0 }

/** Counts by kind (the monitoring figures). */
export async function paymentAttention(now = new Date()): Promise<AttentionCounts> {
  const out = { ...ZERO }
  for (const i of await paymentAttentionItems(now)) out[i.kind]++
  return out
}

/** Opens a record for everything that needs a person and closes the ones that have cleared, so the list is always the current truth. */
export async function syncPaymentExceptions(items: AttentionItem[]): Promise<void> {
  for (const i of items) await recordException({ kind: i.exception, ref: i.ref, businessId: i.businessId, detail: i.detail })
  for (const kind of ["refund_failed", "refund_stuck"] as ExceptionKind[]) {
    await clearExceptionsExcept([kind], items.filter((i) => i.exception === kind).map((i) => i.ref))
  }
}

/**
 * Finishes car-booking refunds: creates the ones that are owed (a buyer who lost the car, a dealer refund interrupted by a crash or a
 * Razorpay outage) and asks Razorpay how pending ones ended. Safe to repeat: the refund call carries a stable idempotency key and
 * every state change is conditional. Refunds Razorpay marked failed are left for a person. It also keeps the record of money
 * that needs a person (payment_exceptions) in step with reality, for Motors and Eats.
 */
export const retryBookingRefundsJob: Job = {
  name: "retry-booking-refunds",
  async run() {
    const found = await reconcileUnconfirmedBookings() // payments whose notification never arrived
    const r = await reconcileBookingRefunds()
    const items = await paymentAttentionItems()
    await syncPaymentExceptions(items)
    const attention = { ...ZERO }
    for (const i of items) attention[i.kind]++
    const total = items.length
    for (const [kind, n] of Object.entries(attention)) if (n > 0) countMetric("payment_needs_attention", { kind, n: String(n) })
    const note = total > 0 ? `; NEEDS A PERSON: ${Object.entries(attention).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(", ")}` : ""
    return `${found.recovered} unconfirmed payment(s) recovered, ${r.created} refund(s) started, ${r.processed} processed, ${r.failed} failed, ${r.stillPending} still pending${note}`
  },
}
