import { describe, expect, it } from "vitest"

import { billingState } from "../lib/billing/state"

const now = new Date("2026-10-01T00:00:00Z")
const days = (n: number) => new Date(now.getTime() + n * 86_400_000)

describe("billingState", () => {
  it("never suspends dealers created before billing", () => {
    const s = billingState({ trialEndsAt: null, paidThrough: null, subscriptionStatus: null }, now)
    expect(s).toMatchObject({ phase: "legacy", hasAccess: true })
  })
  it("gives access during the trial, with or without a card", () => {
    expect(billingState({ trialEndsAt: days(12), paidThrough: null, subscriptionStatus: null }, now)).toMatchObject({ phase: "trial", hasAccess: true, daysLeft: 12 })
  })
  it("suspends when the trial ends with no payment method", () => {
    expect(billingState({ trialEndsAt: days(-1), paidThrough: null, subscriptionStatus: null }, now)).toMatchObject({ phase: "suspended", hasAccess: false })
    expect(billingState({ trialEndsAt: days(-1), paidThrough: null, subscriptionStatus: "created" }, now).hasAccess).toBe(false)
  })
  it("gives a short grace while the first charge is still going through", () => {
    expect(billingState({ trialEndsAt: days(-1), paidThrough: null, subscriptionStatus: "authenticated" }, now)).toMatchObject({ phase: "grace", hasAccess: true })
    expect(billingState({ trialEndsAt: days(-4), paidThrough: null, subscriptionStatus: "authenticated" }, now).hasAccess).toBe(false)
  })
  it("is active while a paid period runs, and suspends once it lapses after a halt", () => {
    expect(billingState({ trialEndsAt: days(-40), paidThrough: days(20), subscriptionStatus: "active" }, now)).toMatchObject({ phase: "active", hasAccess: true })
    expect(billingState({ trialEndsAt: days(-70), paidThrough: days(-5), subscriptionStatus: "halted" }, now).hasAccess).toBe(false)
  })
  it("keeps a paid period even if the subscription was cancelled", () => {
    expect(billingState({ trialEndsAt: days(-40), paidThrough: days(10), subscriptionStatus: "cancelled" }, now).hasAccess).toBe(true)
  })
})

describe("billingState: cancel and payment problems", () => {
  const base = { trialEndsAt: days(-40), paidThrough: days(10) }
  it("keeps access to the end of the paid period after cancelling, then goes offline", () => {
    const s = billingState({ ...base, subscriptionStatus: "active", cancelRequestedAt: now }, now)
    expect(s).toMatchObject({ phase: "active", hasAccess: true, cancelling: true, hasPaymentMethod: false })
    const later = new Date(days(11))
    expect(billingState({ ...base, subscriptionStatus: "active", cancelRequestedAt: now }, later)).toMatchObject({ phase: "suspended", hasAccess: false })
  })
  it("gives no grace to a cancelled plan once the trial is over", () => {
    const s = billingState({ trialEndsAt: days(-1), paidThrough: null, subscriptionStatus: "authenticated", cancelRequestedAt: now }, now)
    expect(s.hasAccess).toBe(false)
  })
  it("treats a Razorpay-cancelled subscription as cancelling even without our flag", () => {
    expect(billingState({ ...base, subscriptionStatus: "cancelled" }, now)).toMatchObject({ cancelling: true, hasAccess: true })
  })
  it("flags a failed renewal while the paid period still runs", () => {
    expect(billingState({ ...base, subscriptionStatus: "pending" }, now)).toMatchObject({ paymentIssue: true, hasAccess: true })
    expect(billingState({ ...base, subscriptionStatus: "halted" }, now)).toMatchObject({ paymentIssue: true, hasPaymentMethod: false })
  })
})

import { effectivePlanKey } from "../lib/billing/state"

describe("effectivePlanKey", () => {
  it("applies an upgrade at once, even one saved as pending", () => {
    const d = { plan: "starter", nextPlan: "pro", nextPlanStartsAt: days(10) }
    expect(effectivePlanKey(d, now)).toBe("pro")
    expect(effectivePlanKey({ plan: "starter" }, now)).toBe("starter")
  })

  it("keeps today's plan after a downgrade until the period paid for ends, then switches", () => {
    const d = { plan: "pro", nextPlan: "starter", nextPlanStartsAt: days(10) }
    expect(effectivePlanKey(d, now)).toBe("pro")
    expect(effectivePlanKey(d, days(10))).toBe("starter")
  })
})

import { PLANS, planLimitLabel } from "../lib/plans"
import { toDealerValues } from "../lib/dealers/onboard"

describe("free plan limits", () => {
  it("allows 5 live cars and costs nothing", () => {
    expect(PLANS.free).toMatchObject({ maxLiveCars: 5, monthlyPrice: 0 })
  })
  it("gives restaurants 50 / 200 / 500 / unlimited menu items on the four sold tiers", () => {
    expect(["free", "starter", "growth", "pro"].map((k) => planLimitLabel("restaurants", k as "free"))).toEqual([
      "Up to 50 menu items",
      "Up to 200 menu items",
      "Up to 500 menu items",
      "Unlimited menu items",
    ])
    expect(planLimitLabel("motors", "free")).toBe("Up to 5 cars live at once")
  })
  it("signing up on free sets no trial end", () => {
    const base = { industry: "motors" as const, displayName: "A B", slug: "ab", city: "Chennai", phone: "+919999999999", hours: { mon: { open: "09:00", close: "18:00" } }, primary: "#1d4ed8", accent: "#f59e0b", radius: "md" as const, billingCycle: "monthly" as const }
    expect(toDealerValues({ ...base, plan: "free" }).trialEndsAt).toBeNull()
    expect(toDealerValues({ ...base, plan: "growth" }).trialEndsAt).toBeInstanceOf(Date)
  })
})
