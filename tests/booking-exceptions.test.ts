import { describe, expect, it } from "vitest"

import { ATTENTION_LABEL, bookingAttention, REFUND_NOT_STARTED_AFTER_MIN, REFUND_PENDING_ALERT_DAYS } from "../lib/bookings/exceptions"

const now = new Date("2026-11-01T10:00:00Z")
const ago = (ms: number) => new Date(now.getTime() - ms)
const MIN = 60_000
const DAY = 86_400_000

describe("when a car-booking refund needs a person", () => {
  it("ignores bookings that are not waiting on a refund", () => {
    for (const status of ["created", "paid", "failed", "refunded", "cancelled"]) expect(bookingAttention({ status, refundStatus: null, refundRequestedAt: ago(99 * DAY) }, now)).toBeNull()
  })
  it("a refund Razorpay failed always needs a person, at once", () => {
    expect(bookingAttention({ status: "refund_pending", refundStatus: "failed", refundRequestedAt: ago(MIN) }, now)).toBe("refund_failed")
  })
  it("an owed refund is fine for a few minutes, then means the retry job is not clearing it", () => {
    expect(bookingAttention({ status: "refund_pending", refundStatus: null, refundRequestedAt: ago((REFUND_NOT_STARTED_AFTER_MIN - 1) * MIN) }, now)).toBeNull()
    expect(bookingAttention({ status: "refund_pending", refundStatus: null, refundRequestedAt: ago((REFUND_NOT_STARTED_AFTER_MIN + 1) * MIN) }, now)).toBe("refund_not_started")
  })
  it("a pending refund is normal for days (banks are slow), and only alarming well past that", () => {
    expect(bookingAttention({ status: "refund_pending", refundStatus: "pending", refundRequestedAt: ago(5 * DAY) }, now)).toBeNull()
    expect(bookingAttention({ status: "refund_pending", refundStatus: "pending", refundRequestedAt: ago((REFUND_PENDING_ALERT_DAYS + 1) * DAY) }, now)).toBe("refund_slow")
  })
  it("a refund with no recorded start is treated as old, so it is never hidden", () => {
    expect(bookingAttention({ status: "refund_pending", refundStatus: null, refundRequestedAt: null }, now)).toBe("refund_not_started")
  })
  it("every condition has a plain-language label for the Tany team", () => {
    for (const k of ["refund_failed", "refund_not_started", "refund_slow"] as const) expect(ATTENTION_LABEL[k].length).toBeGreaterThan(10)
  })
})
