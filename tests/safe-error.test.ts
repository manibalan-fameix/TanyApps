import { describe, expect, it } from "vitest"

import { safeErrorMessage } from "../lib/core/safe-error"

describe("safeErrorMessage: nothing a customer typed or paid with reaches a log", () => {
  const drizzle = Object.assign(
    new Error('Failed query: insert into "bookings" ("buyer_name", "buyer_phone", "razorpay_payment_id") values ($1, $2, $3)\nparams: Ravi Kumar,v1:aGVsbG8=:dGFn:Y2lwaGVy,pay_ABC123'),
    { cause: Object.assign(new Error('duplicate key value violates unique constraint "bookings_razorpay_order_id_unique"'), { code: "23505" }) },
  )
  it("keeps what went wrong and drops every value from a failed query", () => {
    const m = safeErrorMessage(drizzle)
    expect(m).toBe('database error 23505: duplicate key value violates unique constraint "bookings_razorpay_order_id_unique"')
    for (const secret of ["Ravi Kumar", "pay_ABC123", "v1:aGVs", "insert into", "params"]) expect(m).not.toContain(secret)
  })
  it("copes with a failed query that has no driver cause", () => {
    const m = safeErrorMessage(new Error('Failed query: select 1\nparams: secret-value'))
    expect(m).toBe("database error")
  })
  it("drops a params tail from any other message, and bounds the length", () => {
    expect(safeErrorMessage(new Error("boom\nparams: secret"))).toBe("boom")
    expect(safeErrorMessage(new Error("x".repeat(1000))).length).toBe(200)
  })
  it("leaves ordinary messages and non-errors alone", () => {
    expect(safeErrorMessage(new Error("Razorpay 400: The payment has been fully refunded already"))).toBe("Razorpay 400: The payment has been fully refunded already")
    expect(safeErrorMessage("a string")).toBe("unknown")
    expect(safeErrorMessage(null)).toBe("unknown")
  })
})
