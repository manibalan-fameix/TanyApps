/**
 * Who may move money. One place, so the rule is the same everywhere and a new role is a one-line change here.
 *
 * Refunding sends a customer's money back out of the business, so it is the owner's decision by default. Ordinary staff take and
 * prepare orders and bookings but cannot refund. This is enforced in the server actions, before anything changes; hiding a button
 * is not authorization.
 */
export type TeamRole = "owner" | "staff"

export const canRefund = (role: TeamRole | null | undefined): boolean => role === "owner"

export const REFUND_DENIED = "Only the owner can refund a payment."
