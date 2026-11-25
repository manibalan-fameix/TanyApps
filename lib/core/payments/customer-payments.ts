/**
 * Whether new online payments from a business's customers (food and shop orders, car bookings) may start through Tany's Razorpay
 * account, and whether a business may connect a payout account for them. On unless CUSTOMER_ONLINE_PAYMENTS is exactly "0".
 * Turn it off only after businesses have moved to their own payment gateways. Confirmations, webhooks and refunds for payments
 * that already exist do not read this, so money in flight is still handled. Subscription billing does not read it either.
 */
export function customerPaymentsEnabled(): boolean {
  return process.env.CUSTOMER_ONLINE_PAYMENTS !== "0"
}
