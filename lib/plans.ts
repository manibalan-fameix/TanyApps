import { getVertical } from "./verticals"

export const PLAN_KEYS = ["free", "starter", "growth", "pro", "scale"] as const
export type PlanKey = (typeof PLAN_KEYS)[number]

export type PlanConfig = {
  label: string
  /** Maximum cars with status `live` at once. */
  maxLiveCars: number
  whiteLabel: boolean
  customDomain: boolean
  /** "Add a car by voice". Growth and above. */
  voiceEntry: boolean
  /** Monthly price in rupees. Null for plans that are not sold in the self-serve flow. */
  monthlyPrice: number | null
}

/** Paid plans, the ones bought through Razorpay. The free plan is never sold and needs no payment method. */
export const SELLABLE_PLAN_KEYS = ["starter", "growth", "pro"] as const
export type SellablePlanKey = (typeof SELLABLE_PLAN_KEYS)[number]
/** What a new dealer can start on: the free plan first, then the paid ones. */
export const SIGNUP_PLAN_KEYS = ["free", ...SELLABLE_PLAN_KEYS] as const
export type SignupPlanKey = (typeof SIGNUP_PLAN_KEYS)[number]
export const FREE_PLAN_KEY = "free" satisfies PlanKey
export const isFreePlan = (key: string) => key === FREE_PLAN_KEY
export const BILLING_CYCLES = ["monthly", "yearly"] as const
export type BillingCycle = (typeof BILLING_CYCLES)[number]

/** Every paid plan starts with a free trial of this many days. The free plan has no trial: it never expires. */
export const TRIAL_DAYS = 30
/** A yearly plan is billed for this many months: the twelfth is free. */
export const YEARLY_PAID_MONTHS = 11

/** Price in rupees for one billing period. */
export function planPrice(key: SellablePlanKey, cycle: BillingCycle): number {
  const monthly = PLANS[key].monthlyPrice as number
  return cycle === "yearly" ? monthly * YEARLY_PAID_MONTHS : monthly
}

// Live-car cap, feature flags and the price shown at onboarding.
export const PLANS: Record<PlanKey, PlanConfig> = {
  free: { label: "Free", maxLiveCars: 5, whiteLabel: false, customDomain: false, voiceEntry: false, monthlyPrice: 0 },
  starter: { label: "Starter", maxLiveCars: 25, whiteLabel: false, customDomain: false, voiceEntry: false, monthlyPrice: 2999 },
  growth: { label: "Growth", maxLiveCars: 50, whiteLabel: false, customDomain: false, voiceEntry: true, monthlyPrice: 4999 },
  pro: { label: "Pro", maxLiveCars: 100, whiteLabel: true, customDomain: true, voiceEntry: true, monthlyPrice: 8999 },
  scale: { label: "100+ cars", maxLiveCars: 1000, whiteLabel: true, customDomain: true, voiceEntry: true, monthlyPrice: null },
}

/** Menu items a restaurant can list, per plan. Null means unlimited. Scale is not sold to restaurants, so it is unlimited too. */
export const RESTAURANT_MENU_LIMITS: Record<PlanKey, number | null> = {
  free: 50,
  starter: 200,
  growth: 500,
  pro: null,
  scale: null,
}

/** The headline limit of a plan, worded for the industry: "Up to 50 menu items" or "Up to 25 cars live at once". */
export function planLimitLabel(industry: string, key: PlanKey): string {
  switch (getVertical(industry).planLimit) {
    case "menu_items": {
      const max = RESTAURANT_MENU_LIMITS[key]
      return max === null ? "Unlimited menu items" : `Up to ${max} menu items`
    }
    case "vehicles": {
      const l = getVertical("cabs").cabLimits?.[key]
      return l ? `Up to ${l.vehicles} vehicles, ${l.drivers} drivers, ${l.bookingsPerMonth.toLocaleString("en-IN")} bookings a month` : "Not offered on this plan"
    }
    case "live_cars":
      return `Up to ${PLANS[key].maxLiveCars} cars live at once`
  }
}

/** What the free plan allows, finishing "Start free with ...": "up to 5 cars" or "up to 50 menu items". */
export function freeTierPhrase(industry: string): string {
  switch (getVertical(industry).planLimit) {
    case "menu_items":
      return `up to ${RESTAURANT_MENU_LIMITS.free} menu items`
    case "vehicles":
      return "a starter fleet" // cabs has no free plan, so this is not shown
    case "live_cars":
      return `up to ${PLANS.free.maxLiveCars} cars`
  }
}

export function getPlan(key: string): PlanConfig {
  return PLANS[key as PlanKey] ?? PLANS.starter
}
