import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { refundBookingPayment } from "../lib/route/razorpay"

describe("refundBookingPayment", () => {
  const calls: { url: string; body: Record<string, unknown> }[] = []

  beforeEach(() => {
    calls.length = 0
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_abc")
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret")
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) })
      return new Response(JSON.stringify({ id: "rfnd_1" }), { status: 200 })
    }))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("refunds the full amount in paise and reverses the transfer to the dealer's linked account", async () => {
    await refundBookingPayment("pay_123", 5000)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("https://api.razorpay.com/v1/payments/pay_123/refund")
    expect(calls[0].body).toEqual({ amount: 500000, speed: "normal", reverse_all: 1 })
  })

  it("throws when Razorpay refuses, so the booking is not marked refunded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { description: "insufficient balance in linked account" } }), { status: 400 })))
    await expect(refundBookingPayment("pay_123", 5000)).rejects.toThrow("insufficient balance")
  })

  it("throws, instead of silently doing nothing, when payments are not set up", async () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "")
    vi.stubEnv("RAZORPAY_KEY_SECRET", "")
    await expect(refundBookingPayment("pay_123", 5000)).rejects.toThrow("not set up")
    expect(calls).toHaveLength(0)
  })
})
