import { type BillingCycle, type SellablePlanKey, BILLING_CYCLES, FREE_PLAN_KEY, PLANS, SELLABLE_PLAN_KEYS } from "../plans"
import { billingState, nextSubscriptionStatus } from "./state"
import { advancePaidThrough, getDealerBilling, updateDealerBilling } from "../tenant/billing"
import { type RazorpaySubscription, cancelSubscription } from "./razorpay"

const ADOPTABLE = new Set(["authenticated", "active"])

function notesOf(sub: Pick<RazorpaySubscription, "notes">) {
  const n = Array.isArray(sub.notes) ? {} : (sub.notes ?? {})
  const plan = (SELLABLE_PLAN_KEYS as readonly string[]).includes(n.plan ?? "") ? (n.plan as SellablePlanKey) : null
  const cycle = (BILLING_CYCLES as readonly string[]).includes(n.cycle ?? "") ? (n.cycle as BillingCycle) : null
  return { dealerId: n.dealer_id ?? null, plan, cycle }
}

/**
 * Applies what Razorpay says about a subscription to its dealer. Used by the webhook and by checkout
 * confirmation, so either can arrive first. Safe to run more than once for the same event.
 *  - The dealer's current subscription: its status and paid-through date are updated.
 *  - A different, newly authorised subscription (a plan change): it becomes the current one and the old
 *    one is stopped at the end of the period already paid for.
 *  - Anything else, such as events for a replaced subscription, is ignored.
 */
export async function applySubscription(sub: RazorpaySubscription, dealerIdCheck?: string): Promise<{ applied: boolean }> {
  const { dealerId, plan, cycle } = notesOf(sub)
  if (!dealerId || (dealerIdCheck && dealerIdCheck !== dealerId)) return { applied: false }
  const dealer = await getDealerBilling(dealerId)
  if (!dealer) return { applied: false }

  const paidThrough = sub.status === "active" && sub.current_end ? new Date(sub.current_end * 1000) : undefined
  const isCurrent = dealer.subscriptionId === sub.id

  if (isCurrent) {
    const charged = paidThrough && (!dealer.paidThrough || paidThrough > dealer.paidThrough)
    await updateDealerBilling(dealerId, {
      subscriptionStatus: nextSubscriptionStatus(dealer.subscriptionStatus, sub.status),
      // A new charge means the period the old plan covered is over: a waiting plan change takes over now.
      ...(charged && dealer.nextPlan
        ? { plan: dealer.nextPlan, billingCycle: dealer.nextBillingCycle ?? dealer.billingCycle, nextPlan: null, nextBillingCycle: null, nextPlanStartsAt: null }
        : {}),
    })
    // Never move the paid-through date backwards: compared inside the database, so concurrent events cannot undo each other.
    if (paidThrough) await advancePaidThrough(dealerId, paidThrough)
    return { applied: true }
  }

  if (!ADOPTABLE.has(sub.status) || !plan || !cycle) return { applied: false }
  // A free dealer has no trial or paid period, so a plan that is not yet charged must not unlock paid limits.
  if (dealer.plan === FREE_PLAN_KEY && !paidThrough) return { applied: false }
  const previous = dealer.subscriptionId
  const state = billingState(dealer)
  // Mid-period change on a plan already paid for. An upgrade takes effect at once: it is charged now and
  // the old subscription is stopped. A downgrade keeps today's limits until the paid period ends, and the
  // new subscription is only charged then. During the free trial the change also applies at once.
  const midPeriod = state.phase === "active" && state.accessUntil != null
  const upgrade = midPeriod && (PLANS[plan].monthlyPrice ?? 0) > (PLANS[dealer.plan as keyof typeof PLANS]?.monthlyPrice ?? 0)
  const defer = midPeriod && !upgrade && sub.status === "authenticated" && plan !== dealer.plan
  await updateDealerBilling(dealerId, {
    subscriptionId: sub.id,
    subscriptionStatus: sub.status,
    cancelRequestedAt: null,
    ...(defer
      ? { nextPlan: plan, nextBillingCycle: cycle, nextPlanStartsAt: state.accessUntil }
      : { plan, billingCycle: cycle, nextPlan: null, nextBillingCycle: null, nextPlanStartsAt: null }),
  })
  if (paidThrough) await advancePaidThrough(dealerId, paidThrough)
  if (previous) {
    // A downgrade keeps the old plan running until its paid period ends; an upgrade replaces it now.
    await cancelSubscription(previous, dealer.subscriptionStatus === "active" && !upgrade).catch(() => undefined)
  }
  return { applied: true }
}
