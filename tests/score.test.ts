import { describe, expect, it } from "vitest"

import { emptyMarketplaceDetails } from "../lib/cars/marketplace"
import { computeTanyScore, type ScoreInput } from "../lib/cars/score"

const now = new Date("2026-06-01")

const base = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  year: 2023,
  kmDriven: 20_000,
  ownerCount: 1,
  askingPrice: 800_000,
  insuranceValidTill: "2027-01-01",
  hypothecationCleared: true,
  rcVerified: true,
  photoCount: 8,
  details: emptyMarketplaceDetails(),
  now,
  ...over,
})

function fullDetails() {
  const d = emptyMarketplaceDetails()
  d.overview.insuranceType = "Comprehensive"
  d.overview.location = "Adyar"
  d.overview.rto = "TN 09"
  d.trust = { ...d.trust, inspectionScore: 270, accidentHistory: "No accident history", serviceHistory: "Full service history", warrantyAvailable: true }
  d.condition = { ...d.condition, tyreCondition: "Excellent", batteryCondition: "Good" }
  d.pricing = { ...d.pricing, bookingAmount: 10_000, tokenRefundable: true }
  d.protectionPlans = ["Warranty plan", "Periodic service", "Roadside assistance 24x7"]
  d.features.safety = ["Airbags", "ABS", "EBD", "Rear camera", "ESP"]
  d.features.comfort = ["Cruise control", "Keyless start", "Automatic AC", "Power windows", "Rear AC vents"]
  d.features.infotainment = ["Touchscreen", "Bluetooth", "USB", "Android Auto", "Apple CarPlay"]
  return d
}

describe("Tany Score", () => {
  it("stays within 0-100 and reports categories that sum to 100", () => {
    const r = computeTanyScore(base({ details: fullDetails() }))
    expect(r.score).toBeGreaterThan(85)
    expect(r.score).toBeLessThanOrEqual(100)
    expect(r.categories.reduce((n, c) => n + c.max, 0)).toBe(100)
    expect(r.band).toBe("excellent")
  })

  it("treats missing details as unknown, not bad, and lowers coverage", () => {
    const r = computeTanyScore(base({ hypothecationCleared: null, rcVerified: false, insuranceValidTill: null }))
    expect(r.coverage).toBeLessThan(60)
    expect(r.watchouts.some((c) => c.status === "unknown")).toBe(true)
    expect(r.watchouts.every((c) => c.status !== "concern" || c.key !== "rc")).toBe(true)
  })

  it("penalises high km per year and many owners", () => {
    const low = computeTanyScore(base({ kmDriven: 15_000, ownerCount: 1 }))
    const high = computeTanyScore(base({ kmDriven: 90_000, ownerCount: 4 }))
    expect(high.score).toBeLessThan(low.score)
  })

  it("caps a flood-affected car at 55 however good the rest is", () => {
    const d = fullDetails()
    d.trust.floodAffected = true
    const r = computeTanyScore(base({ details: d }))
    expect(r.score).toBeLessThanOrEqual(55)
    expect(r.capNote).toMatch(/flood/i)
  })

  it("caps a disclosed major repair at 70", () => {
    const d = fullDetails()
    d.trust.accidentHistory = "Major repair disclosed"
    expect(computeTanyScore(base({ details: d })).score).toBeLessThanOrEqual(70)
  })

  it("flags expired insurance and an active loan as concerns", () => {
    const r = computeTanyScore(base({ insuranceValidTill: "2025-01-01", hypothecationCleared: false }))
    const concerns = r.watchouts.filter((c) => c.status === "concern").map((c) => c.key)
    expect(concerns).toEqual(expect.arrayContaining(["insurance", "loan"]))
  })
})
