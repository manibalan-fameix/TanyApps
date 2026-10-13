import { describe, expect, it } from "vitest"

import { onboardSchema, toDealerValues } from "../lib/dealers/onboard"
import { contrastRatio } from "../lib/theme/tokens"

const ok = {
  displayName: "Sri Murugan Motors",
  slug: "sri-murugan",
  city: "Chennai",
  phone: "98765 43210",
  hours: { mon: { open: "10:00", close: "19:00" }, sat: { open: "10:00", close: "19:00" } },
  primary: "#1d4ed8",
  accent: "#f59e0b",
  radius: "md" as const,
  plan: "starter" as const,
  billingCycle: "monthly" as const,
}

describe("industry", () => {
  it("defaults to motors so existing callers keep working", () => {
    const r = onboardSchema.safeParse(ok)
    expect(r.success && r.data.industry).toBe("motors")
  })
  it("accepts restaurants, stores it on the dealer row and rejects unknown industries", () => {
    const r = onboardSchema.safeParse({ ...ok, industry: "restaurants" })
    expect(r.success && toDealerValues(r.data).industry).toBe("restaurants")
    expect(onboardSchema.safeParse({ ...ok, industry: "salons" }).success).toBe(false)
  })
})

describe("onboarding input", () => {
  it("accepts a valid dealership and normalises the phone number to +91", () => {
    const r = onboardSchema.safeParse(ok)
    expect(r.success && r.data.phone).toBe("+919876543210")
    expect(onboardSchema.safeParse({ ...ok, phone: "+91 98765-43210" }).success).toBe(true)
  })
  it("rejects reserved and malformed web addresses", () => {
    for (const slug of ["app", "www", "api", "a", "-bad", "has space", "x.y"]) {
      expect(onboardSchema.safeParse({ ...ok, slug }).success).toBe(false)
    }
    expect(onboardSchema.safeParse({ ...ok, slug: "Sri-Murugan" }).success).toBe(true) // lowercased
  })
  it("rejects bad phones, empty names, no open days and reversed hours", () => {
    expect(onboardSchema.safeParse({ ...ok, phone: "12345" }).success).toBe(false)
    expect(onboardSchema.safeParse({ ...ok, phone: "5876543210" }).success).toBe(false) // must start 6-9
    expect(onboardSchema.safeParse({ ...ok, displayName: " " }).success).toBe(false)
    expect(onboardSchema.safeParse({ ...ok, hours: {} }).success).toBe(false)
    expect(onboardSchema.safeParse({ ...ok, hours: { mon: { open: "19:00", close: "10:00" } } }).success).toBe(false)
    expect(onboardSchema.safeParse({ ...ok, primary: "blue" }).success).toBe(false)
  })
  it("computes a readable text colour on the server, whatever colour was picked", () => {
    for (const primary of ["#ffff00", "#000000", "#1d4ed8", "#808080"]) {
      const parsed = onboardSchema.parse({ ...ok, primary })
      const { theme } = toDealerValues(parsed)
      expect(contrastRatio(theme.primary, theme.primaryForeground)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
