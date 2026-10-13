import { describe, expect, it } from "vitest"

import { emptyMarketplaceDetails, marketplaceDetailsSchema } from "../lib/cars/marketplace"

describe("marketplace details schema", () => {
  it("accepts an untouched form", () => {
    expect(marketplaceDetailsSchema.safeParse(emptyMarketplaceDetails()).success).toBe(true)
  })
  it("rejects a number typed with commas unless the form cleans it first (the Indian price format)", () => {
    const raw = { ...emptyMarketplaceDetails(), pricing: { ...emptyMarketplaceDetails().pricing, emiStart: Number("1,25,000") } }
    expect(marketplaceDetailsSchema.safeParse(raw).success).toBe(false)
    const cleaned = { ...raw, pricing: { ...raw.pricing, emiStart: Number("1,25,000".replace(/[,\s₹]/g, "")) } }
    expect(marketplaceDetailsSchema.safeParse(cleaned).success).toBe(true)
  })
  it("rejects a decimal in a whole-number field", () => {
    const d = { ...emptyMarketplaceDetails(), pricing: { ...emptyMarketplaceDetails().pricing, bookingAmount: 5000.5 } }
    expect(marketplaceDetailsSchema.safeParse(d).success).toBe(false)
  })
})
