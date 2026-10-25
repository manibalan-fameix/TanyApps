// Live test: the cron route, its (job, slot) lock and the real refund reconciliation, together. Duplicate scheduled invocations, a failed run
// retried, and a run that outlives its lock (so a second one overlaps it) must each leave exactly one logical refund. A MOCKED Razorpay.
// The job registered here runs the real reconciliation but scoped to this test's own business, so it never touches other tests' data.
// Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database (see docs/staging/neon-test-database.md).
import { randomBytes } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeRazorpay } from "./support/fake-razorpay"
import { uniqueCode } from "./support/ids"
import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()
const SECRET = "cron-secret-for-tests-0123456789"

describe.skipIf(!url)("cron + refund reconciliation (live database, mocked Razorpay)", () => {
  const rz = createFakeRazorpay()
  let POST: typeof import("../app/api/internal/cron/[job]/route").POST
  let scheduler: typeof import("../lib/core/scheduler")
  let svc: typeof import("../lib/bookings/service")
  let pay: typeof import("../lib/restaurant/payments")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  let eatsDealer: string
  let motorsDealer: string
  const tag = randomBytes(3).toString("hex")
  const names: string[] = []
  let n = 0
  const later = () => new Date(Date.now() + 30 * 60_000)

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.CRON_SECRET = SECRET
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc"
    process.env.RAZORPAY_KEY_SECRET = "secret"
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    ;({ POST } = await import("../app/api/internal/cron/[job]/route"))
    scheduler = await import("../lib/core/scheduler")
    svc = await import("../lib/bookings/service")
    pay = await import("../lib/restaurant/payments")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
    const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
    const mk = (slug: string, industry: "motors" | "restaurants") => ({ slug: `${slug}-${tag}`, displayName: slug, industry, theme, razorpayAccountId: "acc_test", razorpayAccountStatus: "activated" })
    ;[motorsDealer, eatsDealer] = (await unscopedDb.insert(s.dealers).values([mk("cf-m", "motors"), mk("cf-r", "restaurants")]).returning({ id: s.dealers.id })).map((r) => r.id)
  })
  afterAll(async () => {
    try {
      for (const name of names) await unscopedDb.delete(s.cronRuns).where(eq(s.cronRuns.job, name))
    } finally {
      await pool.end()
    }
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

  /** Registers a job that does this test's own refund work, scoped to this test's businesses. */
  const register = (run: () => Promise<string>) => {
    const name = `fin-${tag}-${++n}`
    names.push(name)
    scheduler.JOBS[name] = { name, run }
    return name
  }
  const call = (job: string, slot: Date) =>
    POST(new Request(`https://app.tany.in/api/internal/cron/${job}`, { method: "POST", headers: { "x-cron-secret": SECRET, "x-cron-slot": slot.toISOString() } }), { params: Promise.resolve({ job }) })
  const slotNow = () => {
    const d = new Date()
    d.setSeconds(0, 0)
    return d
  }
  const reconcileBoth = async () => {
    const a = await svc.reconcileBookingRefunds(later(), 50, { dealerId: motorsDealer })
    const b = await pay.reconcileOrderRefunds(later(), 50, { dealerId: eatsDealer })
    return `motors ${a.created} created; eats ${b.completed} completed`
  }

  async function owedOrder() {
    n++
    const [o] = await unscopedDb
      .insert(s.orders)
      .values({ dealerId: eatsDealer, code: uniqueCode(), customerName: "Guest", customerPhone: "+919999999999", fulfilment: "pickup", lines: [], subtotal: 250, total: 250, paymentMethod: "online", status: "cancelled", paymentStatus: "refunding", updatedAt: new Date(Date.now() - 60 * 60_000), razorpayOrderId: `order_${tag}${n}`, razorpayPaymentId: `pay_${tag}${n}` })
      .returning()
    return o
  }
  async function owedBooking() {
    n++
    const [car] = await unscopedDb.insert(s.cars).values({ dealerId: motorsDealer, year: 2018, status: "sold", shortCode: uniqueCode(), slug: `cf-${tag}-${n}` }).returning()
    const [b] = await unscopedDb
      .insert(s.bookings)
      .values({ dealerId: motorsDealer, carId: car.id, buyerName: "Buyer", buyerPhone: "enc", amount: 5000, razorpayOrderId: `order_${tag}${n}`, razorpayPaymentId: `pay_${tag}${n}`, status: "refund_pending", refundReason: "car_unavailable", refundRequestedAt: new Date(Date.now() - 60 * 60_000) })
      .returning()
    return b
  }
  const order = async (id: string) => (await unscopedDb.select().from(s.orders).where(eq(s.orders.id, id)))[0]
  const booking = async (id: string) => (await unscopedDb.select().from(s.bookings).where(eq(s.bookings.id, id)))[0]
  const runRow = async (job: string) => (await unscopedDb.select().from(s.cronRuns).where(eq(s.cronRuns.job, job)))[0]

  it("the same scheduled slot fired many times at once runs the work once and refunds once (both products)", async () => {
    const o = await owedOrder()
    const b = await owedBooking()
    let bodies = 0
    const job = register(async () => (bodies++, reconcileBoth()))
    const slot = slotNow()
    rz.state.delayMs = 15
    const res = await Promise.all(Array.from({ length: 8 }, () => call(job, slot)))
    expect(res.map((r) => r.status)).toEqual(Array(8).fill(200))
    const bodies2 = await Promise.all(res.map(async (r) => ((await r.json()) as { ran: boolean }).ran))
    expect(bodies2.filter(Boolean)).toHaveLength(1)
    expect(bodies).toBe(1)
    expect(rz.state.refunds.map((r) => r.payment_id).sort()).toEqual([o.razorpayPaymentId, b.razorpayPaymentId].sort())
    expect((await order(o.id)).paymentStatus).toBe("refunded")
    expect((await booking(b.id)).refundId).not.toBeNull()
    expect((await runRow(job)).status).toBe("done")
  })

  it("a failed run is answered 500 so the trigger retries, and the retry finishes the work without a second refund", async () => {
    const o = await owedOrder()
    let attempt = 0
    const job = register(async () => {
      attempt++
      const out = await reconcileBoth() // the work happens, then the run dies before it can be recorded as done
      if (attempt === 1) throw new Error("worker died after the refund was created")
      return out
    })
    const slot = slotNow()
    expect((await call(job, slot)).status).toBe(500)
    expect((await runRow(job)).status).toBe("failed")
    expect((await call(job, slot)).status).toBe(200) // the cron worker's retry for the same slot
    const row = await runRow(job)
    expect([row.status, row.attempts]).toEqual(["done", 2])
    expect(rz.state.refunds.filter((r) => r.payment_id === o.razorpayPaymentId)).toHaveLength(1)
    expect(new Set(rz.state.keys.filter((k) => k.includes(o.razorpayPaymentId as string))).size).toBe(1) // the same logical key every time
  })

  it("a run that outlives its lock is overlapped by the next one, and they still make one refund", async () => {
    const o = await owedOrder()
    const b = await owedBooking()
    let release: () => void = () => {}
    const slow = new Promise<void>((r) => (release = r))
    let entered = 0
    const job = register(async () => {
      entered++
      if (entered === 1) await slow // the first run hangs, as if it had hit the platform's time limit
      return reconcileBoth()
    })
    const slot = slotNow()
    const first = call(job, slot) // holds the slot, hangs
    await vi.waitFor(async () => expect(await runRow(job)).toBeDefined())
    await unscopedDb.update(s.cronRuns).set({ startedAt: new Date(Date.now() - scheduler.STALE_RUN_MS - 1000) }).where(eq(s.cronRuns.job, job)) // the lock is now considered stale
    const second = await call(job, slot) // reclaims the slot and does the work while the first is still alive
    expect(second.status).toBe(200)
    release() // the first run now wakes up and does the same work again, overlapping in time with the second
    expect((await first).status).toBe(200)
    expect(entered).toBe(2)
    expect(rz.state.refunds.filter((r) => [o.razorpayPaymentId, b.razorpayPaymentId].includes(r.payment_id))).toHaveLength(2) // one per payment, not four
  })

  it("repeated runs with nothing left to do change nothing and call nobody", async () => {
    await owedOrder()
    await reconcileBoth()
    const posts = rz.state.posts
    const results = [await reconcileBoth(), await reconcileBoth()]
    expect(rz.state.posts).toBe(posts)
    expect(results.every((r) => r.includes("0 created") || r.includes("motors 0"))).toBe(true)
  })

  it("the route refuses a run without the secret, with a stale slot, or for a job that does not exist", async () => {
    const job = register(async () => "ran")
    const bare = (headers: Record<string, string>) => POST(new Request(`https://app.tany.in/api/internal/cron/${job}`, { method: "POST", headers }), { params: Promise.resolve({ job }) })
    expect((await bare({ "x-cron-slot": slotNow().toISOString() })).status).toBe(401)
    expect((await bare({ "x-cron-secret": "wrong-secret-wrong-secret", "x-cron-slot": slotNow().toISOString() })).status).toBe(401)
    expect((await bare({ "x-cron-secret": SECRET, "x-cron-slot": new Date(Date.now() - 3 * 3_600_000).toISOString() })).status).toBe(400)
    expect((await call(`missing-${tag}`, slotNow())).status).toBe(404)
    expect(await unscopedDb.select().from(s.cronRuns).where(and(eq(s.cronRuns.job, job)))).toHaveLength(0) // none of those touched the lock table
  })

  it("every money job is registered, runs on the schedule the worker fires, and is reachable only through the route", async () => {
    const { SCHEDULE } = await import("../workers/cron/index")
    const scheduled = Object.values(SCHEDULE).flat()
    for (const j of ["retry-booking-refunds", "retry-order-refunds", "expire-unpaid-orders", "expire-trip-holds"]) {
      expect(Object.keys(scheduler.JOBS), j).toContain(j)
      expect(scheduled, j).toContain(j)
    }
  })

  // ---------- a payment whose notification never arrived is found by asking Razorpay ----------

  async function waitingOrder(over: Record<string, unknown> = {}) {
    n++
    const [o] = await unscopedDb
      .insert(s.orders)
      .values({ dealerId: eatsDealer, code: uniqueCode(), customerName: "Guest", customerPhone: "+919999999999", fulfilment: "pickup", lines: [], subtotal: 250, total: 250, paymentMethod: "online", status: "pending_payment", razorpayOrderId: `order_${tag}${n}`, createdAt: new Date(Date.now() - 3 * 3_600_000), ...over })
      .returning()
    return o
  }
  async function waitingBooking(ageMinutes: number) {
    n++
    const [car] = await unscopedDb.insert(s.cars).values({ dealerId: motorsDealer, year: 2018, status: "live", shortCode: uniqueCode(), slug: `cf-${tag}-${n}` }).returning()
    const [b] = await unscopedDb
      .insert(s.bookings)
      .values({ dealerId: motorsDealer, carId: car.id, buyerName: "Buyer", buyerPhone: "enc", amount: 5000, razorpayOrderId: `order_${tag}${n}`, status: "created", createdAt: new Date(Date.now() - ageMinutes * 60_000) })
      .returning()
    return { ...b, carId: car.id }
  }
  const carStatus = async (id: string) => (await unscopedDb.select().from(s.cars).where(eq(s.cars.id, id)))[0].status
  const leadsFor = async (carId: string) => (await unscopedDb.select().from(s.leads).where(eq(s.leads.carId, carId))).length
  const exceptionFor = async (ref: string) => (await unscopedDb.select().from(s.paymentExceptions).where(eq(s.paymentExceptions.ref, ref)))[0]

  it("Eats: an unpaid-looking order that Razorpay says was paid is applied, not cancelled", async () => {
    const o = await waitingOrder()
    rz.state.orderPayments[o.razorpayOrderId as string] = [{ id: `pay_found_${tag}`, status: "captured" }]
    await pay.expireUnpaidOrders(eatsDealer, new Date(), { verifyWithProvider: true })
    const r = await order(o.id)
    expect([r.status, r.paymentStatus, r.razorpayPaymentId, r.stockReleased]).toEqual(["new", "paid", `pay_found_${tag}`, false])
    expect((await exceptionFor(`pay_found_${tag}`)).status).toBe("resolved") // kept for the record: the notification never arrived
    expect(rz.state.posts).toBe(0) // nothing was refunded
  })

  it("Eats: an order Razorpay says was not paid still expires and gives its stock back", async () => {
    const o = await waitingOrder()
    await pay.expireUnpaidOrders(eatsDealer, new Date(), { verifyWithProvider: true })
    const r = await order(o.id)
    expect([r.status, r.stockReleased]).toEqual(["cancelled", true])
    expect(rz.state.orderLookups).toBeGreaterThan(0)
  })

  it("Eats: if Razorpay cannot be asked, the order is left alone for the next run (never guessed)", async () => {
    const o = await waitingOrder()
    rz.state.ordersDown = true
    await pay.expireUnpaidOrders(eatsDealer, new Date(), { verifyWithProvider: true })
    expect((await order(o.id)).status).toBe("pending_payment")
    rz.state.ordersDown = false
    await pay.expireUnpaidOrders(eatsDealer, new Date(), { verifyWithProvider: true })
    expect((await order(o.id)).status).toBe("cancelled")
  })

  it("Eats: the quick check done as pages load never calls Razorpay", async () => {
    const o = await waitingOrder()
    await pay.expireUnpaidOrders(eatsDealer)
    expect(rz.state.orderLookups).toBe(0)
    expect((await order(o.id)).status).toBe("cancelled")
  })

  it("Motors: a booking Razorpay says was paid is confirmed exactly as a notification would, once, even beside the real webhook", async () => {
    const b = await waitingBooking(30)
    const paymentId = `pay_mfound_${tag}`
    rz.state.orderPayments[b.razorpayOrderId] = [{ id: paymentId, status: "captured" }]
    const both = await Promise.all([svc.reconcileUnconfirmedBookings(new Date(), 50, { dealerId: motorsDealer }), svc.applyBookingPayment(b.razorpayOrderId, paymentId), svc.reconcileUnconfirmedBookings(new Date(), 50, { dealerId: motorsDealer })])
    expect(both[0].checked + both[2].checked).toBeGreaterThan(0)
    const r = await booking(b.id)
    expect([r.status, r.razorpayPaymentId]).toEqual(["paid", paymentId])
    expect(await carStatus(b.carId)).toBe("on_hold")
    expect(await leadsFor(b.carId)).toBe(1)
    expect(rz.state.posts).toBe(0)
  })

  it("Motors: if the car has gone to someone else meanwhile, the recovered payment is refunded, not lost", async () => {
    const b = await waitingBooking(30)
    await unscopedDb.update(s.cars).set({ status: "sold" }).where(eq(s.cars.id, b.carId))
    rz.state.orderPayments[b.razorpayOrderId] = [{ id: `pay_mlost_${tag}`, status: "captured" }]
    expect(await svc.reconcileUnconfirmedBookings(new Date(), 50, { dealerId: motorsDealer })).toMatchObject({ recovered: 1 })
    expect((await booking(b.id)).status).toBe("refund_pending")
    expect(rz.state.refunds.map((r) => r.payment_id)).toEqual([`pay_mlost_${tag}`])
    expect(await leadsFor(b.carId)).toBe(0)
  })

  it("Motors: only bookings that have waited a while, and not for ever, are checked; an unpaid one stays as it is", async () => {
    const fresh = await waitingBooking(2)
    const ancient = await waitingBooking(8 * 24 * 60)
    const unpaid = await waitingBooking(60)
    const lookupsBefore = rz.state.orderLookups
    expect(await svc.reconcileUnconfirmedBookings(new Date(), 50, { dealerId: motorsDealer })).toMatchObject({ recovered: 0 })
    expect(rz.state.orderLookups - lookupsBefore).toBeGreaterThanOrEqual(1) // the one in the window was asked about
    for (const b of [fresh, ancient, unpaid]) expect((await booking(b.id)).status).toBe("created")
  })

  it("Motors: a Razorpay outage changes nothing and does not throw", async () => {
    const b = await waitingBooking(45)
    rz.state.ordersDown = true
    await expect(svc.reconcileUnconfirmedBookings(new Date(), 50, { dealerId: motorsDealer })).resolves.toMatchObject({ recovered: 0 })
    expect((await booking(b.id)).status).toBe("created")
  })
})
