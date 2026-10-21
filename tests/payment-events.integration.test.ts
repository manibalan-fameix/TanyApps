// Live test: both Razorpay events (order.paid and payment.captured) for one payment, through the real webhook route and a
// real database. Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database.
import { createHmac, randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const url = process.env.TEST_DATABASE_URL

const refundPayment = vi.fn()
vi.mock("../lib/route/razorpay", async (importActual) => ({
  ...(await importActual<typeof import("../lib/route/razorpay")>()),
  refundPayment: (...a: unknown[]) => refundPayment(...a),
}))

const SECRET = "whsec_live_test"

describe.skipIf(!url)("Razorpay order.paid + payment.captured (live database)", () => {
  let POST: typeof import("../app/api/webhooks/razorpay/route").POST
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  let dealerId: string
  const tag = randomBytes(3).toString("hex")
  let n = 0

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc"
    process.env.RAZORPAY_KEY_SECRET = "secret"
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    ;({ POST } = await import("../app/api/webhooks/razorpay/route"))
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
    const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
    const [d] = await unscopedDb.insert(s.dealers).values({ slug: `pe-${tag}`, displayName: "PE", industry: "restaurants", theme, razorpayAccountId: "acc_test", razorpayAccountStatus: "activated" }).returning()
    dealerId = d.id
  })
  afterAll(async () => {
    await pool.end()
  })
  beforeEach(() => refundPayment.mockReset().mockResolvedValue({ refundId: "rfnd_1" }))

  async function order(status: "pending_payment" | "cancelled") {
    n++
    const rzp = `order_${tag}${n}`
    const [o] = await unscopedDb
      .insert(s.orders)
      .values({ dealerId, code: randomBytes(4).toString("hex").toUpperCase().slice(0, 6), customerName: "T", customerPhone: "+919999999999", fulfilment: "pickup", lines: [], subtotal: 250, total: 250, paymentMethod: "online", status, razorpayOrderId: rzp })
      .returning()
    return { id: o.id, rzp, pay: `pay_${tag}${n}` }
  }

  const send = (event: "order.paid" | "payment.captured", o: { rzp: string; pay: string }, kind: string | null = "eats_order") => {
    const payment = { entity: { id: o.pay, order_id: o.rzp, notes: [] } }
    const body = JSON.stringify(
      event === "order.paid"
        ? { event, payload: { payment, order: { entity: { id: o.rzp, notes: kind ? { kind } : [] } } } }
        : { event, payload: { payment } },
    )
    const signature = createHmac("sha256", SECRET).update(body).digest("hex")
    return POST(new Request("https://app.tany.in/api/webhooks/razorpay", { method: "POST", body, headers: { "x-razorpay-signature": signature } }))
  }
  const row = async (id: string) => (await unscopedDb.select().from(s.orders).where(eq(s.orders.id, id)))[0]

  it("applies a payment once whichever event comes first, and once more of either changes nothing", async () => {
    for (const sequence of [["order.paid", "payment.captured"], ["payment.captured", "order.paid"], ["order.paid", "order.paid", "payment.captured", "payment.captured"]] as const) {
      const o = await order("pending_payment")
      let firstPaidAt: Date | null = null
      for (const event of sequence) {
        expect((await send(event, o)).status).toBe(200)
        const r = await row(o.id)
        expect(r.status).toBe("new")
        expect(r.paymentStatus).toBe("paid")
        expect(r.razorpayPaymentId).toBe(o.pay)
        firstPaidAt ??= r.paidAt
        expect(r.paidAt?.getTime()).toBe(firstPaidAt?.getTime()) // not applied a second time
      }
    }
    expect(refundPayment).not.toHaveBeenCalled()
  })

  it("applies a payment once when both events arrive at the same instant", async () => {
    const o = await order("pending_payment")
    const results = await Promise.all([send("order.paid", o), send("payment.captured", o), send("order.paid", o), send("payment.captured", o)])
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200])
    const r = await row(o.id)
    expect([r.status, r.paymentStatus]).toEqual(["new", "paid"])
    expect(refundPayment).not.toHaveBeenCalled()
  })

  it("refunds a payment for an already-cancelled order exactly once, in either event order", async () => {
    for (const sequence of [["order.paid", "payment.captured"], ["payment.captured", "order.paid"]] as const) {
      refundPayment.mockClear()
      const o = await order("cancelled")
      for (const event of sequence) expect((await send(event, o)).status).toBe(200)
      expect(refundPayment).toHaveBeenCalledTimes(1)
      expect(refundPayment).toHaveBeenCalledWith(o.pay, 250, true)
      const r = await row(o.id)
      expect(r.paymentStatus).toBe("refunded")
      expect(r.status).toBe("cancelled") // never revived
    }
  })

  it("refunds exactly once when both events race each other", async () => {
    const o = await order("cancelled")
    // The refund call takes a moment, as the real one does, so the two events genuinely overlap.
    refundPayment.mockImplementation(async () => (await new Promise((r) => setTimeout(r, 60)), { refundId: "rfnd_1" }))
    const results = await Promise.all([send("order.paid", o), send("payment.captured", o), send("payment.captured", o), send("order.paid", o)])
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200])
    expect(refundPayment).toHaveBeenCalledTimes(1)
    expect((await row(o.id)).paymentStatus).toBe("refunded")
  })

  it("lets Razorpay's retry refund after a failed refund, and still only completes one refund", async () => {
    const o = await order("cancelled")
    refundPayment.mockRejectedValueOnce(new Error("linked account balance too low")).mockResolvedValue({ refundId: "rfnd_ok" })
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect((await send("order.paid", o)).status).toBe(500) // not acknowledged: Razorpay will retry
    expect((await row(o.id)).paymentStatus).toBe("pending") // claim released
    expect((await send("order.paid", o)).status).toBe(200) // the retry
    expect((await row(o.id)).paymentStatus).toBe("refunded")
    expect((await send("payment.captured", o)).status).toBe(200) // the other event afterwards: nothing more to do
    expect(refundPayment).toHaveBeenCalledTimes(2) // one failed attempt, one that worked
  })

  it("ignores an order.paid carrying a kind this app does not know", async () => {
    const o = await order("pending_payment")
    expect((await send("order.paid", o, "cab_trip")).status).toBe(200)
    expect((await row(o.id)).status).toBe("pending_payment") // untouched
  })

  it("still handles an old order whose order.paid has no kind", async () => {
    const o = await order("pending_payment")
    expect((await send("order.paid", o, null)).status).toBe(200)
    expect((await row(o.id)).paymentStatus).toBe("paid")
  })
})
