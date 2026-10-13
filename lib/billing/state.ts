import { FREE_PLAN_KEY, getPlan } from "../plans"

/** After a paid period ends, a dealer whose payment is still being retried keeps access for this long. */
export const GRACE_DAYS = 3

export type BillingInput = {
  /** The free plan never expires and needs no payment method. */
  plan?: string
  trialEndsAt: Date | null
  paidThrough: Date | null
  subscriptionStatus: string | null
  cancelRequestedAt?: Date | null
}

export type BillingState = {
  /** free: on the free plan, no payment needed. trial: free trial running. active: paid. grace: period over, payment being retried. suspended: no access. legacy: created before billing existed. */
  phase: "free" | "trial" | "active" | "grace" | "suspended" | "legacy"
  hasAccess: boolean
  /** End of the period that is already covered (trial or paid), if any. */
  accessUntil: Date | null
  /** Whole days left in that period, never negative. */
  daysLeft: number
  /** True when a payment method is authorised and the plan has not been cancelled. */
  hasPaymentMethod: boolean
  /** The owner cancelled: access continues to `accessUntil`, then the showroom goes offline. */
  cancelling: boolean
  /** A renewal payment failed while the paid period is still running. */
  paymentIssue: boolean
}

const DAY = 86_400_000
// Razorpay statuses where the owner has authorised a payment method and it has not been cancelled or halted.
const LIVE_STATUSES = new Set(["authenticated", "active", "pending"])

/**
 * Whether a showroom is allowed to be online. Dealers with no trial date were created before billing
 * existed and are never suspended.
 */
export function billingState(dealer: BillingInput, now = new Date()): BillingState {
  const status = dealer.subscriptionStatus ?? ""
  const cancelling = Boolean(dealer.cancelRequestedAt) || status === "cancelled"
  const hasPaymentMethod = LIVE_STATUSES.has(status) && !cancelling
  const paymentIssue = !cancelling && (status === "pending" || status === "halted")
  const flags = { hasPaymentMethod, cancelling, paymentIssue }
  if (dealer.plan === FREE_PLAN_KEY) {
    return { phase: "free", hasAccess: true, accessUntil: null, daysLeft: 0, hasPaymentMethod: false, cancelling: false, paymentIssue: false }
  }
  if (!dealer.trialEndsAt && !dealer.paidThrough) {
    return { phase: "legacy", hasAccess: true, accessUntil: null, daysLeft: 0, ...flags }
  }
  const ends = [dealer.trialEndsAt, dealer.paidThrough].filter((d): d is Date => d != null)
  const accessUntil = new Date(Math.max(...ends.map((d) => d.getTime())))
  const daysLeft = Math.max(0, Math.ceil((accessUntil.getTime() - now.getTime()) / DAY))

  if (now < accessUntil) {
    const paid = dealer.paidThrough != null && now < dealer.paidThrough
    return { phase: paid ? "active" : "trial", hasAccess: true, accessUntil, daysLeft, ...flags }
  }
  const inGrace = hasPaymentMethod && now.getTime() < accessUntil.getTime() + GRACE_DAYS * DAY
  return { phase: inGrace ? "grace" : "suspended", hasAccess: inGrace, accessUntil, daysLeft: 0, ...flags }
}

/**
 * The plan whose limits apply right now. A downgrade bought mid-period waits in `nextPlan` until the
 * period already paid for ends, so it never takes away what was paid for. An upgrade applies at once,
 * including one saved as pending before upgrades became immediate.
 */
export function effectivePlanKey(
  dealer: { plan: string; nextPlan?: string | null; nextPlanStartsAt?: Date | null },
  now = new Date(),
): string {
  if (!dealer.nextPlan) return dealer.plan
  const upgrade = (getPlan(dealer.nextPlan).monthlyPrice ?? 0) > (getPlan(dealer.plan).monthlyPrice ?? 0)
  return upgrade || (dealer.nextPlanStartsAt && now >= dealer.nextPlanStartsAt) ? dealer.nextPlan : dealer.plan
}
