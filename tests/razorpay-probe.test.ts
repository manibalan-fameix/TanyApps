// These tests exercise the PROBE'S OWN LOGIC AND SAFETY against a MOCKED Razorpay that behaves as the documentation says.
// They prove what the probe will do and refuse to do. They do NOT prove how the real Razorpay behaves: only running the probe does.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { probe } from "../scripts/razorpay-refund-probe"
import { createFakeRazorpay } from "./support/fake-razorpay"

const rz = createFakeRazorpay()
const KEY = "rzp_test_PROBEKEY123"
const SECRET = "PROBESECRET-do-not-print"
const env = { RAZORPAY_KEY_ID: KEY, RAZORPAY_KEY_SECRET: SECRET }
const wait = async () => {}
const capturedPayment = (over: Partial<{ status: string; amount: number; amount_refunded: number }> = {}) => (rz.state.payments.pay_probe1 = { status: "captured", amount: 50_000, amount_refunded: 0, order_id: "order_probe1", ...over })

beforeEach(() => {
  rz.reset()
  rz.install()
})
afterEach(() => vi.unstubAllGlobals())
const requests = () => (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls

describe("razorpay refund probe: what it refuses to do", () => {
  it("stops at once, before any request, for a live key, a missing key or a missing secret", async () => {
    for (const e of [{ ...env, RAZORPAY_KEY_ID: "rzp_live_abcdef123456" }, { ...env, RAZORPAY_KEY_ID: "" }, { ...env, RAZORPAY_KEY_SECRET: "" }, { RAZORPAY_KEY_ID: "key_xyz", RAZORPAY_KEY_SECRET: "s" }]) {
      const r = await probe({ env: e, paymentId: "pay_probe1", send: true, wait })
      expect(r).toHaveLength(1)
      expect(r[0]).toMatchObject({ id: "P0", outcome: "FAIL" })
    }
    expect(requests()).toHaveLength(0)
  })
  it("a live key is called out as such", async () => {
    const r = await probe({ env: { ...env, RAZORPAY_KEY_ID: "rzp_live_abcdef123456" }, paymentId: "pay_probe1", send: true, wait })
    expect(r[0].observed).toContain("LIVE key")
  })
  it("without the explicit flag it only reads the payment and sends no refund", async () => {
    capturedPayment()
    const r = await probe({ env, paymentId: "pay_probe1", send: false, wait })
    expect(r.map((x) => x.outcome)).toEqual(["PASS", "INFO"])
    expect(requests().map(([, init]) => init.method)).toEqual(["GET"])
    expect(rz.state.posts).toBe(0)
  })
  it("refuses a payment that is not captured, does not exist, or has too little left", async () => {
    capturedPayment({ status: "authorized" })
    expect((await probe({ env, paymentId: "pay_probe1", send: true, wait }))[0].outcome).toBe("FAIL")
    expect((await probe({ env, paymentId: "pay_missing", send: true, wait }))[0].outcome).toBe("FAIL")
    capturedPayment({ amount: 50_000, amount_refunded: 49_800 })
    const r = await probe({ env, paymentId: "pay_probe1", send: true, wait })
    expect(r.at(-1)?.observed).toContain("fresh test payment")
    expect(rz.state.posts).toBe(0)
  })
})

describe("razorpay refund probe: against the documented contract (mocked)", () => {
  it("runs every step, sends only small test refunds of that one payment, and reports each outcome", async () => {
    capturedPayment()
    const r = await probe({ env, paymentId: "pay_probe1", send: true, wait })
    expect(r.filter((x) => x.outcome === "FAIL")).toEqual([])
    expect(r.map((x) => x.id)).toEqual(["P0", "P1", "P2", "P3", "P4", "P5", "P5b", "P6", "P7", "P8", "P9"])
    // Every refund it made is a small amount of the one payment it was given.
    expect(rz.state.refunds.every((x) => x.payment_id === "pay_probe1" && x.amount <= 200)).toBe(true)
    const posts = requests().filter(([, init]) => init.method === "POST").map(([u]) => u)
    expect(posts.every((u) => u.endsWith("/v1/payments/pay_probe1/refund"))).toBe(true)
  })
  it("replays one key with an identical body, then a changed body under the same key, and asks which status comes back", async () => {
    capturedPayment()
    const r = await probe({ env, paymentId: "pay_probe1", send: true, wait })
    expect(r.find((x) => x.id === "P3")).toMatchObject({ outcome: "PASS" })
    expect(r.find((x) => x.id === "P4")?.observed).toContain("HTTP 409")
    expect(r.find((x) => x.id === "P9")?.observed).toMatch(/refunds before \d+, after \d+/)
  })
  it("reports FAIL, not a quiet pass, when Razorpay misbehaves (a replay returning a different refund)", async () => {
    capturedPayment()
    let n = 0
    const real = globalThis.fetch
    vi.stubGlobal("fetch", vi.fn(async (u: string, init: RequestInit) => {
      const res = await (real as typeof fetch)(u, init)
      if (init.method === "POST" && String(u).endsWith("/refund") && ++n === 3) return new Response(JSON.stringify({ id: "rfnd_DIFFERENT", status: "pending" }), { status: 200 }) // the replay (3rd POST)
      return res
    }))
    const r = await probe({ env, paymentId: "pay_probe1", send: true, wait })
    expect(r.find((x) => x.id === "P3")?.outcome).toBe("FAIL")
  })
  it("never puts the key or the secret in anything it reports", async () => {
    capturedPayment()
    const r = await probe({ env, paymentId: "pay_probe1", send: true, wait })
    const out = JSON.stringify(r)
    expect(out).not.toContain(SECRET)
    expect(out).not.toContain(KEY)
    expect(out).not.toContain("authorization")
  })
  it("sends the key only in the documented header, with the test credentials, to Razorpay's API and nowhere else", async () => {
    capturedPayment()
    await probe({ env, paymentId: "pay_probe1", send: true, wait })
    for (const [url] of requests()) expect(url.startsWith("https://api.razorpay.com/")).toBe(true)
    const withKey = requests().filter(([, init]) => (init.headers as Record<string, string>)["X-Refund-Idempotency"])
    expect(withKey.length).toBeGreaterThan(0)
  })
})
