import { describe, expect, it } from "vitest"

import { BOOKING_CODE_RE, hashShareToken, newBookingCode, newShareToken, normalizeCode } from "../../lib/cabs/booking-code"
import { bookingCopy, bookingMessage } from "../../lib/cabs/booking-copy"
import { localizeLine } from "../../lib/cabs/fare-labels"
import { paymentHoldExpiry, requestHold, respondWindowMinutes } from "../../lib/cabs/holds"
import { openPlace, sealPlace } from "../../lib/cabs/place-token"
import { QUICK_PICKS, picksFor } from "../../lib/cabs/quick-picks"
import { TRIP_STATUSES, tripGraph } from "../../lib/cabs/trip-status"
import { ABSOLUTE_MIN_LEAD_MINUTES, checkTiming, quoteForClass, snapshotOf, type TripRequest } from "../../lib/cabs/trip-quote"
import { INDIA_MOBILE, configuredOtpProvider, msg91PhoneOtpServer, otpServer } from "../../lib/core/login/otp-provider"
import { rateCard, SETTINGS } from "./fare-helpers"

const T0 = new Date("2026-11-02T10:00:00+05:30")
const mins = (m: number) => new Date(T0.getTime() + m * 60_000)

describe("how long a request waits for the operator: min(30, minutes to pickup - 60), at least 10", () => {
  const w = (untilPickup: number, max = 30) => respondWindowMinutes({ now: T0, startAt: mins(untilPickup), maxMinutes: max })
  it("is the full window when pickup is far off", () => {
    expect(w(24 * 60)).toBe(30)
    expect(w(91)).toBe(30) // 91 - 60 = 31, capped at 30
    expect(w(90)).toBe(30)
  })
  it("shrinks as pickup nears, so the answer comes before the car is due", () => {
    expect(w(89)).toBe(29)
    expect(w(80)).toBe(20)
    expect(w(75)).toBe(15)
  })
  it("never goes below 10 minutes, even for a pickup inside the hour", () => {
    expect(w(70)).toBe(10)
    expect(w(69)).toBe(10)
    expect(w(30)).toBe(10)
    expect(w(15)).toBe(10)
  })
  it("follows the operator's own maximum", () => {
    expect(w(24 * 60, 45)).toBe(45)
    expect(w(24 * 60, 10)).toBe(10)
    expect(w(100, 45)).toBe(40)
  })
  it("alerts at half the window and expires at the end", () => {
    const h = requestHold({ now: T0, startAt: mins(24 * 60), maxMinutes: 30 })
    expect(h.windowMinutes).toBe(30)
    expect(h.expiresAt).toEqual(mins(30))
    expect(h.alertAt).toEqual(mins(15))
    const short = requestHold({ now: T0, startAt: mins(70), maxMinutes: 30 })
    expect(short.expiresAt).toEqual(mins(10))
    expect(short.alertAt).toEqual(mins(5))
  })
  it("gives a customer 20 minutes by default to pay an advance", () => {
    expect(paymentHoldExpiry(T0, 20)).toEqual(mins(20))
  })
})

describe("the trip status graph", () => {
  it("lists every status and settles the rules once", () => {
    expect(tripGraph.states).toEqual(expect.arrayContaining([...TRIP_STATUSES]))
    expect(tripGraph.next("requested")).toEqual(["confirmed", "rejected", "cancelled", "expired"])
    expect(tripGraph.canMove("confirmed", "expired")).toBe(true) // an unpaid advance
    expect(tripGraph.canMove("confirmed", "rejected")).toBe(false) // an accepted booking cannot be "rejected"
  })
  it("has no way out of a finished booking", () => {
    for (const s of ["closed", "rejected", "cancelled", "expired", "no_show"] as const) expect(tripGraph.isTerminal(s)).toBe(true)
    expect(tripGraph.canMove("expired", "confirmed")).toBe(false)
    expect(tripGraph.canMove("cancelled", "requested")).toBe(false)
  })
  it("refuses an illegal move loudly", () => {
    expect(() => tripGraph.assertMove("requested", "in_trip")).toThrow('Cannot move from "requested" to "in_trip"')
    expect(tripGraph.assertMove("requested", "confirmed")).toBe("confirmed")
  })
  it("follows the trip from request to close", () => {
    const path = ["requested", "confirmed", "assigned", "driver_en_route", "arrived", "in_trip", "completed", "closed"] as const
    for (let i = 0; i < path.length - 1; i++) expect(tripGraph.canMove(path[i], path[i + 1])).toBe(true)
  })
})

describe("booking codes and share tokens", () => {
  it("are six easy-to-read characters", () => {
    for (let i = 0; i < 200; i++) {
      const c = newBookingCode()
      expect(c).toMatch(BOOKING_CODE_RE)
      expect(c).not.toMatch(/[01OIL]/)
    }
  })
  it("spread evenly over the alphabet (no letter is favoured)", () => {
    const counts = new Map<string, number>()
    for (let i = 0; i < 4000; i++) for (const ch of newBookingCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1)
    const values = [...counts.values()]
    expect(counts.size).toBe(31)
    expect(Math.max(...values) / Math.min(...values)).toBeLessThan(1.35)
  })
  it("reads a code typed by hand", () => {
    expect(normalizeCode("ab-c 234")).toBe("ABC234")
    expect(normalizeCode("ABC")).toBeNull()
    expect(normalizeCode("ABC23!")).toBeNull()
  })
  it("makes a 128-bit token and stores only its hash", async () => {
    const a = await newShareToken()
    const b = await newShareToken()
    expect(a.token).toHaveLength(22) // 16 bytes in base64url
    expect(a.token).not.toBe(b.token)
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(a.hash).not.toContain(a.token)
    expect(await hashShareToken(a.token)).toBe(a.hash)
  })
})

describe("what a request must satisfy before it is priced", () => {
  const base = { tripType: "airport" as const, startAt: mins(120), returnAt: null }
  it("needs a pickup at least the operator's lead time away (and never under 15 minutes)", () => {
    expect(ABSOLUTE_MIN_LEAD_MINUTES).toBe(15)
    expect(checkTiming({ ...base, startAt: mins(14) }, 0, T0)).toBe("too_soon")
    expect(checkTiming({ ...base, startAt: mins(16) }, 0, T0)).toBeNull()
    expect(checkTiming({ ...base, startAt: mins(119) }, 120, T0)).toBe("too_soon")
    expect(checkTiming({ ...base, startAt: mins(120) }, 120, T0)).toBeNull()
  })
  it("refuses a date more than a year ahead", () => {
    expect(checkTiming({ ...base, startAt: mins(366 * 24 * 60) }, 0, T0)).toBe("too_far_ahead")
  })
  it("needs a return after the pickup for a round trip", () => {
    const round = { tripType: "outstation_round" as const, startAt: mins(300) }
    expect(checkTiming({ ...round, returnAt: null }, 0, T0)).toBe("need_return")
    expect(checkTiming({ ...round, returnAt: mins(300) }, 0, T0)).toBe("return_before_start")
    expect(checkTiming({ ...round, returnAt: mins(301) }, 0, T0)).toBeNull()
  })
})

const place = (o: Partial<TripRequest["pickup"]> = {}) => ({ placeId: "p1", name: "Chennai Airport", address: "Chennai", lat: 13, lng: 80, stateCode: "TN", ...o })

describe("pricing a trip request", () => {
  const data = {
    cards: [{ id: "c1", vehicleClassId: "sedan", validFrom: null, validTo: null, active: true, ...rateCard("airport", { basePaise: 20000, perKmPaise: 1400 }) }],
    surcharges: [],
    packages: [],
    settings: SETTINGS,
  }
  const req = (o: Partial<TripRequest> = {}): TripRequest => ({ tripType: "airport", pickup: place(), drop: place({ placeId: "p2", name: "T Nagar" }), startAt: mins(300), returnAt: null, pax: 2, bags: 1, ...o })
  const cls = { id: "sedan", name: "Sedan", seats: 4, bags: 2, active: true }
  const route = { distanceM: 10_000, durationS: 1500, source: "google" as const }

  it("prices through the same engine as the operator's calculator", () => {
    const q = quoteForClass(cls, req(), data, route)
    expect(q.ok).toBe(true)
    if (q.ok) {
      // ₹200 base + 10 km at ₹14 = ₹340, plus 5% GST = ₹357 exactly.
      expect(q.result.totalPaise).toBe(35_700)
    }
  })
  it("skips a vehicle that cannot carry the party", () => {
    expect(quoteForClass(cls, req({ pax: 5 }), data, route)).toEqual({ ok: false, code: "no_fit" })
    expect(quoteForClass(cls, req({ bags: 3 }), data, route)).toEqual({ ok: false, code: "no_fit" })
    expect(quoteForClass({ ...cls, active: false }, req(), data, route)).toEqual({ ok: false, code: "no_fit" })
  })
  it("says so when the operator has not set up fares", () => {
    const q = quoteForClass(cls, req(), { ...data, settings: { ...SETTINGS, gstRateBps: null } }, route)
    expect(q).toMatchObject({ ok: false, code: "not_configured" })
  })
  it("says so when there is no rate card for the class", () => {
    expect(quoteForClass({ ...cls, id: "suv" }, req(), data, route)).toMatchObject({ ok: false, code: "no_price" })
  })
  it("keeps tolls and parking out of the total and carries the notice", () => {
    const q = quoteForClass(cls, req(), data, route)
    expect(q.ok && q.result.notices).toEqual(["tolls_parking_extra"])
  })
  it("stores the distance and duration only inside the quote snapshot, without place names", () => {
    const q = quoteForClass(cls, req(), data, route)
    expect(q.ok).toBe(true)
    if (!q.ok) return
    const snap = snapshotOf(q, T0)
    expect(snap).toMatchObject({ version: 1, distanceM: 10_000, durationS: 1500, distanceSource: "google" })
    expect(JSON.stringify(snap)).not.toContain("T Nagar")
    expect(JSON.stringify(snap)).not.toContain("Chennai Airport")
  })
})

describe("sealed places", () => {
  it("round-trip, and refuse any edit or expiry", async () => {
    const p = place({ stateCode: "TN" })
    const token = await sealPlace(p)
    expect(await openPlace(token)).toEqual(p)
    const [body, sig] = token.split(".")
    const forged = `${btoa(JSON.stringify({ ...p, stateCode: "KL", exp: 9999999999 })).replace(/=+$/, "")}.${sig}`
    expect(await openPlace(forged)).toBeNull()
    expect(await openPlace(`${body}.x`)).toBeNull()
    expect(await openPlace(null)).toBeNull()
    expect(await openPlace(token, Date.now() + 2 * 86_400_000)).toBeNull()
  })
})

describe("the booking copy", () => {
  const en = bookingCopy.en
  const ta = bookingCopy.ta
  const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
  it("has every key in both languages, filled in", () => {
    expect(Object.keys(ta).sort()).toEqual(Object.keys(en).sort())
    for (const [k, v] of Object.entries(ta)) expect(v.trim().length, `Tamil ${k}`).toBeGreaterThan(0)
  })
  it("uses the same {placeholders} in both languages", () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(slots(ta[k]), k).toEqual(slots(en[k]))
  })
  it("writes Tamil text in Tamil script (not English copied across)", () => {
    const sameAsEnglish = (Object.keys(en) as (keyof typeof en)[]).filter((k) => ta[k] === en[k] && !["otherLanguage", "detail_days"].includes(k))
    expect(sameAsEnglish).toEqual([])
  })
  it("fills placeholders", () => {
    expect(bookingMessage("en", "acceptedToCustomer", { code: "AB23CD", operator: "Anna Travels" })).toBe("Good news: Anna Travels confirmed booking AB23CD.")
    expect(bookingMessage("ta", "operatorReminder", { code: "AB23CD" })).toContain("AB23CD")
  })
})

describe("fare lines in Tamil", () => {
  it("leaves English as written", () => {
    expect(localizeLine({ key: "base", label: "Base fare" }, "en")).toEqual({ label: "Base fare", detail: undefined })
  })
  it("translates the engine's known lines and details, and leaves an operator's own names alone", () => {
    expect(localizeLine({ key: "base", label: "Base fare" }, "ta").label).toBe(bookingCopy.ta.line_base)
    expect(localizeLine({ key: "package", label: "8 hr / 80 km package" }, "ta").label).toBe("8 மணி / 80 கி.மீ தொகுப்பு")
    expect(localizeLine({ key: "package", label: "Tour package" }, "ta").label).toBe(bookingCopy.ta.line_tour)
    expect(localizeLine({ key: "discount", label: "Coupon DIWALI" }, "ta").label).toBe("கூப்பன் DIWALI")
    expect(localizeLine({ key: "distance", label: "Distance", detail: "12.5 km at ₹14/km" }, "ta").detail).toBe("12.5 கி.மீ × ₹14/கி.மீ")
    expect(localizeLine({ key: "bata", label: "Driver allowance", detail: "₹300 × 2 days" }, "ta").detail).toBe("₹300 × 2 நாட்கள்")
    expect(localizeLine({ key: "extra_hours", label: "Extra time (estimate)", detail: "2 hr at ₹150/hr" }, "ta").detail).toBe("2 மணி × ₹150/மணி")
    expect(localizeLine({ key: "surcharge:s1", label: "Kodaikanal hill charge", detail: "10% of the fare" }, "ta")).toEqual({ label: "Kodaikanal hill charge", detail: "கட்டணத்தில் 10%" })
  })
})

describe("quick picks", () => {
  it("offer an airport and a station in Tamil and English", () => {
    expect(QUICK_PICKS.some((q) => q.kind === "airport")).toBe(true)
    expect(QUICK_PICKS.some((q) => q.kind === "rail")).toBe(true)
    for (const q of QUICK_PICKS) expect(q.ta).toMatch(/[஀-௿]/)
  })
  it("narrow to the operator's cities, or show all when there is no match", () => {
    expect(picksFor(["Madurai"]).every((q) => q.city === "madurai")).toBe(true)
    expect(picksFor([]).length).toBe(QUICK_PICKS.length)
    expect(picksFor(["Atlantis"]).length).toBe(QUICK_PICKS.length)
  })
})

describe("phone login provider", () => {
  it("accepts only Indian mobile numbers", () => {
    expect(INDIA_MOBILE.test("+919876543210")).toBe(true)
    for (const bad of ["+14155550123", "+449876543210", "+915876543210", "9876543210", "+91987654321", "+9198765432100"]) expect(INDIA_MOBILE.test(bad), bad).toBe(false)
  })
  it("switches between Firebase and MSG91 by one setting", () => {
    expect(configuredOtpProvider({})).toBe("firebase")
    expect(configuredOtpProvider({ PHONE_OTP_PROVIDER: "msg91" })).toBe("msg91")
    expect(otpServer("msg91").name).toBe("msg91")
    expect(otpServer("firebase").name).toBe("firebase")
  })
  it("fails closed until MSG91 is built", async () => {
    expect(await msg91PhoneOtpServer.verify("anything")).toBeNull()
  })
})
