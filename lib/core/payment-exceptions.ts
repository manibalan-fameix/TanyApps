import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { paymentExceptions } from "../db/schema"
import { countMetric } from "./metrics"
import { safeErrorMessage } from "./safe-error"

/**
 * The record of money that needs a person (see the table's comment in lib/db/schema/platform.ts).
 *
 *  - unmatched_payment: a captured payment that belongs to no order or booking of ours
 *  - duplicate_payment: a second payment on an order that already held one (refunded; kept for the record)
 *  - refund_failed:     Razorpay (or its answer to us) says a refund cannot be done
 *  - refund_stuck:      a refund owed or pending for longer than it should be
 *  - webhook_failed:    a webhook that keeps failing for the same payment
 */
export type ExceptionKind = "unmatched_payment" | "duplicate_payment" | "refund_failed" | "refund_stuck" | "webhook_failed"

export const EXCEPTION_HELP: Record<ExceptionKind, string> = {
  unmatched_payment: "A payment was captured that matches no booking or order. Find the buyer in the Razorpay dashboard, refund the payment there, then resolve this.",
  duplicate_payment: "A buyer was charged twice for one booking or order. The extra payment was refunded automatically (see the detail). Resolve once you have confirmed it in Razorpay.",
  refund_failed: "A refund could not be completed. Check the refund in the Razorpay dashboard (balance of the linked account, payment state), fix the cause, then refund by hand or reset the order's refund attempts.",
  refund_stuck: "A refund has been waiting too long. Check its status in the Razorpay dashboard; the retry job keeps trying and this clears itself when it completes.",
  webhook_failed: "Razorpay's notification for this payment keeps failing. Check the application logs for the cause; Razorpay will retry, and this clears when one succeeds.",
}

type Record_ = { kind: ExceptionKind; ref: string; businessId?: string | null; detail: string; /** "resolved" records something already handled (an automatic refund), for the trail. */ status?: "open" | "resolved" }

/**
 * Notes an exception, or updates it if it has been seen before (one row per kind and ref). Never throws: money handling must
 * not fail because the note about it could not be written. If it cannot be written the failure is counted instead.
 */
export async function recordException(e: Record_): Promise<void> {
  const status = e.status ?? "open"
  try {
    await unscopedDb
      .insert(paymentExceptions)
      .values({ kind: e.kind, ref: e.ref.slice(0, 120), businessId: e.businessId ?? null, detail: e.detail.slice(0, 500), status, ...(status === "resolved" ? { resolvedAt: new Date(), resolvedBy: "system", resolution: "handled automatically" } : {}) })
      .onConflictDoUpdate({
        target: [paymentExceptions.kind, paymentExceptions.ref],
        set: {
          occurrences: sql`${paymentExceptions.occurrences} + 1`,
          lastSeenAt: new Date(),
          detail: e.detail.slice(0, 500),
          businessId: e.businessId ?? sql`${paymentExceptions.businessId}`,
          // A problem that comes back reopens a closed one. Something that has now been handled closes an open one.
          ...(status === "open"
            ? { status: "open", resolvedAt: null, resolvedBy: null, resolution: null }
            : { status: "resolved", resolvedAt: new Date(), resolvedBy: "system", resolution: "handled automatically" }),
        },
      })
  } catch (error) {
    console.error(`could not record a payment exception: ${safeErrorMessage(error)}`)
    countMetric("payment_exception_record_failed", { kind: e.kind })
  }
}

/** Closes an exception that cleared by itself (a refund completed, a webhook finally succeeded). Never throws. */
export async function clearException(kind: ExceptionKind, ref: string): Promise<void> {
  try {
    await unscopedDb
      .update(paymentExceptions)
      .set({ status: "resolved", resolvedAt: new Date(), resolvedBy: "system", resolution: "cleared by itself" })
      .where(and(eq(paymentExceptions.kind, kind), eq(paymentExceptions.ref, ref), eq(paymentExceptions.status, "open")))
  } catch (error) {
    console.error(`could not clear a payment exception: ${safeErrorMessage(error)}`)
  }
}

/** For the monitoring job: closes every open exception of these kinds whose ref is no longer in `stillOpen`. */
export async function clearExceptionsExcept(kinds: ExceptionKind[], stillOpen: string[]): Promise<number> {
  const where = and(inArray(paymentExceptions.kind, kinds), eq(paymentExceptions.status, "open"), stillOpen.length ? notInArray(paymentExceptions.ref, stillOpen) : undefined)
  const rows = await unscopedDb.update(paymentExceptions).set({ status: "resolved", resolvedAt: new Date(), resolvedBy: "system", resolution: "cleared by itself" }).where(where).returning({ id: paymentExceptions.id })
  return rows.length
}

export async function listExceptions(opts: { status?: "open" | "resolved"; limit?: number } = {}) {
  return unscopedDb
    .select()
    .from(paymentExceptions)
    .where(opts.status ? eq(paymentExceptions.status, opts.status) : undefined)
    .orderBy(desc(paymentExceptions.lastSeenAt))
    .limit(opts.limit ?? 200)
}

/** A Tany team member closes an exception, with what they did. */
export async function resolveException(id: string, by: string, resolution: string): Promise<boolean> {
  const rows = await unscopedDb
    .update(paymentExceptions)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy: by.slice(0, 100), resolution: resolution.trim().slice(0, 500) })
    .where(and(eq(paymentExceptions.id, id), eq(paymentExceptions.status, "open")))
    .returning({ id: paymentExceptions.id })
  return rows.length === 1
}
