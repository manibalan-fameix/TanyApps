import { eq } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { dealers } from "../db/schema"

export type DealerBilling = Pick<
  typeof dealers.$inferSelect,
  "id" | "plan" | "billingCycle" | "trialEndsAt" | "paidThrough" | "cancelRequestedAt" | "nextPlan" | "nextBillingCycle" | "nextPlanStartsAt" | "subscriptionId" | "subscriptionStatus"
>

export async function getDealerBilling(dealerId: string): Promise<DealerBilling | null> {
  const [row] = await unscopedDb
    .select({
      id: dealers.id,
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
