// A MOCKED Razorpay for tests (not the real test-mode API). It behaves like the real one where the money code depends on it: a refund
// request carrying an X-Refund-Idempotency key it has already seen returns the refund it made then, a payment's refunds can be
// listed, and a refund's status can change. Every call to api.razorpay.com is answered here; nothing ever leaves the machine.
import { vi } from "vitest"

export type FakeRefund = { id: string; payment_id: string; amount: number; status: "pending" | "processed" | "failed"; notes: Record<string, string> }
export type FakeMode = "ok" | "down" | "lost" | "reject"

export function createFakeRazorpay() {
  const state = {
    refunds: [] as FakeRefund[],
    byKey: new Map<string, FakeRefund>(),
    posts: 0,
    keys: [] as string[],
    /** ok: create normally. down: 500. lost: create, then drop the answer. reject: a definite 400 refusal. */
    mode: "ok" as FakeMode,
    createStatus: "pending" as FakeRefund["status"],
    delayMs: 0,
    /** What Razorpay says was paid on each order: orderId -> payments. */
    orderPayments: {} as Record<string, { id: string; status: string }[]>,
    /** When true, asking about an order fails with a 500. */
    ordersDown: false,
    /** How many times Razorpay was asked about an order's payments. */
    orderLookups: 0,
    /** Payments Razorpay knows: id -> state (for the documented amount limit, and for GET /payments/:id). */
    payments: {} as Record<string, { status: string; amount: number; amount_refunded: number; order_id: string }>,
  }
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
  async function handle(url: string, init: RequestInit): Promise<Response> {
    const path = new URL(url).pathname
    const method = String(init.method ?? "GET")
    if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs))
    const payMatch = path.match(/^\/v1\/payments\/([^/]+)$/)
    if (payMatch && method === "GET") return state.payments[payMatch[1]] ? json(200, { id: payMatch[1], ...state.payments[payMatch[1]] }) : json(400, { error: { description: "not a valid id" } })
    const refundMatch = path.match(/^\/v1\/payments\/([^/]+)\/refund$/)
    if (method === "POST" && refundMatch) {
      state.posts++
      if (state.mode === "down") return json(500, { error: { description: "gateway down" } })
      if (state.mode === "reject") return json(400, { error: { description: "insufficient balance in the linked account" } })
      const key = (init.headers as Record<string, string>)["X-Refund-Idempotency"]
      state.keys.push(key)
      const body = JSON.parse(String(init.body))
      // As documented: a key under 10 characters or with other characters is a 400; a used key with a different body is a 409.
      if (key !== undefined && (key.length < 10 || !/^[A-Za-z0-9_-]+$/.test(key))) return json(400, { error: { description: "The idempotency key must be at least 10 characters long." } })
      const known = state.payments[refundMatch[1]]
      if (known && body.amount > known.amount - known.amount_refunded) return json(400, { error: { description: "The refund amount provided is greater than amount captured." } })
      const earlier = key ? state.byKey.get(key) : undefined
      if (earlier && (earlier.amount !== body.amount || JSON.stringify(earlier.notes) !== JSON.stringify(body.notes))) return json(409, { error: { code: "BAD_REQUEST_ERROR", description: "Different request with the same idempotency key has already been processed." } })
      let refund = state.byKey.get(key)
      if (!refund) {
        if (known) known.amount_refunded += body.amount
        refund = { id: `rfnd_${state.refunds.length + 1}`, payment_id: refundMatch[1], amount: body.amount, status: state.createStatus, notes: body.notes }
        state.refunds.push(refund)
        state.byKey.set(key, refund)
      }
      if (state.mode === "lost") throw new TypeError("fetch failed")
      return json(200, refund)
    }
    const listMatch = path.match(/^\/v1\/payments\/([^/]+)\/refunds$/)
    if (listMatch) return json(200, { items: state.refunds.filter((r) => r.payment_id === listMatch[1]) })
    const ordPay = path.match(/^\/v1\/orders\/([^/]+)\/payments$/)
    if (ordPay) state.orderLookups++
    if (ordPay) return state.ordersDown ? json(500, { error: { description: "gateway down" } }) : json(200, { items: state.orderPayments[ordPay[1]] ?? [] })
    const oneMatch = path.match(/^\/v1\/refunds\/([^/]+)$/)
    if (oneMatch) {
      const r = state.refunds.find((x) => x.id === oneMatch[1])
      return r ? json(200, r) : json(400, { error: { description: "not found" } })
    }
    return json(404, { error: { description: `unexpected ${method} ${path}` } })
  }
  const realFetch = globalThis.fetch
  return {
    state,
    reset() {
      Object.assign(state, { refunds: [], byKey: new Map(), posts: 0, keys: [], mode: "ok", createStatus: "pending", delayMs: 0, orderPayments: {}, ordersDown: false, orderLookups: 0, payments: {} })
    },
    install() {
      vi.stubGlobal("fetch", vi.fn((u: string, init: RequestInit) => (String(u).startsWith("https://api.razorpay.com") ? handle(u, init) : realFetch(u, init))))
    },
  }
}
