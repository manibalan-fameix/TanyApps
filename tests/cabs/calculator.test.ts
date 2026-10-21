import { describe, expect, it } from "vitest"

import { blankForm, buildQuoteInput, calculate, explainFailure, parseIst, plannedDistanceM, type CalcData, type CalcForm } from "../../lib/cabs/calculator"
import type { FareSettings } from "../../lib/cabs/fare"
import type { StoredRateCard } from "../../lib/cabs/rate-cards"
import { rateCard } from "./fare-helpers"

const settings: FareSettings = { nightStart: "22:00", nightEnd: "06:00", gstRateBps: 500, stateCode: "33", advanceBps: null }
const card = (over: Partial<StoredRateCard> & Pick<StoredRateCard, "id" | "tripType">): StoredRateCard => ({ ...rateCard(over.tripType), vehicleClassId: "sedan", validFrom: null, validTo: null, active: true, ...over })
const data: CalcData = {
  settings,
  surcharges: [],
  packages: [{ id: "tour", name: "Pondy weekend", vehicleClassPrices: { sedan: 650_000 } }],
  cards: [
    card({ id: "air", tripType: "airport", basePaise: 20_000, perKmPaise: 1400 }),
    card({ id: "rt", tripType: "outstation_round", perKmPaise: 1100, minKmPerDay: 250, bataPerDayPaise: 40_000 }),
    card({ id: "l4", tripType: "local_hourly", basePaise: 80_000, packageHours: 4, packageKm: 40, extraKmPaise: 1200, extraHourPaise: 20_000 }),
    card({ id: "l8", tripType: "local_hourly", basePaise: 140_000, packageHours: 8, packageKm: 80, extraKmPaise: 1200, extraHourPaise: 20_000 }),
  ],
}
const form = (over: Partial<CalcForm> = {}): CalcForm => ({ ...blankForm("sedan"), startAt: "2026-11-02T10:00", ...over })

describe("distance", () => {
  it("doubles a round trip, and ignores distance for packages and tours", () => {
    expect(plannedDistanceM("outstation_round", 460_000)).toBe(920_000)
    expect(plannedDistanceM("outstation_one_way", 152_000)).toBe(152_000)
    expect(plannedDistanceM("airport", 18_400)).toBe(18_400)
    expect(plannedDistanceM("local_hourly", 99_000)).toBe(0)
    expect(plannedDistanceM("package_tour", 99_000)).toBe(0)
  })
  it("reads India time from a datetime-local value", () => {
    expect(parseIst("2026-11-02T10:00")?.toISOString()).toBe("2026-11-02T04:30:00.000Z")
    expect(parseIst("2026-11-02T10:00:30")?.toISOString()).toBe("2026-11-02T04:30:30.000Z")
    for (const bad of ["", "2026-11-02", "2026-11-02 10:00", "2026-13-02T10:00", "nope"]) expect(parseIst(bad), bad).toBeNull()
  })
})

describe("building the quote", () => {
  it("asks for the next missing thing, one at a time", () => {
    expect(buildQuoteInput({ ...form(), vehicleClassId: "" }, data)).toEqual({ ok: false, error: "Choose a vehicle class." })
    expect(buildQuoteInput(form({ startAt: "" }), data)).toMatchObject({ ok: false, error: "Enter the pickup date and time." })
    expect(buildQuoteInput(form({ tripType: "airport" }), data)).toMatchObject({ ok: false, error: "Enter the distance in km." })
    expect(buildQuoteInput(form({ tripType: "outstation_round", distanceKm: "460" }), data)).toMatchObject({ ok: false, error: "Enter when the vehicle is released." })
    expect(buildQuoteInput(form({ tripType: "package_tour" }), data)).toMatchObject({ ok: false, error: "Choose a tour package." })
    expect(buildQuoteInput(form({ tripType: "local_hourly" }), data)).toMatchObject({ ok: false, error: "Choose a local package." })
    expect(buildQuoteInput(form({ tripType: "outstation_one_way", distanceKm: "100" }), data)).toMatchObject({ ok: false, error: expect.stringContaining("No active rate card") })
  })
  it("rejects distances and amounts that are not numbers", () => {
    for (const d of ["abc", "-5", "1,5", "1.2345", "123456"]) expect(buildQuoteInput(form({ distanceKm: d }), data), d).toMatchObject({ ok: false })
    expect(buildQuoteInput(form({ distanceKm: "10", tollRupees: "lots" }), data)).toMatchObject({ ok: false, error: expect.stringContaining("tolls") })
    expect(buildQuoteInput(form({ tripType: "local_hourly", rateCardId: "l8", expectedKm: "x" }), data)).toMatchObject({ ok: false, error: expect.stringContaining("distance") })
    expect(buildQuoteInput(form({ tripType: "local_hourly", rateCardId: "l8", expectedHours: "x" }), data)).toMatchObject({ ok: false, error: expect.stringContaining("hours") })
  })
  it("uses the operator's state for GST unless another is chosen", () => {
    expect(buildQuoteInput(form({ distanceKm: "10" }), data)).toMatchObject({ ok: true, input: { placeOfSupplyStateCode: "33" } })
    expect(buildQuoteInput(form({ distanceKm: "10", supplyState: "KA" }), data)).toMatchObject({ ok: true, input: { placeOfSupplyStateCode: "29" } })
    expect(buildQuoteInput(form({ distanceKm: "10" }), { ...data, settings: { ...settings, stateCode: null } })).toMatchObject({ ok: true, input: { placeOfSupplyStateCode: null } })
  })
  it("won't use a local package from another class or a tour with no price for the class", () => {
    expect(buildQuoteInput(form({ tripType: "local_hourly", rateCardId: "l8", vehicleClassId: "suv" }), data)).toMatchObject({ ok: false })
    expect(buildQuoteInput(form({ tripType: "package_tour", packageId: "tour", vehicleClassId: "suv" }), data)).toMatchObject({ ok: false, error: "Pondy weekend has no price for this vehicle class." })
  })
  it("ignores an inactive rate card or one outside its dates", () => {
    const off = { ...data, cards: [card({ id: "air", tripType: "airport", perKmPaise: 1400, active: false })] }
    expect(buildQuoteInput(form({ distanceKm: "10" }), off)).toMatchObject({ ok: false })
    const later = { ...data, cards: [card({ id: "air", tripType: "airport", perKmPaise: 1400, validFrom: "2027-01-01" })] }
    expect(buildQuoteInput(form({ distanceKm: "10" }), later)).toMatchObject({ ok: false })
  })
})

describe("the preview runs the real engine", () => {
  it("prices an airport transfer exactly as the engine does", () => {
    const r = calculate(form({ distanceKm: "18.4" }), data)
    expect(r).toMatchObject({ ok: true, result: { totalPaise: 48_000 } }) // the same ₹480 as the airport case in fare-cases.json
  })
  it("doubles the distance and counts the days of a round trip", () => {
    const r = calculate(form({ tripType: "outstation_round", distanceKm: "462", startAt: "2026-11-05T05:30", returnAt: "2026-11-06T21:00" }), data)
    expect(r).toMatchObject({ ok: true, result: { totalPaise: 1_151_200, meta: { days: 2, billedM: 924_000 } } }) // the Madurai round trip case
  })
  it("estimates a local package's overrun", () => {
    const r = calculate(form({ tripType: "local_hourly", rateCardId: "l8", expectedKm: "95.5", expectedHours: "9.5" }), data)
    expect(r.ok && r.result.lines.map((l) => l.key)).toEqual(expect.arrayContaining(["package", "extra_km", "extra_hours"]))
  })
  it("prices a tour from the package", () => {
    expect(calculate(form({ tripType: "package_tour", packageId: "tour" }), data)).toMatchObject({ ok: true, result: { totalPaise: 682_500 } })
  })
  it("shows tolls without adding them", () => {
    const a = calculate(form({ distanceKm: "10" }), data)
    const b = calculate(form({ distanceKm: "10", tollRupees: "450" }), data)
    expect(a.ok && b.ok && b.result.totalPaise === a.result.totalPaise && b.result.tollEstimatePaise === 45_000).toBe(true)
  })
})

describe("explaining a failed quote", () => {
  it("sends the operator to settings when GST or state is not set", () => {
    const noGst = calculate(form({ distanceKm: "10" }), { ...data, settings: { ...settings, gstRateBps: null } })
    expect(noGst).toMatchObject({ ok: false, error: expect.stringContaining("GST rate"), fix: { href: "/cabs/settings" } })
    const noState = calculate(form({ distanceKm: "10" }), { ...data, settings: { ...settings, stateCode: null } })
    expect(noState).toMatchObject({ ok: false, error: expect.stringContaining("state") })
  })
  it("names the fields a rate card is missing, in plain words", () => {
    const half = { ...data, cards: [card({ id: "air", tripType: "airport" })] }
    expect(calculate(form({ distanceKm: "10" }), half)).toMatchObject({ ok: false, error: "The rate card is missing the rate per km." })
    expect(explainFailure({ ok: false, reason: "not_configured", missing: ["minKmPerDay", "perKmPaise"] }).error).toBe("The rate card is missing the minimum km per day and the rate per km.")
    expect(explainFailure({ ok: false, reason: "not_configured", missing: ["weird"] }).error).toContain("weird")
    expect(explainFailure({ ok: false, reason: "not_configured", missing: ["placeOfSupplyStateCode"] }).error).toContain("supplied")
    expect(explainFailure({ ok: false, reason: "invalid_input", detail: "bad" })).toEqual({ error: "bad" })
    expect(explainFailure({ ok: false, reason: "coupon_invalid", detail: "no" })).toEqual({ error: "no" })
  })
})
