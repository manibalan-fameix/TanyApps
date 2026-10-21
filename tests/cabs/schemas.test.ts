import { describe, expect, it } from "vitest"

import { bpsToPercentText, percentToBps } from "../../lib/cabs/money"
import { blockedPeriodSchema, driverDocumentSchema, driverSchema, packageSchema, rateCardSchema, surchargeSchema, toSettingsRow, vehicleClassSchema, vehicleDocumentSchema, vehicleSchema } from "../../lib/cabs/schemas"

const uuid = "3f2a5c1e-9b7d-4e2a-8c3f-1a2b3c4d5e6f"
const err = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : r.error?.issues[0].message)

describe("percent text", () => {
  it("converts to basis points exactly and back", () => {
    expect(percentToBps("5")).toBe(500)
    expect(percentToBps("2.5")).toBe(250)
    expect(percentToBps("12.75")).toBe(1275)
    expect(percentToBps("100")).toBe(10_000)
    expect(percentToBps("5%")).toBe(500)
    expect(percentToBps(18)).toBe(1800)
    for (const bad of ["101", "-1", "abc", "1.234", "", null, undefined]) expect(percentToBps(bad as string)).toBeNull()
    expect(bpsToPercentText(500)).toBe("5")
    expect(bpsToPercentText(250)).toBe("2.5")
    expect(bpsToPercentText(1275)).toBe("12.75")
    expect(bpsToPercentText(null)).toBe("")
  })
})

describe("vehicle class", () => {
  const ok = { name: "Sedan", seats: 4, bags: 2, ac: true }
  it("accepts a sensible class and fills the optional parts", () => {
    expect(vehicleClassSchema.parse(ok)).toMatchObject({ name: "Sedan", description: "", imageUrl: "", sortOrder: 0, active: true })
  })
  it("rejects nonsense", () => {
    expect(err(vehicleClassSchema.safeParse({ ...ok, name: "x" }))).toBe("Enter a class name.")
    expect(vehicleClassSchema.safeParse({ ...ok, seats: 0 }).success).toBe(false)
    expect(vehicleClassSchema.safeParse({ ...ok, seats: 61 }).success).toBe(false)
    expect(vehicleClassSchema.safeParse({ ...ok, seats: 4.5 }).success).toBe(false)
    expect(vehicleClassSchema.safeParse({ ...ok, bags: -1 }).success).toBe(false)
  })
})

describe("vehicle", () => {
  const ok = { classId: uuid, reg: "tn 09 ab 1234", makeModel: "Toyota Etios", ownership: "own", odometerKm: 1200 }
  it("normalises the registration number", () => {
    expect(vehicleSchema.parse(ok).reg).toBe("TN09AB1234")
    expect(vehicleSchema.parse({ ...ok, reg: "TN9AB1234" }).reg).toBe("TN09AB1234")
    expect(vehicleSchema.parse({ ...ok, reg: "22 BH 1234 AA" }).reg).toBe("22BH1234AA")
  })
  it("rejects a bad registration, class, year or odometer", () => {
    expect(err(vehicleSchema.safeParse({ ...ok, reg: "HELLO" }))).toContain("valid registration")
    expect(vehicleSchema.safeParse({ ...ok, classId: "x" }).success).toBe(false)
    expect(vehicleSchema.safeParse({ ...ok, year: 1980 }).success).toBe(false)
    expect(vehicleSchema.safeParse({ ...ok, year: 2020, fuel: "diesel" }).success).toBe(true)
    expect(vehicleSchema.safeParse({ ...ok, odometerKm: -1 }).success).toBe(false)
    expect(vehicleSchema.safeParse({ ...ok, fuel: "steam" }).success).toBe(false)
  })
  it("treats blank optional parts as unset", () => {
    expect(vehicleSchema.parse({ ...ok, colour: "  ", year: null })).toMatchObject({ colour: null, year: null, fuel: null })
  })
})

describe("documents", () => {
  it("need a type, take an optional expiry, and never an expiry before the start", () => {
    expect(vehicleDocumentSchema.parse({ type: "insurance", validTill: "2027-03-31" })).toMatchObject({ type: "insurance", validTill: "2027-03-31", number: null, fileKey: null })
    expect(vehicleDocumentSchema.parse({ type: "rc", validTill: "" }).validTill).toBeNull()
    expect(vehicleDocumentSchema.safeParse({ type: "passport" }).success).toBe(false)
    expect(err(vehicleDocumentSchema.safeParse({ type: "fc", validFrom: "2026-05-01", validTill: "2026-04-01" }))).toBe("The expiry date must be after the start date.")
    expect(vehicleDocumentSchema.safeParse({ type: "fc", validTill: "2026-02-30" }).success).toBe(false)
    expect(vehicleDocumentSchema.safeParse({ type: "fc", validTill: "31/12/2026" }).success).toBe(false)
    expect(driverDocumentSchema.parse({ type: "licence", number: "TN0920200012345", validTill: "2030-01-01" }).type).toBe("licence")
  })
})

describe("blocked period", () => {
  it("must end after it starts", () => {
    const ok = { resourceType: "vehicle", resourceId: uuid, startsAt: "2026-11-10T09:00:00+05:30", endsAt: "2026-11-12T09:00:00+05:30" }
    expect(blockedPeriodSchema.parse(ok).endsAt.getTime()).toBeGreaterThan(blockedPeriodSchema.parse(ok).startsAt.getTime())
    expect(blockedPeriodSchema.safeParse({ ...ok, endsAt: ok.startsAt }).success).toBe(false)
    expect(blockedPeriodSchema.safeParse({ ...ok, endsAt: "nope" }).success).toBe(false)
    expect(blockedPeriodSchema.safeParse({ ...ok, resourceType: "trip" }).success).toBe(false)
  })
})

describe("driver", () => {
  const ok = { name: "Murugan", phone: "98765 43210", employment: "employee" }
  it("stores the phone as E.164 and the licence number tidied", () => {
    expect(driverSchema.parse(ok).phone).toBe("+919876543210")
    expect(driverSchema.parse({ ...ok, licenceNo: "tn09 2020-0012345" }).licenceNo).toBe("TN0920200012345")
    expect(driverSchema.parse({ ...ok, licenceNo: "" }).licenceNo).toBeNull()
  })
  it("rejects a bad phone, name or employment", () => {
    expect(err(driverSchema.safeParse({ ...ok, phone: "12345" }))).toBe("Enter a valid 10-digit mobile number.")
    expect(driverSchema.safeParse({ ...ok, name: "M" }).success).toBe(false)
    expect(driverSchema.safeParse({ ...ok, employment: "volunteer" }).success).toBe(false)
  })
})

describe("rate cards", () => {
  const base = { vehicleClassId: uuid }
  it("airport: a required rate per km, an optional base, both converted to paise", () => {
    const r = rateCardSchema.parse({ ...base, tripType: "airport", perKmPaise: "14.5", basePaise: "200" })
    expect(r).toMatchObject({ perKmPaise: 1450, basePaise: 20_000, active: true })
    expect((rateCardSchema.parse({ ...base, tripType: "airport", perKmPaise: "14" }) as { basePaise: number | null }).basePaise).toBeNull()
    expect(err(rateCardSchema.safeParse({ ...base, tripType: "airport", perKmPaise: "" }))).toBe("Enter the rate per km in rupees, like 14.50.")
  })
  it("outstation: needs a rate and a daily minimum; the allowance is optional", () => {
    const r = rateCardSchema.parse({ ...base, tripType: "outstation_round", perKmPaise: "11", minKmPerDay: 250, bataPerDayPaise: "400" })
    expect(r).toMatchObject({ perKmPaise: 1100, minKmPerDay: 250, bataPerDayPaise: 40_000 })
    expect(rateCardSchema.safeParse({ ...base, tripType: "outstation_one_way", perKmPaise: "12" }).success).toBe(false)
    expect(rateCardSchema.safeParse({ ...base, tripType: "outstation_one_way", perKmPaise: "12", minKmPerDay: 0 }).success).toBe(false)
  })
  it("local package: a price, hours and km; extras optional", () => {
    const r = rateCardSchema.parse({ ...base, tripType: "local_hourly", basePaise: "1400", packageHours: 8, packageKm: 80, extraKmPaise: "12", extraHourPaise: "200" })
    expect(r).toMatchObject({ basePaise: 140_000, packageHours: 8, packageKm: 80, extraKmPaise: 1200, extraHourPaise: 20_000 })
    expect(rateCardSchema.safeParse({ ...base, tripType: "local_hourly", basePaise: "1400", packageHours: 8 }).success).toBe(false)
  })
  it("drops fields the trip type does not use, and refuses trip types without a rate card", () => {
    const r = rateCardSchema.parse({ ...base, tripType: "airport", perKmPaise: "14", minKmPerDay: 250, packageKm: 80 }) as Record<string, unknown>
    expect(r.minKmPerDay).toBeUndefined()
    expect(r.packageKm).toBeUndefined()
    expect(rateCardSchema.safeParse({ ...base, tripType: "package_tour" }).success).toBe(false)
  })
  it("never lets valid-to precede valid-from", () => {
    expect(rateCardSchema.safeParse({ ...base, tripType: "airport", perKmPaise: "14", validFrom: "2026-12-01", validTo: "2026-11-01" }).success).toBe(false)
    expect(rateCardSchema.safeParse({ ...base, tripType: "airport", perKmPaise: "14", validFrom: "2026-11-01", validTo: "2026-12-01" }).success).toBe(true)
  })
})

describe("surcharges", () => {
  const ok = { kind: "hill", label: "Hill charge", scope: {}, mode: "flat", amount: "500" }
  it("takes a flat amount in rupees or a percentage, and stores exactly one", () => {
    expect(surchargeSchema.parse(ok)).toMatchObject({ amountPaise: 50_000, bps: null })
    expect(surchargeSchema.parse({ ...ok, mode: "percent", amount: "2.5" })).toMatchObject({ amountPaise: null, bps: 250 })
    expect(err(surchargeSchema.safeParse({ ...ok, amount: "lots" }))).toBe("Enter the amount in rupees, like 150.")
    expect(err(surchargeSchema.safeParse({ ...ok, mode: "percent", amount: "250" }))).toBe("Enter a percentage, like 5 or 2.5.")
    expect(surchargeSchema.safeParse({ ...ok, mode: "weekly" }).success).toBe(false)
  })
  it("keeps only the scope that was filled in, with states normalised", () => {
    const s = surchargeSchema.parse({ ...ok, kind: "permit", scope: { states: ["ap", "Karnataka"], places: ["Kodaikanal"], dateRanges: [{ from: "2026-11-08", to: "2026-11-10" }], tripTypes: ["outstation_round"] } })
    expect(s.scope).toEqual({ states: ["AP", "KA"], places: ["Kodaikanal"], dateRanges: [{ from: "2026-11-08", to: "2026-11-10" }], tripTypes: ["outstation_round"] })
    expect(surchargeSchema.parse(ok).scope).toEqual({})
  })
  it("rejects a bad state, a bad night window or a backwards date range", () => {
    expect(surchargeSchema.safeParse({ ...ok, scope: { states: ["ZZ"] } }).success).toBe(false)
    expect(surchargeSchema.safeParse({ ...ok, scope: { window: { start: "10pm", end: "06:00" } } }).success).toBe(false)
    expect(surchargeSchema.parse({ ...ok, scope: { window: { start: "22:00", end: "06:00" } } }).scope.window).toEqual({ start: "22:00", end: "06:00" })
    expect(surchargeSchema.safeParse({ ...ok, scope: { dateRanges: [{ from: "2026-11-10", to: "2026-11-08" }] } }).success).toBe(false)
  })
})

describe("package", () => {
  it("accepts a tour with an itinerary and per-class prices as typed", () => {
    const p = packageSchema.parse({ name: "Pondicherry weekend", days: 2, itinerary: [{ day: 1, title: "Drive down" }], prices: { [uuid]: "6500" } })
    expect(p).toMatchObject({ days: 2, active: true, description: "" })
    expect(p.itinerary[0]).toEqual({ day: 1, title: "Drive down", description: "" })
    expect(packageSchema.safeParse({ name: "x", days: 2 }).success).toBe(false)
    expect(packageSchema.safeParse({ name: "Tour", days: 0 }).success).toBe(false)
    expect(packageSchema.safeParse({ name: "Tour", days: 2, prices: { "not-a-uuid": "5" } }).success).toBe(false)
  })
})

describe("settings", () => {
  const ok = { advancePercent: "20", gstPercent: "5", stateCode: "TN", gstin: "33ABCDE1234F1Z5", sacCode: "9964", invoicePrefix: "anna", nightStart: "22:00", nightEnd: "06:00", cancellationPolicy: [{ hoursBefore: 4, feePercent: "50" }, { hoursBefore: 24, feePercent: "0" }], serviceCities: ["Chennai", "Chennai", "Madurai"] }
  it("turns the form into the row to save", () => {
    const r = toSettingsRow(ok)
    expect(r).toEqual({ ok: true, row: { advanceBps: 2000, gstRateBps: 500, stateCode: "33", gstin: "33ABCDE1234F1Z5", sacCode: "9964", invoicePrefix: "ANNA", nightStart: "22:00", nightEnd: "06:00", cancellationPolicy: [{ hoursBefore: 24, feeBps: 0 }, { hoursBefore: 4, feeBps: 5000 }], minLeadMinutes: 0, bufferMinutes: 0, serviceCities: ["Chennai", "Madurai"] } })
  })
  it("leaves undecided things undecided: blank means null, and zero GST is a decision", () => {
    const r = toSettingsRow({})
    expect(r).toMatchObject({ ok: true, row: { advanceBps: null, gstRateBps: null, stateCode: null, gstin: null, nightStart: null, nightEnd: null, cancellationPolicy: [] } })
    expect(toSettingsRow({ gstPercent: "0" })).toMatchObject({ ok: true, row: { gstRateBps: 0 } })
    expect(toSettingsRow({ gstPercent: 0 })).toMatchObject({ ok: true, row: { gstRateBps: 0 } })
  })
  it("says what is wrong, field by field", () => {
    const bad = toSettingsRow({ advancePercent: "150", gstPercent: "x", stateCode: "Atlantis", gstin: "123", sacCode: "ab", nightStart: "22:00", nightEnd: "", cancellationPolicy: [{ hoursBefore: 4, feePercent: "x" }] })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["advancePercent", "cancellationPolicy", "gstPercent", "gstin", "nightEnd", "sacCode", "stateCode"])
    expect(toSettingsRow({ nightStart: "25:00", nightEnd: "06:00" })).toMatchObject({ ok: false, errors: { nightStart: expect.any(String) } })
  })
  it("checks the GSTIN against the state and tiers for repeats", () => {
    expect(toSettingsRow({ stateCode: "TN", gstin: "29ABCDE1234F1Z5" })).toMatchObject({ ok: false, errors: { gstin: "The first two digits of the GSTIN must match your state." } })
    expect(toSettingsRow({ gstin: "29ABCDE1234F1Z5" })).toMatchObject({ ok: true })
    expect(toSettingsRow({ cancellationPolicy: [{ hoursBefore: 4, feePercent: "10" }, { hoursBefore: 4, feePercent: "20" }] })).toMatchObject({ ok: false, errors: { cancellationPolicy: expect.any(String) } })
    expect(toSettingsRow({ advancePercent: 10, minLeadMinutes: -5 })).toMatchObject({ ok: false })
  })
})
