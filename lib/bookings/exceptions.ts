/**
 * When a car-booking refund needs a person. One definition, used by the Tany team's bookings grid and by the monitoring job, so
 * what an administrator sees and what raises an alert never disagree.
 */
export const REFUND_NOT_STARTED_AFTER_MIN = 15
/** Normal-speed refunds take days to reach a bank; this is generous, so an alert means something is actually wrong. */
export const REFUND_PENDING_ALERT_DAYS = 10

export type RefundAttention = "refund_failed" | "refund_not_started" | "refund_slow"

export const ATTENTION_LABEL: Record<RefundAttention, string> = {
  refund_failed: "Razorpay failed the refund: needs a person",
  refund_not_started: "Refund owed but not started: retry job is not clearing it",
  refund_slow: "Refund pending for too long: check with Razorpay",
}

type Refundable = { status: string; refundStatus: string | null; refundRequestedAt: Date | null }

export function bookingAttention(b: Refundable, now: Date): RefundAttention | null {
  if (b.status !== "refund_pending") return null
  if (b.refundStatus === "failed") return "refund_failed"
  const since = b.refundRequestedAt ? now.getTime() - b.refundRequestedAt.getTime() : Infinity
  if (b.refundStatus === null) return since > REFUND_NOT_STARTED_AFTER_MIN * 60_000 ? "refund_not_started" : null
  if (b.refundStatus === "pending") return since > REFUND_PENDING_ALERT_DAYS * 86_400_000 ? "refund_slow" : null
  return null
}

/** Eats: a paid online order is cancelled but its money was never sent back, or a refund claim has been "in progress" too long. */
export const EATS_REFUND_STALE_MIN = 15
