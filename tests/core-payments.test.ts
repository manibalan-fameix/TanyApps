import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const countMetric = vi.fn()
vi.mock("../lib/core/metrics", () => ({ countMetric: (...a: unknown[]) => countMetric(...a) }))

import { dispatchPaymentEvent, type PaymentHandlers, type PaymentHandlerResult } from "../lib/core/payments/webhook"
import { createBookingOrder, createFoodOrder } from "../lib/route/razorpay"

function handlers(over: { eats?: PaymentHandlerResult; motors?: PaymentHandlerResult } = {}) {
  const eats = vi.fn(async () => over.eats ?? { found: true, applied: true })
  const motors = vi.fn(async () => over.motors ?? { found: true, applied: true })
  return { eats, motors, set: { eats_order: eats, motors_booking: motors } as PaymentHandlers }
}
const paid = (kind?: unknown) => ({ source: "order.paid" as const, orderId: "order_1", paymentId: "pay_1", orderNotes: kind === undefined ? null : { kind } })
const captured = () => ({ source: "payment.captured" as const, orderId: "order_1", paymentId: "pay_1" })

beforeEach(() => countMetric.mockClear())

describe("dispatchPaymentEvent: order.paid (primary)", () => {
  it("sends an eats_order payment to the food flow only, with nothing counted", async () => {
    const h = handlers()
    expect(await dispatchPaymentEvent(paid("eats_order"), h.set)).toBe("handled")
    expect(h.eats).toHaveBeenCalledWith("order_1", "pay_1")
    expect(h.motors).not.toHaveBeenCalled()
    expect(countMetric).not.toHaveBeenCalled()
  })

  it("sends a motors_booking payment to the car flow only", async () => {
    const h = handlers()
    expect(await dispatchPaymentEvent(paid("motors_booking"), h.set)).toBe("handled")
    expect(h.motors).toHaveBeenCalledWith("order_1", "pay_1")
    expect(h.eats).not.toHaveBeenCalled()
  })

  it("counts a kind whose order cannot be found instead of guessing another flow", async () => {
    const h = handlers({ eats: { found: false } })
    expect(await dispatchPaymentEvent(paid("eats_order"), h.set)).toBe("unmatched")
    expect(h.motors).not.toHaveBeenCalled()
    expect(countMetric).toHaveBeenCalledWith("razorpay_webhook_unmatched", { kind: "eats_order" })
  })

  it("uses the old Eats-then-Motors lookup for an order with no kind, and counts it", async () => {
    const found = handlers()
    expect(await dispatchPaymentEvent(paid(), found.set)).toBe("fallback")
    expect(found.motors).not.toHaveBeenCalled()
    const miss = handlers({ eats: { found: false } })
    expect(await dispatchPaymentEvent({ ...paid(), orderNotes: {} }, miss.set)).toBe("fallback")
    expect(miss.motors).toHaveBeenCalledTimes(1)
    expect(countMetric).toHaveBeenCalledTimes(2)
    expect(countMetric).toHaveBeenCalledWith("razorpay_webhook_fallback", { event: "order.paid", reason: "no_kind" })
  })

  it("acknowledges and counts an unknown kind without touching any flow", async () => {
    const h = handlers()
    expect(await dispatchPaymentEvent(paid("cab_trip"), h.set)).toBe("ignored")
    expect(h.eats).not.toHaveBeenCalled()
    expect(h.motors).not.toHaveBeenCalled()
    expect(countMetric).toHaveBeenCalledWith("razorpay_webhook_unknown_kind", { kind: "cab_trip" })
  })

  it("throws when a late payment's refund failed, so Razorpay retries", async () => {
    await expect(dispatchPaymentEvent(paid("eats_order"), handlers({ eats: { found: true, refundFailed: true } }).set)).rejects.toThrow("refund")
  })
})

describe("dispatchPaymentEvent: a captured payment that belongs to no order", () => {
  it("is counted as unmatched on the fallback path, whichever event carried it", async () => {
    const none = handlers({ eats: { found: false }, motors: { found: false } })
    expect(await dispatchPaymentEvent(captured(), none.set)).toBe("unmatched")
    expect(countMetric).toHaveBeenCalledWith("razorpay_webhook_unmatched", { event: "payment.captured", reason: "no_order" })
    countMetric.mockClear()
    expect(await dispatchPaymentEvent({ ...paid(), orderNotes: {} }, none.set)).toBe("unmatched")
    expect(countMetric).toHaveBeenCalledWith("razorpay_webhook_unmatched", { event: "order.paid", reason: "no_order" })
  })
  it("is not counted when some flow owns the order", async () => {
    await dispatchPaymentEvent(captured(), handlers({ eats: { found: false }, motors: { found: true, applied: false } }).set)
    expect(countMetric).not.toHaveBeenCalledWith("razorpay_webhook_unmatched", expect.anything())
  })
})

describe("dispatchPaymentEvent: payment.captured (fallback)", () => {
  it("looks the order up the old way, and counts a hit only when it did the work", async () => {
    const first = handlers()
    await dispatchPaymentEvent(captured(), first.set)
    expect(countMetric).toHaveBeenCalledWith("razorpay_webhook_fallback", { event: "payment.captured", reason: "did_the_work" })

    countMetric.mockClear()
    const already = handlers({ eats: { found: true, applied: false } })
    await dispatchPaymentEvent(captured(), already.set)
    expect(countMetric).not.toHaveBeenCalled() // order.paid got there first
  })

  it("falls through to the car flow when no food order matches", async () => {
    const h = handlers({ eats: { found: false } })
    await dispatchPaymentEvent(captured(), h.set)
    expect(h.motors).toHaveBeenCalledTimes(1)
  })

  it("throws when a late payment's refund failed", async () => {
    await expect(dispatchPaymentEvent(captured(), handlers({ eats: { found: true, refundFailed: true } }).set)).rejects.toThrow("refund")
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
