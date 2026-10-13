import { describe, expect, it } from "vitest"

import { computeNewCarSavings } from "../lib/cars/savings"

describe("new car savings", () => {
  it("computes the saving, percentage and lower EMI", () => {
    const r = computeNewCarSavings({ askingPrice: 800_000, newCarPrice: 1_000_000 })!
    expect(r.saving).toBe(200_000)
    expect(r.savingPct).toBe(20)
    expect(r.usedEmi).toBeLessThan(r.newEmi)
    expect(r.emiSaving).toBe(r.newEmi - r.usedEmi)
  })
  it("returns null when a price is missing", () => {
    expect(computeNewCarSavings({ askingPrice: null, newCarPrice: 1_000_000 })).toBeNull()
    expect(computeNewCarSavings({ askingPrice: 800_000, newCarPrice: null })).toBeNull()
  })
  it("never shows a saving when the used car costs the same or more", () => {
    expect(computeNewCarSavings({ askingPrice: 1_000_000, newCarPrice: 1_000_000 })).toBeNull()
    expect(computeNewCarSavings({ askingPrice: 1_200_000, newCarPrice: 1_000_000 })).toBeNull()
  })
})
