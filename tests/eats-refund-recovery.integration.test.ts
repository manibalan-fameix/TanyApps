// Live test: TanyEats refund recovery and the record of money that needs a person. Real database, MOCKED Razorpay (a stateful fake that
// replays refunds by idempotency key). The recovery job and the webhook can run at the same moment; one logical refund must stay one.
// Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database (see docs/staging/neon-test-database.md).
import { createHmac, randomBytes } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeRazorpay } from "./support/fake-razorpay"
import { uniqueCode } from "./support/ids"
import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()
const SECRET = "whsec_eats_recovery"

describe.skipIf(!url)("TanyEats refund recovery (live database, mocked Razorpay)", () => {
  const rz = createFakeRazorpay()
  let POST: typeof import("../app/api/webhooks/razorpay/route").POST
  let pay: typeof import("../lib/restaurant/payments")
  let ex: typeof import("../lib/core/payment-exceptions")
  let attention: typeof import("../lib/core/jobs/retry-booking-refunds")
  let jobs: typeof import("../lib/core/jobs/retry-order-refunds")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  let dealerId: string
  const tag = randomBytes(3).toString("hex")
  let n = 0
  /** The job's clock. Tests run it in the future, so "a fresh claim" must be fresh relative to THIS clock, not to the real one. */
  const later = (minutes = 10) => new Date(Date.now() + minutes * 60_000)
  const longAgo = () => new Date(Date.now() - 60 * 60_000)

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc"
    process.env.RAZORPAY_KEY_SECRET = "secret"
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    ;({ POST } = await import("../app/api/webhooks/razorpay/route"))
    pay = await import("../lib/restaurant/payments")
    ex = await import("../lib/core/payment-exceptions")
    attention = await import("../lib/core/jobs/retry-booking-refunds")
    jobs = await import("../lib/core/jobs/retry-order-refunds")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
    const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
    dealerId = (await unscopedDb.insert(s.dealers).values({ slug: `er-${tag}`, displayName: "ER", industry: "restaurants", theme, razorpayAccountId: "acc_test", razorpayAccountStatus: "activated" }).returning({ id: s.dealers.id }))[0].id
  })
  afterAll(async () => {
    await pool.end()
  })
  beforeEach(() => {
    rz.reset()
    rz.install()
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  async function order(over: Record<string, unknown> = {}) {
    n++
    const [o] = await unscopedDb
      .insert(s.orders)
      .values({ dealerId, code: uniqueCode(), customerName: "Guest", customerPhone: "+919999999999", fulfilment: "pickup", lines: [], subtotal: 250, total: 250, paymentMethod: "online", status: "cancelled", razorpayOrderId: `order_${tag}${n}`, razorpayPaymentId: `pay_${tag}${n}`, ...over })
      .returning()
    return o
  }
  /** A cancelled order whose refund claim a crashed worker left behind. */
  const crashed = (over: Record<string, unknown> = {}) => order({ paymentStatus: "refunding", updatedAt: longAgo(), ...over })
  /** A late payment for a cancelled order whose refund failed and was released back to pending. */
  const released = (over: Record<string, unknown> = {}) => order({ paymentStatus: "pending", updatedAt: longAgo(), ...over })
  const row = async (id: string) => (await unscopedDb.select().from(s.orders).where(eq(s.orders.id, id)))[0]
  const open = async (kind: string, ref: string) => (await unscopedDb.select().from(s.paymentExceptions).where(and(eq(s.paymentExceptions.kind, kind), eq(s.paymentExceptions.ref, ref))))[0]
  const run = (over: { limit?: number; minutes?: number } = {}) => pay.reconcileOrderRefunds(later(over.minutes), over.limit ?? 50, { dealerId })
  const send = (event: "order.paid" | "payment.captured", o: { rzp: string; pay: string }, kind: string | null = "eats_order") => {
    const payment = { entity: { id: o.pay, order_id: o.rzp, notes: [] } }
    const body = JSON.stringify(event === "order.paid" ? { event, payload: { payment, order: { entity: { id: o.rzp, notes: kind ? { kind } : [] } } } } : { event, payload: { payment } })
    return POST(new Request("https://app.tany.in/api/webhooks/razorpay", { method: "POST", body, headers: { "x-razorpay-signature": createHmac("sha256", SECRET).update(body).digest("hex") } }))
  }
  const ids = (o: Awaited<ReturnType<typeof order>>) => ({ rzp: o.razorpayOrderId as string, pay: o.razorpayPaymentId as string })

  // ---------- the job finishes what the webhook path left behind ----------

  it("completes a refund claim a crashed worker left behind, with the original refund key, and then follows it to processed", async () => {
    const o = await crashed()
    expect(await run()).toMatchObject({ retried: 1, completed: 1 })
    let r = await row(o.id)
    expect([r.paymentStatus, r.refundStatus, r.refundId]).toEqual(["refunded", "pending", "rfnd_1"]) // initiated, not finished
    expect(rz.state.keys).toEqual([`tany_rf_${o.razorpayPaymentId}_25000`]) // the stable key for this payment and amount
    expect(await run()).toMatchObject({ retried: 0 }) // nothing to do until Razorpay says more
    rz.state.refunds[0].status = "processed"
    expect(await run({ minutes: 30 })).toMatchObject({ processed: 1 }) // a while later, when Razorpay has finished
    r = await row(o.id)
    expect([r.refundStatus, r.paymentStatus]).toEqual(["processed", "refunded"])
    expect(rz.state.refunds).toHaveLength(1)
  })

  it("completes a late payment's refund that failed and was released", async () => {
    const o = await released()
    expect(await run()).toMatchObject({ retried: 1, completed: 1 })
    expect((await row(o.id)).paymentStatus).toBe("refunded")
    expect(rz.state.refunds).toHaveLength(1)
  })

  it("leaves orders alone that are not its business: unpaid, cash, still-fresh claims, other stock and order states", async () => {
    const fresh = await order({ paymentStatus: "refunding", updatedAt: later() }) // another worker took it a moment ago, by the job's clock
    const cash = await order({ paymentMethod: "cod", paymentStatus: "refunding", updatedAt: longAgo(), razorpayPaymentId: null })
    const live = await order({ status: "new", paymentStatus: "paid" })
    expect(await run()).toMatchObject({ retried: 0, completed: 0 })
    expect(rz.state.posts).toBe(0)
    for (const o of [fresh, cash, live]) expect((await row(o.id)).refundId).toBeNull()
  })

  // ---------- the job and the webhook at the same moment ----------

  it("the job and duplicate webhooks racing for the same order make one refund", async () => {
    const o = await released()
    rz.state.delayMs = 15
    const results = await Promise.all([send("order.paid", ids(o)), send("payment.captured", ids(o)), run(), send("order.paid", ids(o)), run(), run()])
    expect((results as unknown[]).filter((r): r is Response => r instanceof Response).map((r) => r.status)).toEqual([200, 200, 200])
    expect(rz.state.refunds).toHaveLength(1)
    expect([...new Set(rz.state.keys)]).toHaveLength(1) // every attempt used the same logical refund key
    expect((await row(o.id)).paymentStatus).toBe("refunded")
  })

  // ---------- outcomes ----------

  it("an ambiguous answer (the refund was made, the reply lost) is adopted, not repeated", async () => {
    const o = await crashed()
    rz.state.mode = "lost"
    expect(await run()).toMatchObject({ completed: 1 })
    expect(rz.state.refunds).toHaveLength(1)
    expect((await row(o.id)).refundId).toBe("rfnd_1")
  })

  it("a temporary failure is counted and retried; it does not end the story", async () => {
    const o = await released()
    rz.state.mode = "down"
    expect(await run()).toMatchObject({ retried: 1, completed: 0 })
    let r = await row(o.id)
    expect([r.paymentStatus, r.refundStatus, r.refundAttempts]).toEqual(["pending", null, 1]) // released again, not marked failed
    expect(r.refundError).toMatch(/Retrying is safe/)
    rz.state.mode = "ok"
    await unscopedDb.update(s.orders).set({ updatedAt: longAgo() }).where(eq(s.orders.id, o.id))
    expect(await run()).toMatchObject({ completed: 1 })
    r = await row(o.id)
    expect([r.paymentStatus, r.refundError]).toEqual(["refunded", null])
    expect(rz.state.refunds).toHaveLength(1)
  })

  it("a definite refusal stops automatic retries at once and is put in front of a person", async () => {
    const o = await released()
    rz.state.mode = "reject"
    expect(await run()).toMatchObject({ retried: 1, completed: 0 })
    const r = await row(o.id)
    expect([r.refundStatus, r.refundAttempts]).toEqual(["failed", 1])
    expect((await open("refund_failed", o.id))?.status).toBe("open")
    const posts = rz.state.posts
    await unscopedDb.update(s.orders).set({ updatedAt: longAgo() }).where(eq(s.orders.id, o.id))
    expect(await run()).toMatchObject({ retried: 0 })
    expect(rz.state.posts).toBe(posts) // no further attempt, however often the job runs
  })

  it("stops after the attempt limit and leaves the order for a person", async () => {
    const o = await released({ refundAttempts: pay.MAX_AUTOMATIC_REFUND_ATTEMPTS, refundError: "gateway down" })
    expect(await run()).toMatchObject({ retried: 0, leftForPerson: 1 })
    expect(rz.state.posts).toBe(0)
    expect((await open("refund_failed", o.id))?.detail).toContain("gateway down")
  })

  it("when Razorpay later reports an accepted refund as failed, it is recorded and not retried blindly", async () => {
    const o = await order({ paymentStatus: "refunded", refundStatus: "pending", refundId: "rfnd_x", updatedAt: longAgo() })
    rz.state.refunds.push({ id: "rfnd_x", payment_id: o.razorpayPaymentId as string, amount: 25000, status: "failed", notes: {} })
    expect(await run()).toMatchObject({ failed: 1 })
    const r = await row(o.id)
    expect([r.refundStatus, r.paymentStatus]).toEqual(["failed", "refunded"])
    expect((await open("refund_failed", o.id))?.status).toBe("open")
    expect(rz.state.posts).toBe(0)
  })

  it("is bounded per run and oldest first, so nothing starves", async () => {
    const a = await released({ updatedAt: new Date(Date.now() - 90 * 60_000) })
    const b = await released({ updatedAt: new Date(Date.now() - 80 * 60_000) })
    const c = await released({ updatedAt: new Date(Date.now() - 70 * 60_000) })
    expect(await run({ limit: 2 })).toMatchObject({ retried: 2 })
    expect([(await row(a.id)).paymentStatus, (await row(b.id)).paymentStatus, (await row(c.id)).paymentStatus]).toEqual(["refunded", "refunded", "pending"])
    expect(await run({ limit: 2 })).toMatchObject({ retried: 1 })
    expect((await row(c.id)).paymentStatus).toBe("refunded")
  })

  it("does not touch stock or the order's own state", async () => {
    const o = await crashed({ stockReleased: true })
    await run()
    const r = await row(o.id)
    expect([r.status, r.stockReleased]).toEqual(["cancelled", true])
  })

  it("the registered job runs the same work and reports it in one line", async () => {
    await crashed()
    const line = await jobs.retryOrderRefundsJob.run()
    expect(line).toMatch(/\d+ refund\(s\) retried \(\d+ completed\), \d+ processed, \d+ failed, \d+ still pending, \d+ left for a person/)
  })

  // ---------- the record of money that needs a person ----------

  it("keeps one entry per problem, counts how often it recurs, reopens it if it returns, and lets a person close it", async () => {
    const ref = `pay_ex_${tag}`
    await ex.recordException({ kind: "unmatched_payment", ref, detail: "first sighting" })
    await ex.recordException({ kind: "unmatched_payment", ref, detail: "again" })
    let e = await open("unmatched_payment", ref)
    expect([e.occurrences, e.status, e.detail]).toEqual([2, "open", "again"])
    expect(await ex.resolveException(e.id, "ops@tany.in", "Refunded in the dashboard")).toBe(true)
    expect(await ex.resolveException(e.id, "ops@tany.in", "twice")).toBe(false)
    e = await open("unmatched_payment", ref)
    expect([e.status, e.resolvedBy, e.resolution]).toEqual(["resolved", "ops@tany.in", "Refunded in the dashboard"])
    await ex.recordException({ kind: "unmatched_payment", ref, detail: "it came back" })
    e = await open("unmatched_payment", ref)
    expect([e.status, e.occurrences, e.resolvedBy]).toEqual(["open", 3, null])
  })

  it("the monitoring job opens an entry for each Eats problem and closes it when it clears", async () => {
    const stuck = await crashed({ updatedAt: longAgo() })
    const unrefunded = await order({ status: "cancelled", paymentStatus: "paid" })
    const failed = await order({ paymentStatus: "pending", refundStatus: "failed" })
    const items = await attention.paymentAttentionItems()
    const mine = items.filter((i) => [stuck.id, unrefunded.id, failed.id].includes(i.ref))
    expect(mine.map((i) => i.kind).sort()).toEqual(["eats_cancelled_unrefunded", "eats_refund_failed", "eats_refund_stuck"])
    await attention.syncPaymentExceptions(items)
    for (const o of [stuck, unrefunded, failed]) expect((await open(o.id === failed.id ? "refund_failed" : "refund_stuck", o.id)).status).toBe("open")
    // The stuck one is fixed by the recovery job; the next sync closes its entry.
    await run()
    await attention.syncPaymentExceptions(await attention.paymentAttentionItems())
    expect((await open("refund_stuck", stuck.id)).status).toBe("resolved")
    expect((await open("refund_failed", failed.id)).status).toBe("open") // still needs a person
  })

  // ---------- the webhook records what it cannot place ----------

  it("a captured payment that belongs to no order is recorded for a person, once per payment, and acknowledged", async () => {
    const ghost = { rzp: `order_ghost_${tag}`, pay: `pay_ghost_${tag}` }
    expect((await send("order.paid", ghost)).status).toBe(200)
    expect((await send("payment.captured", ghost)).status).toBe(200)
    const e = await open("unmatched_payment", ghost.pay)
    expect([e.status, e.occurrences]).toEqual(["open", 2])
    expect(e.detail).toContain(ghost.rzp)
  })

  it("a webhook that fails is recorded, and the entry closes itself when Razorpay's retry succeeds", async () => {
    const o = await order({ status: "new", paymentStatus: "paid" })
    const second = { rzp: o.razorpayOrderId as string, pay: `pay_second_${tag}` }
    rz.state.mode = "down" // refunding the double charge cannot be done yet
    expect((await send("order.paid", second)).status).toBe(500)
    expect((await open("webhook_failed", second.pay)).status).toBe("open")
    expect((await open("duplicate_payment", second.pay)).status).toBe("open")
    rz.state.mode = "ok"
    expect((await send("order.paid", second)).status).toBe(200)
    expect((await open("webhook_failed", second.pay)).status).toBe("resolved")
    expect((await open("duplicate_payment", second.pay)).status).toBe("resolved") // refunded; kept for the record
    expect(rz.state.refunds).toHaveLength(1)
  })

  it("nothing a guest typed or paid with reaches the record", async () => {
    const o = await crashed()
    rz.state.mode = "reject"
    await run()
    const e = await open("refund_failed", o.id)
    expect(e.detail + (await row(o.id)).refundError).not.toMatch(/Guest|\+91|pay_|postgres:/)
  })
})
