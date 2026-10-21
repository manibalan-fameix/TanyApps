import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const countMetric = vi.fn()
vi.mock("../lib/core/metrics", () => ({ countMetric: (...a: unknown[]) => countMetric(...a) }))

import { dispatchCapturedPayment, type PaymentHandlers } from "../lib/core/payments/webhook"
import { createBookingOrder, createFoodOrder } from "../lib/route/razorpay"

function handlers(over: { eats?: { found: boolean; refundFailed?: boolean }; motors?: { found: boolean } } = {}) {
  const eats = vi.fn(async () => over.eats ?? { found: true })
  const motors = vi.fn(async () => over.motors ?? { found: true })
  return { eats, motors, set: { eats_order: eats, motors_booking: motors } as PaymentHandlers }
}
const pay = (notes?: Record<string, unknown> | null) => ({ orderId: "order_1", paymentId: "pay_1", notes })

beforeEach(() => countMetric.mockClear())

describe("dispatchCapturedPayment", () => {
  it("sends an eats_order payment to the food flow only, with no fallback count", async () => {
    const h = handlers()
    expect(await dispatchCapturedPayment(pay({ kind: "eats_order" }), h.set)).toBe("handled")
    expect(h.eats).toHaveBeenCalledWith("order_1", "pay_1")
    expect(h.motors).not.toHaveBeenCalled()
    expect(countMetric).not.toHaveBeenCalled()
  })

  it("sends a motors_booking payment to the car flow only", async () => {
    const h = handlers()
    expect(await dispatchCapturedPayment(pay({ kind: "motors_booking" }), h.set)).toBe("handled")
    expect(h.motors).toHaveBeenCalledWith("order_1", "pay_1")
    expect(h.eats).not.toHaveBeenCalled()
  })

  it("counts a kind whose order cannot be found instead of guessing another flow", async () => {
    const h = handlers({ eats: { found: false } })
    expect(await dispatchCapturedPayment(pay({ kind: "eats_order" }), h.set)).toBe("unmatched")
    expect(h.motors).not.toHaveBeenCalled()
    expect(countMetric).toHaveBeenCalledWith("razorpay_webhook_unmatched", { kind: "eats_order" })
  })

  it("falls back to the old Eats-then-Motors lookup when there is no kind, and counts every hit", async () => {
    const found = handlers()
    expect(await dispatchCapturedPayment(pay(null), found.set)).toBe("fallback")
    expect(found.eats).toHaveBeenCalledTimes(1)
    expect(found.motors).not.toHaveBeenCalled()

    const miss = handlers({ eats: { found: false } })
    expect(await dispatchCapturedPayment(pay({}), miss.set)).toBe("fallback")
    expect(miss.motors).toHaveBeenCalledTimes(1)
    expect(countMetric).toHaveBeenCalledTimes(2)
    expect(countMetric).toHaveBeenCalledWith("razorpay_webhook_fallback")
  })

  it("acknowledges and counts an unknown kind without touching any flow", async () => {
    const h = handlers()
    expect(await dispatchCapturedPayment(pay({ kind: "cab_trip" }), h.set)).toBe("ignored")
    expect(h.eats).not.toHaveBeenCalled()
    expect(h.motors).not.toHaveBeenCalled()
    expect(countMetric).toHaveBeenCalledWith("razorpay_webhook_unknown_kind", { kind: "cab_trip" })
  })

  it("throws when a late payment's refund failed, so Razorpay retries (kind and fallback paths)", async () => {
    await expect(dispatchCapturedPayment(pay({ kind: "eats_order" }), handlers({ eats: { found: true, refundFailed: true } }).set)).rejects.toThrow("refund")
    await expect(dispatchCapturedPayment(pay(null), handlers({ eats: { found: true, refundFailed: true } }).set)).rejects.toThrow("refund")
  })
})

describe("orders carry notes.kind", () => {
  const bodies: Record<string, unknown>[] = []
  beforeEach(() => {
    bodies.length = 0
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_abc")
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret")
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ id: "order_new" }), { status: 200 })
    }))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("tags a food order, on the order and on its transfer", async () => {
    expect(await createFoodOrder({ amount: 250, receipt: "ABC123", linkedAccountId: "acc_1", notes: { order_code: "ABC123" } })).toEqual({ orderId: "order_new" })
    const body = bodies[0] as { amount: number; receipt: string; notes: Record<string, string>; transfers: { notes: Record<string, string> }[] }
    expect(body.amount).toBe(25000)
    expect(body.receipt).toBe("ABC123")
    expect(body.notes).toEqual({ order_code: "ABC123", kind: "eats_order" })
    expect(body.transfers[0].notes.kind).toBe("eats_order")
  })

  it("tags a car booking payment", async () => {
    await createBookingOrder({ amount: 5000, linkedAccountId: "acc_1", notes: { car_id: "c1" } })
    const body = bodies[0] as { notes: Record<string, string> }
    expect(body.notes).toEqual({ car_id: "c1", kind: "motors_booking" })
  })

  it("makes a food order with no linked account carry no transfer (test keys only)", async () => {
    await createFoodOrder({ amount: 100, receipt: "R", linkedAccountId: null, notes: {} })
    expect(bodies[0]).not.toHaveProperty("transfers")
    expect((bodies[0] as { notes: Record<string, string> }).notes.kind).toBe("eats_order")
  })

  it("lets a caller's own notes never override the kind", async () => {
    await createFoodOrder({ amount: 100, receipt: "R", linkedAccountId: null, notes: { kind: "motors_booking" } })
    expect((bodies[0] as { notes: Record<string, string> }).notes.kind).toBe("eats_order")
  })
})
