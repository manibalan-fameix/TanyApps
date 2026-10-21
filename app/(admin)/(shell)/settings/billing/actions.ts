"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getDealerContext } from "@/lib/auth/context"
import { applySubscription } from "@/lib/billing/service"
import { cancelSubscription, createSubscription, getSubscription, verifySubscriptionSignature } from "@/lib/billing/razorpay"
import { billingState } from "@/lib/billing/state"
import { cars } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { cabLimitsFor } from "@/lib/cabs/limits"
import { BILLING_CYCLES, PLANS, SELLABLE_PLAN_KEYS } from "@/lib/plans"
import { rateLimit } from "@/lib/core/rate-limit"
import { getDealerBilling, updateDealerBilling } from "@/lib/tenant/billing"

export type Checkout = { subscriptionId: string; keyId: string }

const choice = z.object({ plan: z.enum(SELLABLE_PLAN_KEYS), cycle: z.enum(BILLING_CYCLES) })

/**
 * Prepares a subscription for the chosen plan. An upgrade on a paid plan is charged now and applies at
 * once. Otherwise (trial, downgrade) the first charge waits for the period already covered.
 */
export async function startCheckout(input: unknown): Promise<{ ok: true; checkout: Checkout } | { ok: false; error: string }> {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || ctx.devBypass) return { ok: false, error: "Please sign in again." }
  if (ctx.role !== "owner") return { ok: false, error: "Only the owner can change billing." }
  if (!(await rateLimit(`billing:${ctx.user.id}`, 10, 10 * 60_000))) return { ok: false, error: "Too many attempts. Try again in a few minutes." }
  const parsed = choice.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Choose a plan." }

  const dealer = await getDealerBilling(ctx.dealer.id)
  if (!dealer) return { ok: false, error: "Dealership not found." }
  const { accessUntil, hasAccess, phase } = billingState(dealer)
  // An upgrade on a paid plan is charged now and takes effect at once. Everything else waits for the covered period.
  const isUpgrade = phase === "active" && (PLANS[parsed.data.plan].monthlyPrice ?? 0) > (PLANS[dealer.plan as keyof typeof PLANS]?.monthlyPrice ?? 0)

  // A cab operator's smaller plan must still fit the vehicles and drivers they already have.
  if (ctx.dealer.industry === "cabs") {
    const limits = cabLimitsFor(parsed.data.plan)
    const db = scopedDb(dealer.id)
    const [vehicleCount, driverCount] = await Promise.all([db.vehicles.count(), db.drivers.count()])
    if (limits && vehicleCount > limits.vehicles) return { ok: false, error: `You have ${vehicleCount} vehicles and ${PLANS[parsed.data.plan].label} allows ${limits.vehicles}. Remove ${vehicleCount - limits.vehicles} first.` }
    if (limits && driverCount > limits.drivers) return { ok: false, error: `You have ${driverCount} drivers and ${PLANS[parsed.data.plan].label} allows ${limits.drivers}. Remove ${driverCount - limits.drivers} first.` }
  }

  // A smaller plan must still fit the cars that are already live.
  const cap = PLANS[parsed.data.plan].maxLiveCars
  const live = await scopedDb(dealer.id).cars.count(eq(cars.status, "live"))
  if (live > cap) {
    const extra = live - cap
    return { ok: false, error: `You have ${live} live cars and ${PLANS[parsed.data.plan].label} allows ${cap}. Mark or archive ${extra} ${extra === 1 ? "car" : "cars"} first.` }
  }
  try {
    const checkout = await createSubscription({
      dealerId: dealer.id,
      industry: ctx.dealer.industry,
      ...parsed.data,
      startAt: hasAccess && accessUntil && !isUpgrade ? Math.floor(accessUntil.getTime() / 1000) : undefined,
    })
    if (!checkout) return { ok: false, error: "Payments are not set up yet." }
    return { ok: true, checkout }
  } catch (error) {
    console.error(`checkout failed: ${error instanceof Error ? error.message : "unknown"}`)
    return { ok: false, error: "Could not start payment. Please try again." }
  }
}

/** Called after Checkout succeeds. The signature proves the payment method was authorised for this subscription. */
export async function confirmSubscription(input: { paymentId: string; subscriptionId: string; signature: string }): Promise<{ ok: boolean }> {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") return { ok: false }
  if (!(await verifySubscriptionSignature(input))) return { ok: false }
  try {
    // The state comes from Razorpay, and the subscription must carry this dealer's id.
    const sub = await getSubscription(input.subscriptionId)
    if (!sub) return { ok: false }
    const { applied } = await applySubscription(sub, ctx.dealer.id)
    revalidatePath("/settings/billing")
    return { ok: applied }
  } catch (error) {
    console.error(`confirm failed: ${error instanceof Error ? error.message : "unknown"}`)
    return { ok: false }
  }
}

/**
 * Cancels the plan. The owner keeps access until the period already covered ends (the free trial, or the
 * paid period), then the showroom goes offline. A paid plan is stopped at the end of its period so nothing
 * already paid for is lost.
 */
export async function cancelPlan(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || ctx.devBypass) return { ok: false, error: "Please sign in again." }
  if (ctx.role !== "owner") return { ok: false, error: "Only the owner can cancel the plan." }
  if (!(await rateLimit(`billing:${ctx.user.id}`, 10, 10 * 60_000))) return { ok: false, error: "Too many attempts. Try again in a few minutes." }

  const dealer = await getDealerBilling(ctx.dealer.id)
  if (!dealer?.subscriptionId) return { ok: false, error: "There is no plan to cancel." }
  if (dealer.cancelRequestedAt) return { ok: true } // already cancelled: repeating it is harmless

  try {
    await cancelSubscription(dealer.subscriptionId, dealer.subscriptionStatus === "active")
  } catch (error) {
    // Already cancelled or finished on Razorpay's side counts as done. Anything else leaves the plan as it was.
    const current = await getSubscription(dealer.subscriptionId).catch(() => null)
    if (!current || !["cancelled", "completed", "expired"].includes(current.status)) {
      console.error(`cancel failed: ${error instanceof Error ? error.message : "unknown"}`)
      return { ok: false, error: "Could not cancel right now. Nothing was changed. Please try again." }
    }
  }
  await updateDealerBilling(dealer.id, { cancelRequestedAt: new Date() })
  revalidatePath("/settings/billing")
  return { ok: true }
}
