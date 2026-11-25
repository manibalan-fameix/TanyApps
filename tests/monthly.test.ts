import { describe, expect, it } from "vitest"

import { formatDate, isDue, istDate, monthlyBill, monthlyDiscount, nextDelivery, ordinal, startingCycle } from "@/lib/restaurant/monthly"
import type { MonthlyOffer } from "@/lib/restaurant/settings"

const offer = (o: Partial<MonthlyOffer> = {}): MonthlyOffer => ({ enabled: true, percentOff: 10, maxDiscount: null, freeDelivery: true, ...o })
// 12:00 India time on the given day.
const ist = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 6, 30))

describe("monthly offer", () => {
  it("takes the percentage off, rounded down", () => {
    expect(monthlyDiscount(999, offer())).toBe(99)
  })
  it("respects the cap and never exceeds the bill", () => {
    expect(monthlyDiscount(2000, offer({ maxDiscount: 150 }))).toBe(150)
    expect(monthlyDiscount(5, offer({ percentOff: 50, maxDiscount: 999 }))).toBe(2)
  })
  it("gives nothing when the offer is off", () => {
    expect(monthlyDiscount(1000, offer({ enabled: false }))).toBe(0)
  })
  it("drops the delivery fee only when the offer says so", () => {
    expect(monthlyBill(1000, 40, offer())).toEqual({ subtotal: 1000, discount: 100, deliveryFee: 0, total: 900 })
    expect(monthlyBill(1000, 40, offer({ freeDelivery: false })).total).toBe(940)
  })
})

describe("monthly schedule (India time)", () => {
  it("reads the date in India, not UTC", () => {
    // 20:00 UTC on the 31st is already the 1st of the next month in India.
    expect(istDate(new Date(Date.UTC(2026, 0, 31, 20, 0)))).toMatchObject({ month: 2, day: 1, cycle: "2026-02" })
  })
  it("is due on its day, not before, and once a month", () => {
    const plan = { status: "active", deliveryDay: 10, lastCycle: "2026-10" }
    expect(isDue(plan, ist(2026, 11, 9))).toBe(false)
    expect(isDue(plan, ist(2026, 11, 10))).toBe(true)
    expect(isDue({ ...plan, lastCycle: "2026-11" }, ist(2026, 11, 20))).toBe(false)
  })
  it("retries a failed month on later days, but never a paused plan", () => {
    expect(isDue({ status: "active", deliveryDay: 5, lastCycle: "2026-10" }, ist(2026, 11, 18))).toBe(true)
    expect(isDue({ status: "paused", deliveryDay: 5, lastCycle: null }, ist(2026, 11, 18))).toBe(false)
  })
  it("starts next month when the day has already come", () => {
    expect(startingCycle(5, ist(2026, 11, 20))).toBe("2026-11")
    expect(startingCycle(25, ist(2026, 11, 20))).toBeNull()
  })
  it("shows the next delivery, rolling over the year", () => {
    expect(nextDelivery({ deliveryDay: 25, lastCycle: null }, ist(2026, 11, 20))).toEqual({ year: 2026, month: 11, day: 25 })
    expect(formatDate(nextDelivery({ deliveryDay: 5, lastCycle: "2026-12" }, ist(2026, 12, 20)))).toBe("5 Jan 2027")
  })
  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 21, 22, 28].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "21st", "22nd", "28th"])
  })
})
