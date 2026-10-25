import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RefundError, refundIdempotencyKey, refundPayment } from "../lib/core/payments/razorpay-api"

type Call = { method: string; url: string; headers: Record<string, string>; body: Record<string, unknown> | null }
type Reply = Response | Error

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const KEY = "tany_rf_pay_abc123_25000"

describe("refundPayment: idempotency, outcomes and recovery", () => {
  let calls: Call[]
  let replies: Reply[]

  const posts = () => calls.filter((c) => c.method === "POST")

  beforeEach(() => {
    calls = []
    replies = []
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_abc")
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret")
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ method: String(init.method), url, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null })
        const next = replies.shift()
        if (!next) throw new Error("unexpected extra Razorpay request")
        if (next instanceof Error) throw next
        return next
      }),
    )
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("derives one valid key per payment and amount", () => {
    expect(refundIdempotencyKey("pay_abc123", 250)).toBe(KEY)
    expect(refundIdempotencyKey("pay_abc123", 250)).toBe(refundIdempotencyKey("pay_abc123", 250))
    expect(refundIdempotencyKey("pay_abc123", 100)).not.toBe(KEY)
    expect(KEY).toMatch(/^[A-Za-z0-9_-]{10,}$/)
  })

  it("sends the key as X-Refund-Idempotency and records it in the refund notes", async () => {
    replies = [json(200, { id: "rfnd_1", status: "processed" })]
    expect(await refundPayment("pay_abc123", 250, true)).toEqual({ refundId: "rfnd_1", status: "processed" })
    expect(calls[0].headers["X-Refund-Idempotency"]).toBe(KEY)
    expect(calls[0].body).toEqual({ amount: 25000, speed: "normal", reverse_all: 1, notes: { tany_refund_key: KEY } })
  })

  it("rejects a malformed key before any request is made", async () => {
    for (const bad of ["short", "has space in it", "bad/char/key!!"]) {
      await expect(refundPayment("pay_abc123", 250, true, { idempotencyKey: bad })).rejects.toThrow("idempotency key")
    }
    expect(calls).toHaveLength(0)
  })

  it("keeps the same key and an identical body across retries after a definite refusal", async () => {
    replies = [json(400, { error: { description: "insufficient balance" } }), json(400, { error: {} }), json(200, { id: "rfnd_2", status: "pending" })]
    await expect(refundPayment("pay_abc123", 250, true)).rejects.toThrow("insufficient balance")
    const retry = await refundPayment("pay_abc123", 250, true)
    expect(retry).toEqual({ refundId: "rfnd_2", status: "pending" })
    const [first, second] = posts()
    expect(second.headers["X-Refund-Idempotency"]).toBe(first.headers["X-Refund-Idempotency"])
    expect(second.body).toEqual(first.body)
  })

  it("reports a pending refund as accepted, not as an error", async () => {
    replies = [json(200, { id: "rfnd_3", status: "pending" })]
    expect(await refundPayment("pay_abc123", 250, false)).toEqual({ refundId: "rfnd_3", status: "pending" })
    expect(calls[0].body).not.toHaveProperty("reverse_all")
  })

  it("treats a refund that Razorpay created and failed as a failure", async () => {
    replies = [json(200, { id: "rfnd_4", status: "failed" })]
    const err = await refundPayment("pay_abc123", 250, true).catch((e) => e)
    expect(err).toBeInstanceOf(RefundError)
    expect(err.kind).toBe("failed")
  })

  it("adopts the existing refund on 409 instead of creating another", async () => {
    replies = [json(409, { error: { description: "request in progress" } }), json(200, { items: [{ id: "rfnd_5", amount: 25000, status: "pending", notes: { tany_refund_key: KEY } }] })]
    expect(await refundPayment("pay_abc123", 250, true)).toEqual({ refundId: "rfnd_5", status: "pending", reconciled: true })
    expect(posts()).toHaveLength(1)
  })

  it("on 409 with no refund found, fails as ambiguous and stays retryable with the same key", async () => {
    replies = [json(409, { error: {} }), json(200, { items: [] }), json(200, { id: "rfnd_6", status: "processed" })]
    const err = await refundPayment("pay_abc123", 250, true).catch((e) => e)
    expect(err).toBeInstanceOf(RefundError)
    expect(err.kind).toBe("ambiguous")
    expect((await refundPayment("pay_abc123", 250, true)).refundId).toBe("rfnd_6")
    expect(posts().map((c) => c.headers["X-Refund-Idempotency"])).toEqual([KEY, KEY])
  })

  it("crash after success: a lost response is reconciled from the payment's refunds, with no second POST", async () => {
    const lostAnswers = [new DOMException("timed out", "TimeoutError"), new TypeError("fetch failed"), json(502, { error: {} }), new Response("<html>", { status: 200 }), json(200, { entity: "refund" })]
    for (const lost of lostAnswers) {
      calls.length = 0
      replies = [lost, json(200, { items: [{ id: "rfnd_7", amount: 25000, status: "processed", notes: [] }] })]
      expect(await refundPayment("pay_abc123", 250, true)).toEqual({ refundId: "rfnd_7", status: "processed", reconciled: true })
      expect(posts()).toHaveLength(1)
    }
  })

  it("a refund made before keys existed (400 already refunded) is adopted, not retried forever", async () => {
    replies = [json(400, { error: { description: "The payment has been fully refunded already" } }), json(200, { items: [{ id: "rfnd_old", amount: 25000, status: "processed" }] })]
    expect((await refundPayment("pay_abc123", 250, true)).refundId).toBe("rfnd_old")
  })

  it("never adopts a failed refund, a different amount, or another attempt's keyed refund", async () => {
    replies = [
      new TypeError("fetch failed"),
      json(200, { items: [{ id: "r_failed", amount: 25000, status: "failed" }, { id: "r_other_amount", amount: 100, status: "processed" }, { id: "r_other_key", amount: 25000, status: "processed", notes: { tany_refund_key: "someone_else_key" } }] }),
    ]
    const err = await refundPayment("pay_abc123", 250, true).catch((e) => e)
    expect(err).toBeInstanceOf(RefundError)
    expect(err.kind).toBe("ambiguous")
  })

  it("if the refunds cannot be listed either, it fails as ambiguous without a second POST", async () => {
    replies = [new TypeError("fetch failed"), new TypeError("fetch failed")]
    const err = await refundPayment("pay_abc123", 250, true).catch((e) => e)
    expect(err.kind).toBe("ambiguous")
    expect(posts()).toHaveLength(1)
  })

  it("does not look for a refund after a plain refusal such as bad credentials", async () => {
    replies = [json(401, { error: { description: "Authentication failed" } })]
    await expect(refundPayment("pay_abc123", 250, true)).rejects.toThrow("Razorpay 401")
    expect(calls).toHaveLength(1)
  })
})
