import { and, eq, isNull, lt, or } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { dealers } from "../db/schema"

export type DealerBilling = Pick<
  typeof dealers.$inferSelect,
  "id" | "slug" | "plan" | "billingCycle" | "trialEndsAt" | "paidThrough" | "cancelRequestedAt" | "nextPlan" | "nextBillingCycle" | "nextPlanStartsAt" | "subscriptionId" | "subscriptionStatus"
>

export async function getDealerBilling(dealerId: string): Promise<DealerBilling | null> {
  const [row] = await unscopedDb
    .select({
      id: dealers.id,
      slug: dealers.slug,
      plan: dealers.plan,
      billingCycle: dealers.billingCycle,
      trialEndsAt: dealers.trialEndsAt,
      paidThrough: dealers.paidThrough,
      cancelRequestedAt: dealers.cancelRequestedAt,
      nextPlan: dealers.nextPlan,
      nextBillingCycle: dealers.nextBillingCycle,
      nextPlanStartsAt: dealers.nextPlanStartsAt,
      subscriptionId: dealers.subscriptionId,
      subscriptionStatus: dealers.subscriptionStatus,
    })
    .from(dealers)
    .where(eq(dealers.id, dealerId))
    .limit(1)
  return row ?? null
}

export type BillingUpdate = Partial<Pick<DealerBilling, "plan" | "billingCycle" | "paidThrough" | "cancelRequestedAt" | "nextPlan" | "nextBillingCycle" | "nextPlanStartsAt" | "subscriptionId" | "subscriptionStatus">>

export async function updateDealerBilling(dealerId: string, update: BillingUpdate): Promise<void> {
  await unscopedDb.update(dealers).set(update).where(eq(dealers.id, dealerId))
}

/**
 * Moves the paid-through date forward, never back, in ONE statement. The comparison happens in the database, so two events processed
 * at the same time (webhook plus checkout confirmation, or Razorpay retries) can never leave an older date over a newer one.
 */
export async function advancePaidThrough(dealerId: string, to: Date): Promise<void> {
  await unscopedDb
    .update(dealers)
    .set({ paidThrough: to })
    .where(and(eq(dealers.id, dealerId), or(isNull(dealers.paidThrough), lt(dealers.paidThrough, to))))
}
