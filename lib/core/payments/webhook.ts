import { countMetric } from "../metrics"
import type { PaymentKind } from "./razorpay-api"

export type CapturedPayment = { orderId: string; paymentId: string; notes?: Record<string, unknown> | null }

/** What a flow's handler reports back. `found` is false when no order of that flow has this Razorpay order id. */
export type PaymentHandlerResult = { found: boolean; refundFailed?: boolean }
export type PaymentHandler = (orderId: string, paymentId: string) => Promise<PaymentHandlerResult>
export type PaymentHandlers = Record<PaymentKind, PaymentHandler>

export type DispatchOutcome = "handled" | "fallback" | "unmatched" | "ignored"

const KINDS: readonly PaymentKind[] = ["eats_order", "motors_booking"]
const isKind = (v: unknown): v is PaymentKind => typeof v === "string" && (KINDS as readonly string[]).includes(v)

/**
 * Routes a captured payment to the flow it belongs to, using `notes.kind` written when the order was created.
 *
 * - Known kind: that flow's handler runs.
 * - No kind: an order created before kinds existed. The two flows are tried in the old order (Eats, then Motors) and the
 *   hit is counted (`razorpay_webhook_fallback`), so the day the counter stops moving this branch can be deleted.
 * - Unknown kind: not ours to handle (acknowledged, logged, counted).
 *
 * Throws when a late payment's refund failed, so the caller answers non-2xx and Razorpay retries.
 */
export async function dispatchCapturedPayment(payment: CapturedPayment, handlers: PaymentHandlers): Promise<DispatchOutcome> {
  const kind = payment.notes?.kind

  if (isKind(kind)) {
    const result = await handlers[kind](payment.orderId, payment.paymentId)
    if (result.refundFailed) throw new Error("refund of a late payment failed")
    if (!result.found) {
      countMetric("razorpay_webhook_unmatched", { kind })
      return "unmatched"
    }
    return "handled"
  }

  if (kind !== undefined && kind !== null && kind !== "") {
    countMetric("razorpay_webhook_unknown_kind", { kind: String(kind).slice(0, 40) })
    return "ignored"
  }

  countMetric("razorpay_webhook_fallback")
  const eats = await handlers.eats_order(payment.orderId, payment.paymentId)
  if (eats.refundFailed) throw new Error("refund of a late payment failed")
  if (!eats.found) await handlers.motors_booking(payment.orderId, payment.paymentId)
  return "fallback"
}
