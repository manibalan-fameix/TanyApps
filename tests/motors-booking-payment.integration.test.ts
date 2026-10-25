// Live test: TanyMotos booking payments against a real database and the real refund wrapper. Razorpay is a stateful fake
// that behaves like the real one where it matters here: an X-Refund-Idempotency key replays the refund it already made.
// Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database (a local Postgres, or a Neon branch).
import { createHmac, randomBytes } from "node:crypto"
import { and, eq, inArray, sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { uniqueCode } from "./support/ids"
import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()
const WEBHOOK_SECRET = "whsec_motors_test"
const KEY_SECRET = "secret"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
const dealerCtx = vi.hoisted(() => ({ current: null as null | { id: string } }))
vi.mock("@/lib/auth/context", () => ({
  getDealerContext: async () => ({ status: "ok", dealerInDb: true, role: "owner", user: { id: "u1" }, dealer: dealerCtx.current }),
}))
vi.mock("@/lib/core/rate-limit", () => ({ rateLimit: async () => true }))

type FakeRefund = { id: string; payment_id: string; amount: number; status: "pending" | "processed" | "failed"; notes: Record<string, string> }
const fake = {
  refunds: [] as FakeRefund[],
  byKey: new Map<string, FakeRefund>(),
  posts: 0,
  /** What the next POSTs do: create normally, be down, or create the refund and then lose the answer. */
  mode: "ok" as "ok" | "down" | "lost",
  createStatus: "pending" as FakeRefund["status"],
  delayMs: 0,
}
const reset = () => Object.assign(fake, { refunds: [], byKey: new Map(), posts: 0, mode: "ok", createStatus: "pending", delayMs: 0 })

const jsonRes = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

async function razorpay(url: string, init: RequestInit): Promise<Response> {
  const path = new URL(url).pathname
  const method = String(init.method ?? "GET")
  if (fake.delayMs) await new Promise((r) => setTimeout(r, fake.delayMs))
  const refundMatch = path.match(/^\/v1\/payments\/([^/]+)\/refund$/)
  if (method === "POST" && refundMatch) {
    fake.posts++
    if (fake.mode === "down") return jsonRes(500, { error: { description: "gateway down" } })
    const key = (init.headers as Record<string, string>)["X-Refund-Idempotency"]
    const body = JSON.parse(String(init.body))
    let refund = fake.byKey.get(key)
    if (!refund) {
      refund = { id: `rfnd_${fake.refunds.length + 1}`, payment_id: refundMatch[1], amount: body.amount, status: fake.createStatus, notes: body.notes }
      fake.refunds.push(refund)
      fake.byKey.set(key, refund)
    }
    if (fake.mode === "lost") throw new TypeError("fetch failed")
    return jsonRes(200, refund)
  }
  const listMatch = path.match(/^\/v1\/payments\/([^/]+)\/refunds$/)
  if (listMatch) return jsonRes(200, { items: fake.refunds.filter((r) => r.payment_id === listMatch[1]) })
  const oneMatch = path.match(/^\/v1\/refunds\/([^/]+)$/)
  if (oneMatch) {
    const r = fake.refunds.find((x) => x.id === oneMatch[1])
    return r ? jsonRes(200, r) : jsonRes(400, { error: { description: "not found" } })
  }
  return jsonRes(404, { error: { description: `unexpected ${method} ${path}` } })
}

describe.skipIf(!url)("TanyMotos booking payments (live database)", () => {
  let POST: typeof import("../app/api/webhooks/razorpay/route").POST
  let confirmBooking: typeof import("../app/(tenant)/sites/[dealer]/[carSlug]/actions").confirmBooking
  let refundBooking: typeof import("../app/(admin)/(shell)/cars/[id]/actions").refundBooking
  let svc: typeof import("../lib/bookings/service")
  let scoped: typeof import("../lib/db/scoped")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  let dealerId: string
  const tag = randomBytes(3).toString("hex")
  let n = 0
  const realFetch = globalThis.fetch
  /** Bookings this test created, so its cleanup touches nothing else. */
  const made: string[] = []

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc"
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    ;({ POST } = await import("../app/api/webhooks/razorpay/route"))
    ;({ confirmBooking } = await import("../app/(tenant)/sites/[dealer]/[carSlug]/actions"))
    ;({ refundBooking } = await import("../app/(admin)/(shell)/cars/[id]/actions"))
    svc = await import("../lib/bookings/service")
    scoped = await import("../lib/db/scoped")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
    const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
    const [d] = await unscopedDb.insert(s.dealers).values({ slug: `mb-${tag}`, displayName: "MB", industry: "motors", theme, razorpayAccountId: "acc_test", razorpayAccountStatus: "activated" }).returning()
    dealerId = d.id
    dealerCtx.current = { id: d.id }
  })
  afterAll(async () => {
    // Only what this run created, by the dealer id it owns. Nothing else in the database is touched.
    try {
      await unscopedDb.delete(s.bookings).where(eq(s.bookings.dealerId, dealerId))
      await unscopedDb.delete(s.leads).where(eq(s.leads.dealerId, dealerId))
      await unscopedDb.delete(s.cars).where(eq(s.cars.dealerId, dealerId))
      // The audit log is append-only, so a dealer that has audit entries stays (it is this run's own fixture, and harmless).
      await unscopedDb.delete(s.dealers).where(eq(s.dealers.id, dealerId)).catch((e) => {
        if ((e as { cause?: { code?: string } })?.cause?.code !== "23503") throw e
      })
    } finally {
      await pool.end()
    }
  })
  beforeEach(() => {
    reset()
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn((u: string, init: RequestInit) => (String(u).startsWith("https://api.razorpay.com") ? razorpay(u, init) : realFetch(u, init))))
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    // The refund job sweeps a whole dealer, so a test's unfinished refunds must not reach the next test. Only its own rows.
    if (made.length) await unscopedDb.update(s.bookings).set({ status: "refunded", refundStatus: "processed" }).where(and(inArray(s.bookings.id, made), eq(s.bookings.status, "refund_pending")))
    made.length = 0
  })

  async function car(status: "live" | "on_hold" | "sold" = "live") {
    n++
    const [c] = await unscopedDb.insert(s.cars).values({ dealerId, year: 2018, status, shortCode: uniqueCode(), slug: `mb-${tag}-${n}` }).returning()
    return c.id
  }
  async function booking(carId: string, status: "created" | "paid" = "created", buyerName?: string) {
    n++
    const rzp = `order_${tag}${n}`
    const [b] = await unscopedDb
      .insert(s.bookings)
      .values({ dealerId, carId, buyerName: buyerName ?? `Buyer ${n}`, buyerPhone: "enc", amount: 5000, razorpayOrderId: rzp, status })
      .returning()
    made.push(b.id)
    return { id: b.id, rzp, pay: `pay_${tag}${n}`, carId }
  }
  type B = Awaited<ReturnType<typeof booking>>

  const send = (event: "order.paid" | "payment.captured", b: { rzp: string; pay: string }) => {
    const payment = { entity: { id: b.pay, order_id: b.rzp, notes: [] } }
    const body = JSON.stringify(event === "order.paid" ? { event, payload: { payment, order: { entity: { id: b.rzp, notes: { kind: "motors_booking" } } } } } : { event, payload: { payment } })
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex")
    return POST(new Request("https://app.tany.in/api/webhooks/razorpay", { method: "POST", body, headers: { "x-razorpay-signature": signature } }))
  }
  const confirm = (b: B) =>
    confirmBooking({ orderId: b.rzp, paymentId: b.pay, signature: createHmac("sha256", KEY_SECRET).update(`${b.rzp}|${b.pay}`).digest("hex"), carSlug: "x" })
  const row = async (id: string) => (await unscopedDb.select().from(s.bookings).where(eq(s.bookings.id, id)))[0]
  const carStatus = async (id: string) => (await unscopedDb.select().from(s.cars).where(eq(s.cars.id, id)))[0].status
  const leadCount = async (carId: string) => (await unscopedDb.select().from(s.leads).where(eq(s.leads.carId, carId))).length

  // ---------- M1 / M2: one payment, many events ----------

  it("applies one payment once and makes exactly one lead when the webhook and the client confirm all at once", async () => {
    const c = await car()
    const b = await booking(c)
    const results = await Promise.all([send("order.paid", b), send("payment.captured", b), send("order.paid", b), confirm(b), confirm(b), send("payment.captured", b)])
    expect(results.filter((r): r is Response => r instanceof Response).map((r) => r.status)).toEqual([200, 200, 200, 200])
    for (const r of results.filter((r): r is Awaited<ReturnType<typeof confirm>> => !(r instanceof Response))) expect(r.ok).toBe(true)
    const r = await row(b.id)
    expect([r.status, r.razorpayPaymentId]).toEqual(["paid", b.pay])
    expect(r.leadId).not.toBeNull()
    expect(await carStatus(c)).toBe("on_hold")
    expect(await leadCount(c)).toBe(1)
    expect(fake.posts).toBe(0)
  })

  it("answers success to the client when the webhook already applied the same payment", async () => {
    const c = await car()
    const b = await booking(c)
    expect((await send("order.paid", b)).status).toBe(200)
    expect(await confirm(b)).toEqual({ ok: true })
    expect(await leadCount(c)).toBe(1)
  })

  it("a second, different payment on a paid booking is refunded once and recorded; the booking is untouched", async () => {
    const c = await car()
    const b = await booking(c)
    await send("order.paid", b)
    const second = `pay_second_${tag}${n}`
    const res = await svc.applyBookingPayment(b.rzp, second)
    expect(res).toMatchObject({ applied: false, status: "other_payment", refund: "pending" })
    const r = await row(b.id)
    expect([r.status, r.razorpayPaymentId]).toEqual(["paid", b.pay]) // the first payment is still the one held
    expect(fake.refunds.map((x) => x.payment_id)).toEqual([second])
    // Delivered again, in either event type: still one refund, still one record.
    for (const ev of ["order.paid", "payment.captured"] as const) await send(ev, { rzp: b.rzp, pay: second })
    expect(fake.refunds).toHaveLength(1)
    const audited = await scoped.scopedDb(dealerId).auditLog.select(and(eq(s.auditLog.entityId, b.id), eq(s.auditLog.action, "payment.duplicate_refunded")))
    expect(audited).toHaveLength(1)
    expect(JSON.stringify(audited[0].diff)).toContain(second)
  })

  it("the same double charge delivered many times at once still makes one refund", async () => {
    const c = await car()
    const b = await booking(c)
    await send("order.paid", b)
    const second = { rzp: b.rzp, pay: `pay_burst_${tag}${n}` }
    fake.delayMs = 10
    const out = await Promise.all([send("order.paid", second), send("payment.captured", second), send("order.paid", second), send("payment.captured", second)])
    expect(out.map((r) => r.status)).toEqual([200, 200, 200, 200])
    expect(fake.refunds).toHaveLength(1)
  })

  it("a double charge whose refund cannot be made yet is retried by Razorpay, and completes once", async () => {
    const c = await car()
    const b = await booking(c)
    await send("order.paid", b)
    const second = { rzp: b.rzp, pay: `pay_retry_${tag}${n}` }
    fake.mode = "down"
    expect((await send("order.paid", second)).status).toBe(500)
    fake.mode = "ok"
    expect((await send("order.paid", second)).status).toBe(200)
    expect(fake.refunds).toHaveLength(1)
  })

  it("tells a buyer who was charged twice exactly that, not that the booking failed or that the car is gone", async () => {
    const c = await car()
    const b = await booking(c)
    await send("order.paid", b)
    const second = { ...b, pay: `pay_dbl_${tag}${n}` }
    expect(await confirm(second)).toEqual({ ok: false, duplicate: true, refund: "pending" })
  })

  // ---------- what needs a person is counted ----------

  it("counts refunds that need a person, by kind, and nothing else", async () => {
    const attention = await import("../lib/core/jobs/retry-booking-refunds")
    const before = await attention.paymentAttention()
    const failed = await booking(await car("sold")); await send("order.paid", failed); fake.refunds[0].status = "failed"
    await svc.reconcileBookingRefunds(new Date(Date.now() + 10 * 60_000), 50, { dealerId })
    const notStarted = await booking(await car("sold")); fake.mode = "down"; await send("order.paid", notStarted); fake.mode = "ok"
    await unscopedDb.update(s.bookings).set({ refundRequestedAt: new Date(Date.now() - 60 * 60_000) }).where(eq(s.bookings.id, notStarted.id))
    const slow = await booking(await car("sold")); await send("order.paid", slow)
    await unscopedDb.update(s.bookings).set({ refundRequestedAt: new Date(Date.now() - 30 * 86_400_000) }).where(eq(s.bookings.id, slow.id))
    const fine = await booking(await car("sold")); await send("order.paid", fine) // pending for a minute: normal
    expect(fine.id).toBeTruthy()
    const after = await attention.paymentAttention()
    expect(after.refund_failed - before.refund_failed).toBe(1)
    expect(after.refund_not_started - before.refund_not_started).toBe(1)
    expect(after.refund_slow - before.refund_slow).toBe(1)
    const result = await attention.retryBookingRefundsJob.run()
    expect(result).toContain("NEEDS A PERSON")
    expect(result).toMatch(/refund_failed=\d+/)
  })

  // ---------- M1: two competing buyers ----------

  it("lets only one of two buyers have the car, refunds the other once, and writes one lead", async () => {
    const c = await car()
    const a = await booking(c)
    const b = await booking(c)
    fake.delayMs = 15
    const events = [send("order.paid", a), send("order.paid", b), send("payment.captured", a), send("payment.captured", b), confirm(a), confirm(b), send("order.paid", a), send("order.paid", b)]
    const out = await Promise.all(events)
    expect(out.filter((r): r is Response => r instanceof Response).every((r) => r.status === 200)).toBe(true)
    const rows = [await row(a.id), await row(b.id)]
    const winners = rows.filter((r) => r.status === "paid")
    const losers = rows.filter((r) => r.status === "refund_pending")
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1) // pending refund (Razorpay has not said processed yet)
    expect(losers[0].refundReason).toBe("car_unavailable")
    expect([losers[0].refundStatus, losers[0].refundId]).toEqual(["pending", fake.refunds[0].id])
    expect(fake.refunds).toHaveLength(1)
    expect(fake.refunds[0].payment_id).toBe(losers[0].razorpayPaymentId)
    expect(await carStatus(c)).toBe("on_hold")
    expect(await leadCount(c)).toBe(1)
    const loserConfirm = await confirm(losers[0].id === a.id ? a : b)
    expect(loserConfirm).toMatchObject({ ok: false, lost: true, refund: "pending" }) // never "processed" while Razorpay says pending
    expect(await confirm(winners[0].id === a.id ? a : b)).toEqual({ ok: true })
  })

  it("marks the losing booking refunded only when Razorpay reports the refund processed", async () => {
    const c = await car()
    const a = await booking(c)
    const b = await booking(c)
    await send("order.paid", a)
    fake.createStatus = "processed"
    expect((await send("order.paid", b)).status).toBe(200)
    const r = await row(b.id)
    expect([r.status, r.refundStatus]).toEqual(["refunded", "processed"])
    expect(r.refundedAt).not.toBeNull()
  })

  it("refunds a payment that arrives for a car that is no longer live", async () => {
    const c = await car("sold")
    const b = await booking(c)
    expect((await send("order.paid", b)).status).toBe(200)
    expect((await row(b.id)).status).toBe("refund_pending")
    expect(await leadCount(c)).toBe(0)
    expect(await carStatus(c)).toBe("sold")
    expect(fake.refunds).toHaveLength(1)
  })

  it("the database refuses a second paid booking for one car, whatever the code does", async () => {
    const c = await car()
    await booking(c, "paid")
    await expect(booking(c, "paid")).rejects.toThrow()
    const rows = await unscopedDb.select().from(s.bookings).where(and(eq(s.bookings.carId, c), eq(s.bookings.status, "paid")))
    expect(rows).toHaveLength(1)
    await booking(c, "created") // unpaid attempts are unaffected
  })

  // ---------- refund failures and crash recovery ----------

  it("keeps the refund owed when Razorpay is down, tells the webhook to retry, then finishes it once on the retry", async () => {
    const c = await car("sold")
    const b = await booking(c)
    fake.mode = "down"
    expect((await send("order.paid", b)).status).toBe(500) // Razorpay will retry
    let r = await row(b.id)
    expect([r.status, r.refundStatus, r.refundReason]).toEqual(["refund_pending", null, "car_unavailable"])
    expect(r.refundError).toMatch(/Retrying is safe/)
    expect(await confirm(b)).toMatchObject({ ok: false, lost: true, refund: "owed" })
    fake.mode = "ok"
    expect((await send("order.paid", b)).status).toBe(200)
    r = await row(b.id)
    expect([r.status, r.refundStatus, r.refundError]).toEqual(["refund_pending", "pending", null])
    expect(fake.refunds).toHaveLength(1)
  })

  it("crash after Razorpay created the refund but before we heard: recovery adopts it, no second refund", async () => {
    const c = await car("sold")
    const b = await booking(c)
    fake.mode = "lost" // refund created, answer lost; the wrapper reconciles from the payment's refunds
    expect((await send("order.paid", b)).status).toBe(200)
    expect(fake.refunds).toHaveLength(1)
    const r = await row(b.id)
    expect([r.status, r.refundStatus, r.refundId]).toEqual(["refund_pending", "pending", fake.refunds[0].id])
  })

  it("crash after the refund was made but before it was recorded: a later retry replays the same key", async () => {
    const c = await car("sold")
    const b = await booking(c)
    fake.mode = "down"
    await send("order.paid", b) // owed saved; no refund yet
    // The refund exists at Razorpay (made by an attempt whose result we never recorded) while our row still says owed.
    const { refundIdempotencyKey } = await import("../lib/core/payments/razorpay-api")
    const made: FakeRefund = { id: "rfnd_crashed", payment_id: b.pay, amount: 500000, status: "pending", notes: {} }
    fake.refunds.push(made)
    fake.byKey.set(refundIdempotencyKey(b.pay, 5000), made)
    fake.mode = "ok"
    const out = await svc.reconcileBookingRefunds(new Date(Date.now() + 10 * 60_000), 50, { dealerId })
    expect(out.created).toBe(1)
    expect(fake.refunds).toHaveLength(1)
    expect((await row(b.id)).refundId).toBe("rfnd_crashed")
  })

  it("the job finishes an owed refund that nothing else retried, and moves a pending one to refunded when Razorpay says processed", async () => {
    const c = await car("sold")
    const b = await booking(c)
    fake.mode = "down"
    await send("order.paid", b)
    fake.mode = "ok"
    const later = new Date(Date.now() + 10 * 60_000)
    expect((await svc.reconcileBookingRefunds(later, 50, { dealerId })).created).toBe(1)
    expect((await row(b.id)).refundStatus).toBe("pending")
    expect((await svc.reconcileBookingRefunds(later, 50, { dealerId })).stillPending).toBe(1)
    fake.refunds[0].status = "processed"
    expect((await svc.reconcileBookingRefunds(later, 50, { dealerId })).processed).toBe(1)
    const r = await row(b.id)
    expect([r.status, r.refundStatus]).toEqual(["refunded", "processed"])
    expect(fake.refunds).toHaveLength(1)
  })

  it("leaves a refund Razorpay marked failed for a person instead of looping", async () => {
    const c = await car("sold")
    const b = await booking(c)
    await send("order.paid", b)
    fake.refunds[0].status = "failed"
    const later = new Date(Date.now() + 10 * 60_000)
    expect((await svc.reconcileBookingRefunds(later, 50, { dealerId })).failed).toBe(1)
    const r = await row(b.id)
    expect([r.status, r.refundStatus]).toEqual(["refund_pending", "failed"])
    const posts = fake.posts
    await svc.reconcileBookingRefunds(later, 50, { dealerId })
    expect(fake.posts).toBe(posts)
    expect((await send("order.paid", b)).status).toBe(200) // no webhook retry storm for a refund only a person can fix
  })

  // ---------- M3: dealer refunds ----------

  it("two dealer clicks at once make one refund", async () => {
    const c = await car()
    const b = await booking(c)
    await send("order.paid", b)
    fake.delayMs = 15
    const out = await Promise.all([refundBooking(b.id), refundBooking(b.id), refundBooking(b.id)])
    expect(out.every((r) => r.ok)).toBe(true)
    expect(fake.refunds).toHaveLength(1)
    const r = await row(b.id)
    expect([r.status, r.refundReason, r.refundStatus]).toEqual(["refund_pending", "dealer", "pending"])
    expect(await carStatus(c)).toBe("on_hold") // a refunded car does not go back on sale by itself
    // Who asked for it is on record, once, however many clicks there were.
    const audited = await scoped.scopedDb(dealerId).auditLog.select(and(eq(s.auditLog.entityId, b.id), eq(s.auditLog.action, "payment.refund")))
    expect(audited).toHaveLength(1)
    expect(audited[0]).toMatchObject({ actorType: "user", actorId: "u1", entity: "booking" })
  })

  it("a dealer refund interrupted by a Razorpay outage is saved, and the next click finishes it", async () => {
    const c = await car()
    const b = await booking(c)
    await send("order.paid", b)
    fake.mode = "down"
    const first = await refundBooking(b.id)
    expect(first).toMatchObject({ ok: false })
    expect((await row(b.id)).status).toBe("refund_pending")
    fake.mode = "ok"
    fake.createStatus = "processed"
    expect(await refundBooking(b.id)).toEqual({ ok: true, refund: "processed" })
    expect((await row(b.id)).status).toBe("refunded")
    expect(await refundBooking(b.id)).toEqual({ ok: false, error: "This booking has already been refunded." })
    expect(fake.refunds).toHaveLength(1)
  })

  it("a late duplicate event for a dealer-refunded booking is not reported as a lost race", async () => {
    const c = await car()
    const b = await booking(c)
    await send("order.paid", b)
    await refundBooking(b.id)
    expect(await confirm(b)).toEqual({ ok: true })
    expect(fake.refunds).toHaveLength(1)
  })
  // ---------- the claim transaction rolls back as a unit ----------

  it("a failed lead insert rolls back the car and booking claims, and the retry then succeeds with one lead and no refund", async () => {
    const probe = `Probe${tag}`
    const c = await car()
    const b = await booking(c, "created", probe)
    // A fault that exists only for this test's buyer name, so tests running in parallel never see it.
    const fn = `tany_probe_fn_${tag}`
    const trg = `tany_probe_trg_${tag}`
    await unscopedDb.execute(sql.raw(`create function ${fn}() returns trigger language plpgsql as $$ begin raise exception 'probe: lead insert refused'; end $$`))
    await unscopedDb.execute(sql.raw(`create trigger ${trg} before insert on leads for each row when (new.name = '${probe}') execute function ${fn}()`))
    try {
      expect((await send("order.paid", b)).status).toBe(500) // Razorpay will retry
      expect(await confirm(b)).toMatchObject({ ok: false })
      // A real database error happened inside the webhook and the confirmation. Whatever was logged says what went wrong and
      // nothing the buyer typed or paid with.
      const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.flat().join(" | ")
      expect(logged).toContain("database error")
      for (const secret of [probe, b.pay, b.rzp, "insert into"]) expect(logged).not.toContain(secret)
      const mid = await row(b.id)
      expect([mid.status, mid.razorpayPaymentId, mid.paidAt, mid.leadId]).toEqual(["created", null, null, null]) // the booking claim was undone
      expect(await carStatus(c)).toBe("live") // and so was the car claim
      expect(await leadCount(c)).toBe(0)
      expect(fake.posts).toBe(0)
    } finally {
      await unscopedDb.execute(sql.raw(`drop trigger if exists ${trg} on leads`))
      await unscopedDb.execute(sql.raw(`drop function if exists ${fn}()`))
    }
    // The fault is gone: the same payment now goes through, once, however many times it is delivered.
    expect((await send("order.paid", b)).status).toBe(200)
    expect((await send("payment.captured", b)).status).toBe(200)
    expect(await confirm(b)).toEqual({ ok: true })
    const after = await row(b.id)
    expect([after.status, after.razorpayPaymentId]).toEqual(["paid", b.pay])
    expect(after.leadId).not.toBeNull()
    expect(await carStatus(c)).toBe("on_hold")
    expect(await leadCount(c)).toBe(1)
    expect(fake.posts).toBe(0)
  })

  it("a booking settled elsewhere mid-claim undoes the car claim, is refunded, and never leaves the car on hold", async () => {
    const c = await car()
    const b = await booking(c)
    // A second session cancels the booking and holds its row lock, so the payment's claim gets as far as the car and then waits.
    const other = await pool.connect()
    try {
      await other.query("begin")
      await other.query("update bookings set status = 'cancelled' where id = $1", [b.id])
      const inFlight = send("order.paid", b)
      let waiting = false
      for (let i = 0; i < 100 && !waiting; i++) {
        // From a different, autocommit session: pg_stat_activity is frozen for the length of a transaction, so reading it from
        // `other` (which is inside one) would show a stale picture and make this wait depend on timing.
        const r = await pool.query(`select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database() and query ilike '%update "bookings"%'`)
        waiting = r.rows[0].n > 0
        if (!waiting) await new Promise((res) => setTimeout(res, 50))
      }
      expect(waiting).toBe(true) // the interleaving really happened: the claim is blocked on the booking row
      await other.query("commit")
      expect((await inFlight).status).toBe(200)
    } finally {
      await other.query("rollback").catch(() => {}) // a failed test must not leave the row lock behind
      other.release()
    }
    const r = await row(b.id)
    expect([r.status, r.refundReason, r.refundStatus]).toEqual(["refund_pending", "booking_closed", "pending"])
    expect(await carStatus(c)).toBe("live") // the car claim was rolled back with the transaction
    expect(await leadCount(c)).toBe(0)
    expect(fake.refunds).toHaveLength(1)
    // Delivered again: nothing is applied and no second refund is made.
    expect((await send("payment.captured", b)).status).toBe(200)
    expect(await confirm(b)).toMatchObject({ ok: false, lost: true })
    expect(fake.refunds).toHaveLength(1)
    expect(await leadCount(c)).toBe(0)
  })
})
