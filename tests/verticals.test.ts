import { describe, expect, it } from "vitest"

import { ADMIN_NAV } from "../components/admin/nav-config"
import { onboardSchema } from "../lib/dealers/onboard"
import { industry as industryEnum } from "../lib/db/schema/enums"
import { PLANS, freeTierPhrase, planLimitLabel } from "../lib/plans"
import { INDUSTRY_PRODUCT, PRODUCTS } from "../lib/products"
import { INDUSTRY_KEYS, LIVE_INDUSTRY_KEYS, VERTICALS, getVertical, isIndustryKey } from "../lib/verticals"

describe("vertical registry", () => {
  it("has one entry per industry key, and each entry knows its own key", () => {
    expect(Object.keys(VERTICALS).sort()).toEqual([...INDUSTRY_KEYS].sort())
    for (const k of INDUSTRY_KEYS) expect(VERTICALS[k].key).toBe(k)
  })

  it("matches the Postgres enum, so a new key cannot be added to one and forgotten in the other", () => {
    expect([...industryEnum.enumValues]).toEqual([...INDUSTRY_KEYS])
  })

  it("points every vertical at a real product, and only live verticals are marked live on the product", () => {
    const productKeys = new Set(PRODUCTS.map((p) => p.key))
    for (const k of INDUSTRY_KEYS) {
      expect(productKeys.has(VERTICALS[k].product)).toBe(true)
      expect(INDUSTRY_PRODUCT[k]).toBe(VERTICALS[k].product)
    }
    const withIndustry = PRODUCTS.filter((p) => "industry" in p).map((p) => ("industry" in p ? p.industry : null))
    expect(withIndustry.sort()).toEqual([...LIVE_INDUSTRY_KEYS].sort())
  })

  it("accepts every built vertical in the onboarding schema, and cabs only on a plan it offers", () => {
    expect(LIVE_INDUSTRY_KEYS).toEqual(["motors", "restaurants", "cabs"])
    const base = { displayName: "Anna Travels", slug: "anna", city: "Chennai", phone: "9999999999", hours: { mon: { open: "09:00", close: "18:00" } }, primary: "#1d4ed8", accent: "#f59e0b", radius: "md", billingCycle: "monthly" }
    expect(onboardSchema.safeParse({ ...base, plan: "free", industry: "motors" }).success).toBe(true)
    expect(onboardSchema.safeParse({ ...base, plan: "starter", industry: "cabs" }).success).toBe(true)
    // Cabs has no free plan.
    expect(onboardSchema.safeParse({ ...base, plan: "free", industry: "cabs" }).success).toBe(false)
    expect(onboardSchema.safeParse({ ...base, plan: "free", industry: "salons" }).success).toBe(false)
  })

  it("treats an unknown stored value as the default vertical", () => {
    expect(getVertical("salons").key).toBe("motors")
    expect(getVertical(null).key).toBe("motors")
    expect(isIndustryKey("cabs")).toBe(true)
    expect(isIndustryKey("salons")).toBe(false)
  })

  it("describes admin navigation for every industry", () => {
    for (const k of INDUSTRY_KEYS) {
      expect(ADMIN_NAV[k].addItem.href).toMatch(/^\//)
      expect(ADMIN_NAV[k].tabUrls[0]).toBe("/dashboard")
    }
    expect(ADMIN_NAV.motors.addItem.href).toBe(VERTICALS.motors.firstItemHref)
    expect(ADMIN_NAV.restaurants.addItem.href).toBe(VERTICALS.restaurants.firstItemHref)
  })

  it("words plan limits per industry as before", () => {
    expect(planLimitLabel("motors", "free")).toBe(`Up to ${PLANS.free.maxLiveCars} cars live at once`)
    expect(planLimitLabel("restaurants", "free")).toBe("Up to 50 menu items")
    expect(planLimitLabel("restaurants", "pro")).toBe("Unlimited menu items")
    expect(freeTierPhrase("motors")).toBe(`up to ${PLANS.free.maxLiveCars} cars`)
    expect(freeTierPhrase("restaurants")).toBe("up to 50 menu items")
  })

  it("files each business under a category that exists in Razorpay's Route list", () => {
    expect(VERTICALS.motors.razorpay).toEqual({ category: "ecommerce", subcategory: "automobile_and_truck_dealers" })
    expect(VERTICALS.cabs.razorpay).toEqual({ category: "transport", subcategory: "cab_hailing" })
    expect(VERTICALS.restaurants.razorpay).toEqual({ category: "food", subcategory: "restaurant" })
  })
})
