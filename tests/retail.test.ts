import { describe, expect, it } from "vitest"

import { toDealerValues, onboardSchema } from "@/lib/dealers/onboard"
import { catalogueLimit, freeTierPhrase, planLimitLabel } from "@/lib/plans"
import { ADMIN_NAV } from "@/components/admin/nav-config"
import {
  ORDER_INDUSTRIES,
  RETAIL_TYPE_KEYS,
  RETAIL_TYPES,
  VERTICALS,
  getRetailType,
  isOrderIndustry,
  storeTerms,
} from "@/lib/verticals"

const base = {
  industry: "retail",
  businessType: "textile",
  displayName: "Kalyani Textiles",
  slug: "kalyani",
  city: "Chennai",
  phone: "9999999999",
  hours: { mon: { open: "09:00", close: "18:00" } },
  primary: "#1d4ed8",
  accent: "#f59e0b",
  radius: "md",
  plan: "free",
  billingCycle: "monthly",
}

describe("TanyRetail vertical", () => {
  it("shares the ordering engine with TanyEats and nothing else", () => {
    expect([...ORDER_INDUSTRIES]).toEqual(["restaurants", "retail"])
    expect(isOrderIndustry("retail")).toBe(true)
    expect(isOrderIndustry("restaurants")).toBe(true)
    expect(isOrderIndustry("cabs")).toBe(false)
    expect(isOrderIndustry("motors")).toBe(false)
  })

  it("is registered against the TanyRetail product", () => {
    expect(VERTICALS.retail.product).toBe("tanyretail")
    expect(VERTICALS.retail.adminReady).toBe(true)
    expect(ADMIN_NAV.retail.addItem.href).toBe(VERTICALS.retail.firstItemHref)
    // Shops have no tables to book.
    expect(ADMIN_NAV.retail.items.some((i) => i.url === "/table-bookings")).toBe(false)
    expect(ADMIN_NAV.restaurants.items.some((i) => i.url === "/table-bookings")).toBe(true)
  })

  it("asks for a business type in onboarding", () => {
    expect(onboardSchema.safeParse(base).success).toBe(true)
    const missing = onboardSchema.safeParse({ ...base, businessType: undefined })
    expect(missing.success).toBe(false)
    expect(!missing.success && missing.error.issues[0].path[0]).toBe("businessType")
    expect(onboardSchema.safeParse({ ...base, businessType: "spaceships" }).success).toBe(false)
    // Other industries do not need one.
    expect(onboardSchema.safeParse({ ...base, industry: "restaurants", businessType: undefined }).success).toBe(true)
  })

  it("stores the business type for retail only", () => {
    const retail = onboardSchema.parse(base)
    expect(toDealerValues(retail).businessType).toBe("textile")
    const eats = onboardSchema.parse({ ...base, industry: "restaurants" })
    expect(toDealerValues(eats).businessType).toBeNull()
  })

  it("defines every business type completely", () => {
    for (const k of RETAIL_TYPE_KEYS) {
      const t = RETAIL_TYPES[k]
      expect(t.key).toBe(k)
      expect(t.starterCategories.length).toBeGreaterThan(0)
      expect(new Set(t.starterCategories).size).toBe(t.starterCategories.length)
      expect(t.units.length).toBeGreaterThan(0)
      expect(t.previewItems.length).toBeGreaterThanOrEqual(3)
      // Category names are validated at 2 to 40 characters elsewhere.
      for (const c of t.starterCategories) expect(c.length >= 2 && c.length <= 40, c).toBe(true)
    }
    expect(getRetailType("nonsense").key).toBe("general")
    expect(getRetailType(null).key).toBe("general")
  })

  it("keeps veg marks for food shops only", () => {
    expect(storeTerms("restaurants").diet).toBe(true)
    expect(storeTerms("retail", "grocery").diet).toBe(true)
    expect(storeTerms("retail", "supermarket").diet).toBe(true)
    for (const k of ["textile", "hardware", "electronics", "stationery", "general"]) expect(storeTerms("retail", k).diet, k).toBe(false)
  })

  it("words the catalogue for the shop, and keeps restaurant words unchanged", () => {
    expect(storeTerms("restaurants")).toMatchObject({ item: "dish", items: "dishes", catalogue: "Menu", tableBookings: true })
    expect(storeTerms("retail", "textile")).toMatchObject({ item: "item", catalogue: "Collection", tableBookings: false })
    expect(storeTerms("retail", "hardware")).toMatchObject({ item: "product", Items: "Products", catalogue: "Catalogue" })
  })

  it("gives shops a bigger catalogue than a menu", () => {
    expect(catalogueLimit("retail", "free")).toBe(100)
    expect(catalogueLimit("restaurants", "free")).toBe(50)
    expect(catalogueLimit("retail", "pro")).toBeNull()
    expect(planLimitLabel("retail", "free")).toBe("Up to 100 products")
    expect(planLimitLabel("retail", "pro")).toBe("Unlimited products")
    expect(freeTierPhrase("retail")).toBe("up to 100 products")
  })
})
