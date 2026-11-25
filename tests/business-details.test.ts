import { describe, expect, it } from "vitest"

import { businessDetailsSchema, mobileSchema } from "@/lib/dealers/onboard"

const base = { displayName: "Sellers Hypermarket", city: "Chennai", phone: "9876543210" }

describe("business details", () => {
  it("accepts an edit, trimming text, with the logo kept, removed or replaced", () => {
    expect(businessDetailsSchema.parse({ ...base, displayName: "  New Name " }).displayName).toBe("New Name")
    expect(businessDetailsSchema.parse(base).logo).toBeUndefined()
    expect(businessDetailsSchema.parse({ ...base, logo: null }).logo).toBeNull()
  })
  it("holds the name, city and shop type to onboarding's rules", () => {
    expect(businessDetailsSchema.safeParse({ ...base, displayName: "A" }).success).toBe(false)
    expect(businessDetailsSchema.safeParse({ ...base, city: "" }).success).toBe(false)
    expect(businessDetailsSchema.safeParse({ ...base, businessType: "spaceship" }).success).toBe(false)
  })
  it("normalises a new mobile number and refuses a bad one", () => {
    expect(mobileSchema.parse("98765 43210")).toBe("+919876543210")
    expect(mobileSchema.safeParse("12345").success).toBe(false)
  })
})
