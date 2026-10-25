import { describe, expect, it } from "vitest"

import { BOOKING_CODE_CONSTRAINT, isBookingCodeCollision, withBookingCodeRetry } from "../../lib/cabs/trips"

const pgError = (code: string, constraint?: string) => Object.assign(new Error("failed query"), { cause: { code, constraint } })
const collision = () => pgError("23505", BOOKING_CODE_CONSTRAINT)

describe("booking code collision detection", () => {
  it("recognises a clash of the booking code, however the driver wraps it", () => {
    expect(isBookingCodeCollision(collision())).toBe(true)
    expect(isBookingCodeCollision(Object.assign(new Error("x"), { code: "23505", constraint: BOOKING_CODE_CONSTRAINT }))).toBe(true) // unwrapped (Neon WebSocket pool)
  })
  it("does not treat any other unique violation, or any other error, as a code clash", () => {
    expect(isBookingCodeCollision(pgError("23505", "customers_dealer_phone_uq"))).toBe(false)
    expect(isBookingCodeCollision(pgError("23505"))).toBe(false)
    expect(isBookingCodeCollision(pgError("23503", BOOKING_CODE_CONSTRAINT))).toBe(false)
    expect(isBookingCodeCollision(new Error("boom"))).toBe(false)
    expect(isBookingCodeCollision(null)).toBe(false)
  })
})

describe("withBookingCodeRetry", () => {
  it("runs the whole unit again after a clash and returns the second result", async () => {
    let runs = 0
    const out = await withBookingCodeRetry(async () => {
      if (++runs < 3) throw collision()
      return "booked"
    })
    expect([out, runs]).toEqual(["booked", 3])
  })
  it("stops after the limit and throws the clash itself", async () => {
    let runs = 0
    await expect(withBookingCodeRetry(async () => { runs++; throw collision() }, 5)).rejects.toMatchObject({ cause: { constraint: BOOKING_CODE_CONSTRAINT } })
    expect(runs).toBe(5)
  })
  it("never retries an unrelated error", async () => {
    for (const err of [pgError("23505", "customers_dealer_phone_uq"), pgError("23503", "trips_vehicle_class_id_fk"), new Error("network")]) {
      let runs = 0
      await expect(withBookingCodeRetry(async () => { runs++; throw err })).rejects.toBe(err)
      expect(runs).toBe(1)
    }
  })
})
