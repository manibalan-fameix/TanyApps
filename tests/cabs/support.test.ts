import { describe, expect, it } from "vitest"

import { EXPIRY_WARNING_DAYS, countExpiry, daysUntil, expiryStatus } from "../../lib/cabs/expiry"
import { BOOKINGS_EVENT, bookingsBanner, bookingsUsage, cabLimitsFor, checkHardLimit, monthKey } from "../../lib/cabs/limits"
import { formatPaise, paiseToRupeesText, rupeesToPaise } from "../../lib/cabs/money"
import { VERTICALS } from "../../lib/verticals"

describe("money text", () => {
  it("turns rupees into paise exactly, without floats", () => {
    expect(rupeesToPaise("14")).toBe(1400)
    expect(rupeesToPaise("14.5")).toBe(1450)
    expect(rupeesToPaise("14.05")).toBe(1405)
    expect(rupeesToPaise("14.1")).toBe(1410) // 14.1 * 100 is 1409.9999999999998 in floating point
    expect(rupeesToPaise("0.29")).toBe(29) // 0.29 * 100 is 28.999999999999996
    expect(rupeesToPaise("1,23,456.78")).toBe(12_345_678)
    expect(rupeesToPaise("₹ 500")).toBe(50_000)
    expect(rupeesToPaise(250)).toBe(25_000)
    expect(rupeesToPaise("0")).toBe(0)
  })
  it("rejects anything that is not a plain amount", () => {
    for (const bad of ["", " ", "abc", "-5", "1.234", "1e3", "12.", ".5", "1.2.3", "999999999", null, undefined, NaN]) expect(rupeesToPaise(bad as string), String(bad)).toBeNull()
  })
  it("writes paise back as text for a form field", () => {
    expect(paiseToRupeesText(1450)).toBe("14.50")
    expect(paiseToRupeesText(1400)).toBe("14")
    expect(paiseToRupeesText(5)).toBe("0.05")
    expect(paiseToRupeesText(0)).toBe("0")
    expect(paiseToRupeesText(null)).toBe("")
    expect(paiseToRupeesText(undefined)).toBe("")
    expect(rupeesToPaise(paiseToRupeesText(1405))).toBe(1405)
  })
  it("formats paise with Indian digit grouping", () => {
    expect(formatPaise(1450)).toBe("₹14.50")
    expect(formatPaise(1400)).toBe("₹14")
    expect(formatPaise(123_456_700)).toBe("₹12,34,567")
    expect(formatPaise(0)).toBe("₹0")
    expect(formatPaise(null)).toBe("—")
  })
})

describe("document expiry", () => {
  const now = new Date("2026-11-10T09:00:00+05:30")
  it("counts whole days in IST", () => {
    expect(daysUntil("2026-11-10", now)).toBe(0)
    expect(daysUntil("2026-11-11", now)).toBe(1)
    expect(daysUntil("2026-11-09", now)).toBe(-1)
    // 23:30 UTC on 9 Nov is already 10 Nov in India.
    expect(daysUntil("2026-11-10", new Date("2026-11-09T23:30:00Z"))).toBe(0)
  })
  it("is expired after the last valid day, soon within 30 days (inclusive), ok beyond", () => {
    expect(expiryStatus("2026-11-09", now)).toBe("expired")
    expect(expiryStatus("2026-11-10", now)).toBe("soon") // valid through the whole of today
    expect(expiryStatus("2026-12-10", now)).toBe("soon") // exactly 30 days
    expect(expiryStatus("2026-12-11", now)).toBe("ok") // 31 days
    expect(EXPIRY_WARNING_DAYS).toBe(30)
  })
  it("has no status for a document that does not expire or a malformed date", () => {
    for (const v of [null, undefined, "", "soon", "2026-13", "10/11/2026"]) expect(expiryStatus(v, now)).toBe("none")
  })
  it("counts expired and expiring-soon documents, ignoring the rest", () => {
    expect(countExpiry(["2026-01-01", "2026-11-20", "2027-06-01", null, undefined, "2026-11-10"], now)).toEqual({ expired: 1, soon: 2 })
  })
})

describe("cab plan limits", () => {
  it("come from the registry with the owner's numbers, and there is no free plan", () => {
    expect(cabLimitsFor("starter")).toEqual({ vehicles: 10, drivers: 15, bookingsPerMonth: 400 })
    expect(cabLimitsFor("growth")).toEqual({ vehicles: 30, drivers: 45, bookingsPerMonth: 1500 })
    expect(cabLimitsFor("pro")).toEqual({ vehicles: 75, drivers: 110, bookingsPerMonth: 4000 })
    expect(cabLimitsFor("free")).toBeNull()
    expect(cabLimitsFor("scale")).toBeNull()
    expect(cabLimitsFor("nonsense")).toBeNull()
    expect(VERTICALS.cabs.offeredPlans).toEqual(["starter", "growth", "pro"])
  })
  it("block the 11th vehicle and the 16th driver on starter, with an upgrade prompt", () => {
    expect(checkHardLimit("vehicles", 9, "starter")).toEqual({ ok: true, limit: 10, remaining: 0 })
    const v = checkHardLimit("vehicles", 10, "starter")
    expect(v).toMatchObject({ ok: false, limit: 10 })
    expect(!v.ok && v.message).toContain("Upgrade")
    expect(checkHardLimit("drivers", 14, "starter").ok).toBe(true)
    expect(checkHardLimit("drivers", 15, "starter").ok).toBe(false)
    expect(checkHardLimit("vehicles", 29, "growth").ok).toBe(true)
    expect(checkHardLimit("vehicles", 30, "growth").ok).toBe(false)
    expect(checkHardLimit("drivers", 109, "pro").ok).toBe(true)
    expect(checkHardLimit("drivers", 110, "pro").ok).toBe(false)
    expect(checkHardLimit("vehicles", 74, "pro").ok).toBe(true)
  })
  it("block everything on a plan that has no cab limits", () => {
    expect(checkHardLimit("vehicles", 0, "free")).toMatchObject({ ok: false, limit: 0 })
  })
  it("treat bookings as a soft limit: warn at 80%, over at 100%, and never refuse", () => {
    expect(bookingsUsage(319, "starter")).toMatchObject({ level: "ok", limit: 400 })
    expect(bookingsUsage(320, "starter")).toMatchObject({ level: "warn", percent: 80 })
    expect(bookingsUsage(399, "starter")).toMatchObject({ level: "warn" })
    expect(bookingsUsage(400, "starter")).toMatchObject({ level: "over", percent: 100 })
    expect(bookingsUsage(9999, "starter")).toMatchObject({ level: "over" })
    expect(bookingsUsage(0, "pro")).toMatchObject({ level: "ok", limit: 4000 })
    expect(bookingsUsage(5, "free")).toBeNull()
  })
  it("say the right thing in the banner", () => {
    expect(bookingsBanner(null)).toBeNull()
    expect(bookingsBanner(bookingsUsage(10, "starter"))).toBeNull()
    const warn = bookingsBanner(bookingsUsage(320, "starter"))
    expect(warn).toMatchObject({ tone: "warning", title: "80% of this month's bookings used" })
    const over = bookingsBanner(bookingsUsage(401, "starter"))
    expect(over).toMatchObject({ tone: "destructive" })
    expect(over?.body).toContain("Customers can still book")
  })
  it("name the events recorded for the Tany team, and the month they count in (IST)", () => {
    expect(BOOKINGS_EVENT).toEqual({ warn: "plan.bookings_80_percent", over: "plan.bookings_100_percent" })
    expect(monthKey(new Date("2026-11-30T20:00:00Z"))).toBe("2026-12") // already 1 Dec in India
    expect(monthKey(new Date("2026-11-15T10:00:00Z"))).toBe("2026-11")
  })
})
