import { countMetric } from "../metrics"
import type { PaymentKind } from "./razorpay-api"

/** What a flow's handler reports back. `found` is false when no order of that flow has this Razorpay order id. */
export type PaymentHandlerResult = { found: boolean; refundFailed?: boolean; /** The payment changed something (marked an order paid, or refunded a late payment). */ applied?: boolean }
export type PaymentHandler = (orderId: string, paymentId: string) => Promise<PaymentHandlerResult>
export type PaymentHandlers = Record<PaymentKind, PaymentHandler>

/**
 * The two Razorpay events that announce a captured payment, and what each carries:
 *  - `order.paid` has the order entity, so `notes.kind` (written when we created the order) is there. PRIMARY.
 *  - `payment.captured` has only the payment entity, whose notes Razorpay documents as empty. FALLBACK.
 * Both fire for one payment, in either order. Each handler is idempotent (a payment is applied once and a late payment is
 * refunded once), so processing both is safe and either one alone is enough.
 */
export type PaymentEvent = {
  source: "order.paid" | "payment.captured"
  orderId: string
  paymentId: string
  /** `payload.order.entity.notes` for order.paid. Ignored for payment.captured. */
  orderNotes?: Record<string, unknown> | null
}

export type DispatchOutcome = "handled" | "fallback" | "unmatched" | "ignored"

const KINDS: readonly PaymentKind[] = ["eats_order", "motors_booking"]
const isKind = (v: unknown): v is PaymentKind => typeof v === "string" && (KINDS as readonly string[]).includes(v)

/**
 * Routes a payment event to the flow it belongs to.
 *
 * - `order.paid` with a known kind: that flow's handler runs, nothing is counted.
 * - `order.paid` with no kind (an order created before kinds existed): the old Eats-then-Motors lookup runs and the hit is
 *   counted as `razorpay_webhook_fallback`.
 * - `order.paid` with an unknown kind: acknowledged, counted (`razorpay_webhook_unknown_kind`), no flow touched.
 * - `payment.captured`: always the old lookup. It is counted as a fallback only when it actually did the work, meaning it beat
 *   `order.paid` (or `order.paid` is not enabled in the Razorpay dashboard). A steady stream of these means the primary path
 *   is not working; zero means it is, and this branch can be removed.
 *
 * Throws when a late payment's refund failed, so the caller answers non-2xx and Razorpay retries.
 */
export async function dispatchPaymentEvent(event: PaymentEvent, handlers: PaymentHandlers): Promise<DispatchOutcome> {
  const { orderId, paymentId } = event

  if (event.source === "order.paid") {
    const kind = event.orderNotes?.kind
    if (isKind(kind)) {
      const result = await handlers[kind](orderId, paymentId)
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
    countMetric("razorpay_webhook_fallback", { event: "order.paid", reason: "no_kind" })
    const looked = await legacyLookup(orderId, paymentId, handlers)
    if (!looked.found) {
      countMetric("razorpay_webhook_unmatched", { event: "order.paid", reason: "no_order" })
      return "unmatched"
    }
    return "fallback"
  }

  const looked = await legacyLookup(orderId, paymentId, handlers)
  if (looked.worked) countMetric("razorpay_webhook_fallback", { event: "payment.captured", reason: "did_the_work" })
  // A captured payment that belongs to no order of ours: money taken that nothing will ever act on. Counted so a person is told.
  if (!looked.found) {
    countMetric("razorpay_webhook_unmatched", { event: "payment.captured", reason: "no_order" })
    return "unmatched"
  }
  return "fallback"
}

/** The pre-kind lookup: the food flow first, then the car flow. `worked`: this call changed something. `found`: some flow owns the order. */
async function legacyLookup(orderId: string, paymentId: string, handlers: PaymentHandlers): Promise<{ worked: boolean; found: boolean }> {
  const eats = await handlers.eats_order(orderId, paymentId)
  if (eats.refundFailed) throw new Error("refund of a late payment failed")
  if (eats.found) return { worked: Boolean(eats.applied), found: true }
  const motors = await handlers.motors_booking(orderId, paymentId)
  if (motors.refundFailed) throw new Error("refund of a late payment failed")
  return { worked: Boolean(motors.applied), found: motors.found }
}
