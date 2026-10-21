import { describe, expect, it } from "vitest"

import { quote, type QuoteInput, type QuoteResult, type QuoteSuccess } from "../../lib/cabs/fare"
import { SETTINGS, coupon, input, ist, rateCard, surcharge } from "./fare-helpers"

const ok = (r: QuoteResult): QuoteSuccess => {
  if (!r.ok) throw new Error(`expected a quote, got ${JSON.stringify(r)}`)
  return r
}
const line = (r: QuoteSuccess, key: string) => r.lines.find((l) => l.key === key)
const sum = (r: QuoteSuccess) => r.lines.filter((l) => l.included).reduce((a, l) => a + l.paise, 0)

const outstation = (over: Partial<QuoteInput> = {}) =>
  input({ tripType: "outstation_round", rateCard: rateCard("outstation_round", { perKmPaise: 1100, minKmPerDay: 250, bataPerDayPaise: 40_000 }), returnAt: ist("2026-11-03T20:00:00"), distanceM: 600_000, ...over })
const local = (over: Partial<QuoteInput> = {}) =>
  input({ tripType: "local_hourly", rateCard: rateCard("local_hourly", { basePaise: 140_000, packageHours: 8, packageKm: 80, extraKmPaise: 1200, extraHourPaise: 20_000 }), distanceM: 0, ...over })

describe("input checks", () => {
  const reason = (r: QuoteResult) => (r.ok ? "ok" : r.reason)
  it("rejects a distance that is not a whole non-negative number of metres", () => {
    for (const d of [-1, 1.5, NaN, Infinity]) expect(reason(quote(input({ distanceM: d })))).toBe("invalid_input")
    expect(reason(quote(input({ distanceM: "10" as unknown as number })))).toBe("invalid_input")
  })
  it("rejects a missing or invalid start time", () => {
    expect(reason(quote(input({ startAt: new Date("nope") })))).toBe("invalid_input")
    expect(reason(quote(input({ startAt: "2026-11-02" as unknown as Date })))).toBe("invalid_input")
  })
  it("needs a rate card for every trip type but a package tour, and the right kind", () => {
    expect(quote(input({ rateCard: null }))).toEqual({ ok: false, reason: "not_configured", missing: ["rateCard"] })
    expect(reason(quote(input({ rateCard: rateCard("local_hourly") })))).toBe("invalid_input")
    expect(reason(quote(input({ tripType: "package_tour", rateCard: rateCard("airport"), packagePricePaise: 1000 })))).toBe("invalid_input")
    expect(reason(quote(input({ tripType: "package_tour", rateCard: rateCard("package_tour"), packagePricePaise: 1000 })))).toBe("ok")
  })
  it("needs a return time after the start for a round trip", () => {
    expect(reason(quote(outstation({ returnAt: undefined })))).toBe("invalid_input")
    expect(reason(quote(outstation({ returnAt: new Date("nope") })))).toBe("invalid_input")
    expect(reason(quote(outstation({ returnAt: ist("2026-11-02T10:00:00") })))).toBe("invalid_input")
    expect(reason(quote(outstation({ returnAt: ist("2026-11-01T10:00:00") })))).toBe("invalid_input")
  })
  it("needs an end time after the start when one is given", () => {
    const oneWay = (endAt: Date | string) => input({ tripType: "outstation_one_way", rateCard: rateCard("outstation_one_way", { perKmPaise: 1200, minKmPerDay: 130 }), endAt: endAt as Date })
    expect(reason(quote(oneWay(new Date("nope"))))).toBe("invalid_input")
    expect(reason(quote(oneWay("tomorrow")))).toBe("invalid_input")
    expect(reason(quote(oneWay(ist("2026-11-02T09:00:00"))))).toBe("invalid_input")
    expect(reason(quote(oneWay(ist("2026-11-02T18:00:00"))))).toBe("ok")
  })
  it("rejects a malformed coupon", () => {
    expect(reason(quote(input({ coupon: coupon({ kind: "percent", value: 10_001 }) })))).toBe("coupon_invalid")
    expect(reason(quote(input({ coupon: coupon({ value: -5 }) })))).toBe("coupon_invalid")
    expect(reason(quote(input({ coupon: coupon({ value: 1.5 }) })))).toBe("coupon_invalid")
  })
  it("rejects a surcharge with both or neither of an amount and a percentage", () => {
    expect(reason(quote(input({ surcharges: [surcharge({ kind: "hill", amountPaise: 100, bps: 100 })] })))).toBe("invalid_input")
    expect(reason(quote(input({ surcharges: [surcharge({ kind: "hill", amountPaise: null, bps: null })] })))).toBe("invalid_input")
  })
})

describe("nothing is priced from a rate the operator has not entered", () => {
  it("lists what is missing, per trip type", () => {
    expect(quote(input({ rateCard: rateCard("airport", { basePaise: 20_000 }) }))).toEqual({ ok: false, reason: "not_configured", missing: ["perKmPaise"] })
    expect(quote(outstation({ rateCard: rateCard("outstation_round") }))).toEqual({ ok: false, reason: "not_configured", missing: ["perKmPaise", "minKmPerDay"] })
    expect(quote(local({ rateCard: rateCard("local_hourly") }))).toEqual({ ok: false, reason: "not_configured", missing: ["basePaise", "packageHours", "packageKm"] })
    expect(quote(input({ tripType: "package_tour", rateCard: null }))).toEqual({ ok: false, reason: "not_configured", missing: ["packagePricePaise"] })
  })
  it("does not treat zero or a fraction of a paisa as 'entered' for a required field the wrong way", () => {
    expect(quote(input({ rateCard: rateCard("airport", { perKmPaise: -1 }) }))).toMatchObject({ reason: "not_configured" })
    expect(quote(input({ rateCard: rateCard("airport", { perKmPaise: 1.5 }) }))).toMatchObject({ reason: "not_configured" })
    expect(ok(quote(input({ rateCard: rateCard("airport", { perKmPaise: 0 }) }))).totalPaise).toBe(0) // an explicit zero is a choice
  })
  it("fails until the operator has decided on GST (zero is a decision, null is not)", () => {
    expect(quote(input({ settings: { ...SETTINGS, gstRateBps: null } }))).toEqual({ ok: false, reason: "not_configured", missing: ["gstRateBps"] })
    expect(ok(quote(input({ settings: { ...SETTINGS, gstRateBps: 0 } }))).gst).toEqual({ rateBps: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 })
  })
  it("needs the state codes to split GST, but only when GST is charged", () => {
    expect(quote(input({ settings: { ...SETTINGS, stateCode: null } }))).toEqual({ ok: false, reason: "not_configured", missing: ["stateCode"] })
    expect(quote(input({ placeOfSupplyStateCode: null }))).toEqual({ ok: false, reason: "not_configured", missing: ["placeOfSupplyStateCode"] })
    expect(ok(quote(input({ settings: { ...SETTINGS, gstRateBps: 0, stateCode: null }, placeOfSupplyStateCode: null }))).totalPaise).toBe(34_000)
  })
})

describe("airport", () => {
  it("is base plus distance, to the exact paise, rounded to a rupee only at the end", () => {
    const r = ok(quote(input({ distanceM: 18_400 })))
    expect(line(r, "base")?.paise).toBe(20_000)
    expect(line(r, "distance")?.paise).toBe(25_760) // 18.4 km × 1400
    expect(r.taxablePaise).toBe(45_760)
    expect(r.gst.cgstPaise + r.gst.sgstPaise).toBe(2_288) // 5% of 457.60
    expect(r.totalPaise).toBe(48_000)
    expect(sum(r)).toBe(r.totalPaise)
  })
  it("has no base line when the operator charges no base", () => {
    const r = ok(quote(input({ rateCard: rateCard("airport", { perKmPaise: 1400 }) })))
    expect(line(r, "base")).toBeUndefined()
    expect(line(r, "distance")?.paise).toBe(14_000)
  })
})

describe("outstation", () => {
  it("bills the real distance when it beats the daily minimum", () => {
    const r = ok(quote(outstation({ distanceM: 924_000 })))
    expect(r.meta).toMatchObject({ days: 2, billedM: 924_000, minKmApplied: false })
    expect(line(r, "distance")?.detail).toBe("924 km at ₹11/km")
    expect(line(r, "bata")?.paise).toBe(80_000)
    expect(line(r, "bata")?.detail).toBe("₹400 × 2 days")
  })
  it("bills the minimum km per day when the trip is shorter", () => {
    const r = ok(quote(outstation({ distanceM: 304_000 })))
    expect(r.meta).toMatchObject({ days: 2, billedM: 500_000, minKmApplied: true })
    expect(line(r, "distance")?.detail).toBe("Minimum 250 km a day × 2 days = 500 km at ₹11/km")
    expect(line(r, "distance")?.paise).toBe(550_000) // 500 km × ₹11
  })
  it("says 'day' for one day and charges no allowance when none is set", () => {
    const r = ok(quote(outstation({ returnAt: ist("2026-11-02T22:00:00"), distanceM: 100_000, rateCard: rateCard("outstation_round", { perKmPaise: 1100, minKmPerDay: 250 }) })))
    expect(r.meta.days).toBe(1)
    expect(line(r, "bata")).toBeUndefined()
    expect(line(r, "distance")?.detail).toContain("× 1 day =")
  })
  it("counts the days of a one-way trip from its end time, or one day with none", () => {
    const oneWay = (endAt?: Date) => input({ tripType: "outstation_one_way", rateCard: rateCard("outstation_one_way", { perKmPaise: 1200, minKmPerDay: 130, bataPerDayPaise: 30_000 }), distanceM: 400_000, endAt })
    expect(ok(quote(oneWay())).meta.days).toBe(1)
    expect(ok(quote(oneWay(ist("2026-11-04T10:00:00")))).meta.days).toBe(3)
  })
})

describe("a same-day return", () => {
  it("is one day: one daily minimum and one day of allowance, however late the vehicle is released", () => {
    for (const back of ["2026-11-02T10:30:00", "2026-11-02T18:00:00", "2026-11-02T23:59:00"]) {
      const r = ok(quote(outstation({ startAt: ist("2026-11-02T06:00:00"), returnAt: ist(back), distanceM: 100_000 })))
      expect(r.meta, back).toMatchObject({ days: 1, billedM: 250_000, minKmApplied: true })
      expect(line(r, "bata")?.paise, back).toBe(40_000)
    }
  })
  it("becomes two days the moment the return is after midnight, even by a minute", () => {
    const r = ok(quote(outstation({ startAt: ist("2026-11-02T22:00:00"), returnAt: ist("2026-11-03T00:01:00"), distanceM: 100_000 })))
    expect(r.meta.days).toBe(2)
    expect(line(r, "bata")?.paise).toBe(80_000)
  })
  it("counts the same in a server running in another time zone (days are India's, not the server's)", () => {
    // 20:00 UTC on the 2nd is 01:30 IST on the 3rd: still a same-day trip for the customer if both ends are on the 3rd in India.
    const r = ok(quote(outstation({ startAt: new Date("2026-11-02T20:00:00Z"), returnAt: new Date("2026-11-03T12:00:00Z"), distanceM: 100_000 })))
    expect(r.meta.days).toBe(1)
  })
})

describe("notices", () => {
  it("always tell the customer that tolls and parking are extra, at actuals, and never add them to the total", () => {
    for (const q of [input(), outstation(), local(), input({ tripType: "package_tour", rateCard: null, packagePricePaise: 100_000 })]) {
      expect(ok(quote(q)).notices).toEqual(["tolls_parking_extra"])
    }
    const withToll = ok(quote(input({ tollEstimatePaise: 80_000 })))
    expect(withToll.totalPaise).toBe(ok(quote(input())).totalPaise)
  })
})

describe("local hourly packages", () => {
  it("is the package price, with no overage line when no overrun is expected", () => {
    const r = ok(quote(local()))
    expect(line(r, "package")?.paise).toBe(140_000)
    expect(line(r, "package")?.label).toBe("8 hr / 80 km package")
    expect(line(r, "extra_km")).toBeUndefined()
    expect(line(r, "extra_hours")).toBeUndefined()
  })
  it("shows no overage for an expected run inside the package", () => {
    const r = ok(quote(local({ expectedM: 80_000, expectedMinutes: 480 })))
    expect(r.lines.map((l) => l.key)).not.toContain("extra_km")
    expect(r.lines.map((l) => l.key)).not.toContain("extra_hours")
  })
  it("estimates extra distance and charges a started hour as a full hour", () => {
    const r = ok(quote(local({ expectedM: 95_500, expectedMinutes: 481 })))
    expect(line(r, "extra_km")?.paise).toBe(18_600) // 15.5 km × 1200
    expect(line(r, "extra_hours")?.paise).toBe(20_000) // 1 minute over is 1 hour
    expect(line(r, "extra_hours")?.detail).toBe("1 hr at ₹200/hr")
  })
  it("needs the extra rates only when an overrun is expected", () => {
    const noExtras = rateCard("local_hourly", { basePaise: 140_000, packageHours: 8, packageKm: 80 })
    expect(ok(quote(local({ rateCard: noExtras }))).totalPaise).toBeGreaterThan(0)
    expect(ok(quote(local({ rateCard: noExtras, expectedM: 70_000, expectedMinutes: 300 }))).totalPaise).toBeGreaterThan(0)
    expect(quote(local({ rateCard: noExtras, expectedM: 90_000 }))).toEqual({ ok: false, reason: "not_configured", missing: ["extraKmPaise"] })
    expect(quote(local({ rateCard: noExtras, expectedMinutes: 600 }))).toEqual({ ok: false, reason: "not_configured", missing: ["extraHourPaise"] })
  })
  it("ignores an expected run that is not a usable number", () => {
    const r = ok(quote(local({ expectedM: -5, expectedMinutes: 1.5 })))
    expect(r.lines.map((l) => l.key)).toEqual(["package", "cgst", "sgst", ...(line(r, "rounding") ? ["rounding"] : [])])
  })
})

describe("package tours", () => {
  it("are priced by the package, not by a rate card or the distance", () => {
    const r = ok(quote(input({ tripType: "package_tour", rateCard: null, packagePricePaise: 1_200_000, distanceM: 999_999 })))
    expect(line(r, "package")?.paise).toBe(1_200_000)
    expect(r.totalPaise).toBe(1_260_000)
  })
})

describe("surcharges", () => {
  const withS = (s: ReturnType<typeof surcharge>[], over: Partial<QuoteInput> = {}) => ok(quote(input({ surcharges: s, ...over })))
  const keys = (r: QuoteSuccess) => r.lines.map((l) => l.key)

  it("adds a flat amount, or a percentage of the trip fare only (not of other charges)", () => {
    const flat = withS([surcharge({ kind: "hill", id: "h", amountPaise: 50_000 })])
    expect(line(flat, "surcharge:h")?.paise).toBe(50_000)
    const pctOfFare = withS([surcharge({ kind: "festival", id: "f", amountPaise: null, bps: 1000 }), surcharge({ kind: "hill", id: "h", amountPaise: 50_000 })])
    expect(line(pctOfFare, "surcharge:f")?.paise).toBe(3_400) // 10% of 20,000 + 14,000, not of the hill charge
    expect(line(pctOfFare, "surcharge:f")?.detail).toBe("10% of the fare")
  })

  it("applies an airport surcharge only to airport trips unless told otherwise", () => {
    const s = surcharge({ kind: "airport", id: "a" })
    expect(keys(withS([s]))).toContain("surcharge:a")
    expect(keys(ok(quote(outstation({ surcharges: [s] }))))).not.toContain("surcharge:a")
    expect(keys(ok(quote(outstation({ surcharges: [{ ...s, scope: { tripTypes: ["outstation_round"] } }] }))))).toContain("surcharge:a")
  })

  it("respects vehicle classes and explicit trip types", () => {
    const s = surcharge({ kind: "hill", id: "h", scope: { vehicleClassIds: ["suv"] } })
    expect(keys(withS([s]))).not.toContain("surcharge:h") // the quote is for a sedan
    expect(keys(withS([s], { vehicleClassId: "suv" }))).toContain("surcharge:h")
    const t = surcharge({ kind: "hill", id: "t", scope: { tripTypes: ["local_hourly"] } })
    expect(keys(withS([t]))).not.toContain("surcharge:t")
  })

  it("matches places case-insensitively, and not at all when the trip never goes there", () => {
    const s = surcharge({ kind: "hill", id: "h", scope: { places: ["Kodaikanal"] } })
    expect(keys(withS([s], { places: ["chennai", " KODAIKANAL "] }))).toContain("surcharge:h")
    expect(keys(withS([s], { places: ["Madurai"] }))).not.toContain("surcharge:h")
    expect(keys(withS([s]))).not.toContain("surcharge:h")
  })

  it("applies a festival charge only on its dates, in IST", () => {
    const s = surcharge({ kind: "festival", id: "f", scope: { dateRanges: [{ from: "2026-11-08", to: "2026-11-10" }] } })
    expect(keys(withS([s], { startAt: ist("2026-11-09T00:30:00") }))).toContain("surcharge:f")
    expect(keys(withS([s], { startAt: ist("2026-11-10T23:59:00") }))).toContain("surcharge:f")
    expect(keys(withS([s], { startAt: ist("2026-11-11T00:00:00") }))).not.toContain("surcharge:f")
    expect(keys(withS([s], { startAt: ist("2026-11-07T23:59:00") }))).not.toContain("surcharge:f")
  })

  describe("night", () => {
    const night = surcharge({ kind: "night", id: "n" })
    it("applies inside the operator's night window, which wraps midnight", () => {
      for (const t of ["22:00", "23:30", "00:00", "05:59"]) expect(keys(withS([night], { startAt: ist(`2026-11-02T${t}:00`) })), t).toContain("surcharge:n")
      for (const t of ["06:00", "12:00", "21:59"]) expect(keys(withS([night], { startAt: ist(`2026-11-02T${t}:00`) })), t).not.toContain("surcharge:n")
    })
    it("can carry its own window, which wins over the operator's", () => {
      const own = surcharge({ kind: "night", id: "n", scope: { window: { start: "23:00", end: "05:00" } } })
      expect(keys(withS([own], { startAt: ist("2026-11-02T22:30:00") }))).not.toContain("surcharge:n")
      expect(keys(withS([own], { startAt: ist("2026-11-02T23:30:00") }))).toContain("surcharge:n")
    })
    it("warns, and does not guess, when there is no window anywhere", () => {
      const noWindow = { ...SETTINGS, nightStart: null, nightEnd: null }
      const r = withS([night], { settings: noWindow, startAt: ist("2026-11-02T23:30:00") })
      expect(keys(r)).not.toContain("surcharge:n")
      expect(r.warnings).toEqual(['"Surcharge" has no night window, so it was not applied.'])
      expect(withS([night], { settings: { ...noWindow, nightStart: "22:00" } }).warnings).toHaveLength(1) // half a window is none
      expect(withS([night], { settings: noWindow }).warnings).toHaveLength(1)
    })
    it("still respects its other scope", () => {
      const s = surcharge({ kind: "night", id: "n", scope: { tripTypes: ["local_hourly"] } })
      expect(keys(withS([s], { startAt: ist("2026-11-02T23:30:00") }))).not.toContain("surcharge:n")
    })
  })

  describe("permits", () => {
    const permit = surcharge({ kind: "permit", id: "p", amountPaise: 100_000, scope: { states: ["ap"] } })
    it("charges once for each listed state the trip enters", () => {
      const r = withS([permit], { statesEntered: ["AP", "ap", "KA"] })
      expect(keys(r).filter((k) => k.startsWith("surcharge:p"))).toEqual(["surcharge:p:AP"])
      expect(line(r, "surcharge:p:AP")?.label).toBe("Surcharge (AP)")
    })
    it("charges nothing when no listed state is entered, or none at all", () => {
      expect(keys(withS([permit], { statesEntered: ["KA"] }))).not.toContain("surcharge:p:KA")
      expect(keys(withS([permit]))).not.toContain("surcharge:p:AP")
    })
    it("with no states listed, charges every state entered", () => {
      const any = surcharge({ kind: "permit", id: "p", amountPaise: 50_000 })
      expect(keys(withS([any], { statesEntered: ["KA", "AP"] })).filter((k) => k.startsWith("surcharge:p"))).toEqual(["surcharge:p:KA", "surcharge:p:AP"])
    })
    it("can be a percentage of the fare per state", () => {
      const pct = surcharge({ kind: "permit", id: "p", amountPaise: null, bps: 100 })
      expect(line(withS([pct], { statesEntered: ["AP"] }), "surcharge:p:AP")?.paise).toBe(340)
    })
    it("still respects its other scope", () => {
      const s = surcharge({ kind: "permit", id: "p", scope: { vehicleClassIds: ["suv"] } })
      expect(keys(withS([s], { statesEntered: ["AP"] }))).not.toContain("surcharge:p:AP")
    })
  })
})

describe("coupons", () => {
  it("takes a percentage off the fare before GST, so GST is charged on the discounted amount", () => {
    const r = ok(quote(input({ coupon: coupon({ kind: "percent", value: 1000 }) })))
    expect(line(r, "discount")?.paise).toBe(-3_400)
    expect(r.taxablePaise).toBe(30_600)
  })
  it("caps a percentage discount", () => {
    const r = ok(quote(input({ coupon: coupon({ kind: "percent", value: 5000, maxDiscountPaise: 1_000 }) })))
    expect(line(r, "discount")?.paise).toBe(-1_000)
    expect(line(ok(quote(input({ coupon: coupon({ kind: "percent", value: 1000, maxDiscountPaise: null }) }))), "discount")?.paise).toBe(-3_400)
    expect(line(ok(quote(input({ coupon: coupon({ kind: "percent", value: 1000, maxDiscountPaise: 99_999 }) }))), "discount")?.paise).toBe(-3_400) // cap above the discount: unchanged
  })
  it("gives a flat discount, never more than the fare", () => {
    expect(line(ok(quote(input({ coupon: coupon({ value: 5_000 }) }))), "discount")?.paise).toBe(-5_000)
    const big = ok(quote(input({ coupon: coupon({ value: 9_999_999 }) })))
    expect(big.taxablePaise).toBe(0)
    expect(big.totalPaise).toBe(0)
  })
  it("adds no line for a zero discount", () => {
    expect(line(ok(quote(input({ coupon: coupon({ value: 0 }) }))), "discount")).toBeUndefined()
  })
  it("refuses a coupon whose minimum fare is not met, and allows one that is", () => {
    const r = quote(input({ coupon: coupon({ code: "BIG", minSubtotalPaise: 50_000 }) }))
    expect(r).toEqual({ ok: false, reason: "coupon_minimum_not_met", detail: "The fare must be at least ₹500 to use BIG." })
    expect(quote(input({ coupon: coupon({ minSubtotalPaise: 34_000 }) })).ok).toBe(true)
    expect(quote(input({ coupon: coupon({ minSubtotalPaise: null }) })).ok).toBe(true)
  })
})

describe("GST", () => {
  it("splits into CGST and SGST inside the operator's state, to the paise", () => {
    const r = ok(quote(input({ distanceM: 18_401 })))
    expect(line(r, "cgst")?.label).toBe("CGST 2.5%")
    expect(line(r, "sgst")?.label).toBe("SGST 2.5%")
    expect(r.gst.cgstPaise + r.gst.sgstPaise).toBe(Math.round(r.taxablePaise * 0.05))
    expect(line(r, "igst")).toBeUndefined()
  })
  it("sends an odd paisa to SGST, so the halves always add up", () => {
    // 5% of ₹1.01 is 5.05 paise: CGST 2.5 and SGST 2.5 would be fractions; the exact units stay whole.
    const r = ok(quote(input({ rateCard: rateCard("airport", { perKmPaise: 101 }), distanceM: 1_000 })))
    expect(r.gst.cgstPaise + r.gst.sgstPaise).toBeGreaterThanOrEqual(5)
    expect(sum(r)).toBe(r.totalPaise)
  })
  it("charges IGST when the service is supplied in another state", () => {
    const r = ok(quote(input({ placeOfSupplyStateCode: "29" })))
    expect(line(r, "igst")?.label).toBe("IGST 5%")
    expect(r.gst).toMatchObject({ cgstPaise: 0, sgstPaise: 0 })
    expect(r.gst.igstPaise).toBe(1_700)
  })
})

describe("totals", () => {
  it("rounds the total to a whole rupee, half up, and shows the difference as a line", () => {
    const up = ok(quote(input({ rateCard: rateCard("airport", { perKmPaise: 1 }), distanceM: 50_000, settings: { ...SETTINGS, gstRateBps: 0 } }))) // 0.50 paise/m… 50 km × 1 paise = 50 paise
    expect(up.totalPaise).toBe(100) // 50 paise rounds half up to ₹1
    expect(line(up, "rounding")?.paise).toBe(50)
    const down = ok(quote(input({ rateCard: rateCard("airport", { perKmPaise: 1 }), distanceM: 49_000, settings: { ...SETTINGS, gstRateBps: 0 } })))
    expect(down.totalPaise).toBe(0)
    expect(line(down, "rounding")?.paise).toBe(-49)
  })
  it("has no rounding line when the lines already add up to whole rupees", () => {
    const r = ok(quote(input({ rateCard: rateCard("airport", { perKmPaise: 1000 }), distanceM: 10_000, settings: { ...SETTINGS, gstRateBps: 0 } })))
    expect(r.totalPaise).toBe(10_000)
    expect(line(r, "rounding")).toBeUndefined()
  })
  it("shows the toll estimate without adding it to the total", () => {
    const base = ok(quote(input()))
    const r = ok(quote(input({ tollEstimatePaise: 60_000 })))
    expect(line(r, "toll_estimate")).toMatchObject({ paise: 60_000, included: false, kind: "info" })
    expect(r.tollEstimatePaise).toBe(60_000)
    expect(r.totalPaise).toBe(base.totalPaise)
    expect(ok(quote(input({ tollEstimatePaise: null }))).tollEstimatePaise).toBeNull()
    expect(line(ok(quote(input({ tollEstimatePaise: -5 }))), "toll_estimate")).toBeUndefined()
  })
  it("works out the advance from the operator's share, in whole rupees and never above the total", () => {
    expect(ok(quote(input())).advanceDuePaise).toBeNull()
    const r = ok(quote(input({ settings: { ...SETTINGS, advanceBps: 2000 } })))
    expect(r.advanceDuePaise).toBe(Math.round((r.totalPaise * 0.2) / 100) * 100)
    expect(ok(quote(input({ settings: { ...SETTINGS, advanceBps: 10_000 } }))).advanceDuePaise).toBe(ok(quote(input())).totalPaise)
    expect(ok(quote(input({ settings: { ...SETTINGS, advanceBps: 0 } }))).advanceDuePaise).toBe(0)
  })
  it("is deterministic and does not change its input", () => {
    const i = input({ surcharges: [surcharge({ kind: "hill" })], coupon: coupon() })
    const before = JSON.stringify(i)
    expect(JSON.stringify(quote(i))).toBe(JSON.stringify(quote(i)))
    expect(JSON.stringify(i)).toBe(before)
  })
  it("always has lines that add up to the total, across a sweep of distances", () => {
    for (let m = 0; m <= 200_000; m += 7_919) {
      const r = ok(quote(input({ distanceM: m, coupon: coupon({ kind: "percent", value: 777 }), surcharges: [surcharge({ kind: "festival", amountPaise: null, bps: 333 })] })))
      expect(sum(r), `distance ${m}`).toBe(r.totalPaise)
      expect(r.totalPaise % 100).toBe(0)
    }
  })
})
