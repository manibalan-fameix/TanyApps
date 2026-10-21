// Thin per-vertical wrappers over lib/core/payments. The generic Razorpay code lives there; this file keeps the names the
// Motors and Eats flows already use and tags each order with what it is for (notes.kind).
import { createRouteOrder, refundPayment, verifyCheckoutSignature } from "../core/payments/razorpay-api"
import { razorpayCredentials } from "../billing/razorpay"

export { createLinkedAccount, getAccountStatus, refundPayment, requestRouteProduct, type LinkedAccountInput } from "../core/payments/razorpay-api"
export const verifyBookingPaymentSignature = verifyCheckoutSignature

/** A buyer's booking payment for a car: the full amount goes straight to the dealer's linked account (no platform cut). */
export function createBookingOrder(input: { amount: number; linkedAccountId: string; notes: Record<string, string> }) {
  return createRouteOrder({ kind: "motors_booking", amount: input.amount, linkedAccountId: input.linkedAccountId, notes: input.notes })
}

/** A food order's payment. Without a linked account no transfer is made, which callers allow only for Razorpay test keys. */
export function createFoodOrder(input: { amount: number; receipt: string; linkedAccountId: string | null; notes: Record<string, string> }) {
  return createRouteOrder({ kind: "eats_order", ...input })
}

/**
 * Refund of a car booking payment. Note: unlike food refunds this does not ask Razorpay to reverse the transfer to the
 * dealer's linked account (unchanged behaviour, see docs/tanycabs/progress/phase-0.md "known gaps").
 */
export async function refundBookingPayment(paymentId: string, amount: number): Promise<void> {
  if (!razorpayCredentials()) return
  await refundPayment(paymentId, amount, false)
}
