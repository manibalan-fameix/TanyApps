// Live test: submitting the same booking twice (double tap, retry, two tabs) returns the request that already exists, while genuinely
// different bookings stay separate. Runs only against a DISPOSABLE migrated database (see docs/staging/neon-test-database.md).
import { randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { testDatabaseUrl } from "../support/disposable-db"

const url = testDatabaseUrl()
const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }

describe.skipIf(!url)("booking idempotency (live database)", () => {
  let db: typeof import("../../lib/db/client")
  let s: typeof import("../../lib/db/schema")
  let scoped: typeof import("../../lib/db/scoped")
  let tr: typeof import("../../lib/cabs/trips")
  let tq: typeof import("../../lib/cabs/trip-quote")
  let idem: typeof import("../../lib/cabs/idempotency")
  let drizzle: typeof import("drizzle-orm")
  let A: string
  let B: string
  const classOf = new Map<string, string>()
  const place = (name: string) => ({ placeId: name, name, address: `${name}, Chennai`, lat: 13, lng: 80, stateCode: "TN" })
  const card = { tripType: "airport" as const, basePaise: 20000, perKmPaise: 1400, minKmPerDay: null, perHourPaise: null, packageHours: null, packageKm: null, extraKmPaise: null, extraHourPaise: null, bataPerDayPaise: null }
  const settings = { nightStart: "22:00", nightEnd: "06:00", gstRateBps: 500, stateCode: "33", advanceBps: null as number | null }

  const quote = (cls: string, from = "Anna Nagar") => {
    const req = { tripType: "airport" as const, pickup: place(from), drop: place("Airport"), startAt: new Date(Date.now() + 300 * 60_000), returnAt: null, pax: 2, bags: 1 }
    const q = tq.quoteForClass({ id: cls, name: "Sedan", seats: 4, bags: 2, active: true }, req, { cards: [{ id: "c", vehicleClassId: cls, validFrom: null, validTo: null, active: true, ...card }], surcharges: [], packages: [], settings }, { distanceM: 12_000, durationS: 1800, source: "google" })
    if (!q.ok) throw new Error(q.code)
    return { req, q }
  }
  const customer = async (dealer: string) => tr.upsertCustomer(scoped.scopedDb(dealer), `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, { verified: true, now: new Date() })
  /** What requestBooking does for one submission, minus the HTTP, maps and fare lookups that do not matter here. */
  const submit = async (dealer: string, customerId: string, key: string | undefined, from = "Anna Nagar", now = new Date()) => {
    const cls = classOf.get(dealer)!
    const { req, q } = quote(cls, from)
    return idem.createTripOnce(scoped.scopedDb(dealer), customerId, idem.cleanOperationKey(key), now, () =>
      tr.withBookingCodeRetry(() => scoped.scopedTransaction(dealer, (tx) => tr.createTrip(tx, { customerId, req, quote: { ...q, classId: cls }, source: "web", actor: { type: "customer", id: customerId }, now, respondWindowMinutes: 30, idempotencyKey: idem.cleanOperationKey(key) }))),
    )
  }
  const count = async (dealer: string, customerId: string) => (await scoped.scopedDb(dealer).trips.select(drizzle.eq(s.trips.customerId, customerId))).length

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    process.env.BLIND_INDEX_KEY = randomBytes(32).toString("base64")
    process.env.AUTH_SECRET = "integration-secret"
    vi.stubEnv("NODE_ENV", "development")
    ;[db, s, scoped, tr, tq, idem, drizzle] = await Promise.all([import("../../lib/db/client"), import("../../lib/db/schema"), import("../../lib/db/scoped"), import("../../lib/cabs/trips"), import("../../lib/cabs/trip-quote"), import("../../lib/cabs/idempotency"), import("drizzle-orm")])
    const tag = randomUUID().slice(0, 6)
    const future = new Date(Date.now() + 20 * 86_400_000)
    const rows = await db.unscopedDb.insert(s.dealers).values([{ slug: `idem-a-${tag}`, displayName: "A", industry: "cabs", plan: "starter", theme, trialEndsAt: future }, { slug: `idem-b-${tag}`, displayName: "B", industry: "cabs", plan: "starter", theme, trialEndsAt: future }]).returning({ id: s.dealers.id })
    ;[A, B] = rows.map((r) => r.id)
    for (const d of [A, B]) classOf.set(d, (await db.unscopedDb.insert(s.vehicleClasses).values({ dealerId: d, name: "Sedan", seats: 4, bags: 2 }).returning({ id: s.vehicleClasses.id }))[0].id)
  })
  afterAll(async () => {
    await db.pool.end()
  })

  it("the same key submitted again returns the first request: one trip, the same id and code", async () => {
    const c = await customer(A)
    const key = randomUUID()
    const first = await submit(A, c.id, key)
    const again = await submit(A, c.id, key)
    expect({ id: again.id, code: again.code }).toEqual({ id: first.id, code: first.code })
    expect(await count(A, c.id)).toBe(1)
  })
  it("ten simultaneous submissions with one key create exactly one trip and all return it", async () => {
    const c = await customer(A)
    const key = randomUUID()
    const results = await Promise.all(Array.from({ length: 10 }, () => submit(A, c.id, key)))
    expect(new Set(results.map((r) => r.id)).size).toBe(1)
    expect(new Set(results.map((r) => r.code)).size).toBe(1)
    expect(await count(A, c.id)).toBe(1)
  })
  it("intentional repeats are not merged: a different key, or no key, makes a new request even for the identical trip", async () => {
    const c = await customer(A)
    const a = await submit(A, c.id, randomUUID())
    const b = await submit(A, c.id, randomUUID())
    const c1 = await submit(A, c.id, undefined)
    const c2 = await submit(A, c.id, undefined)
    expect(new Set([a.id, b.id, c1.id, c2.id]).size).toBe(4)
    expect(await count(A, c.id)).toBe(4)
  })
  it("a malformed key is ignored rather than rejected: the booking goes through and is simply not de-duplicated", async () => {
    const c = await customer(A)
    const one = await submit(A, c.id, "not-a-uuid")
    const two = await submit(A, c.id, "not-a-uuid")
    expect(one.id).not.toBe(two.id)
    expect(idem.cleanOperationKey("x'; drop table trips;--")).toBeUndefined()
    expect(idem.cleanOperationKey(42)).toBeUndefined()
  })
  it("a key belongs to one customer in one business: another customer or another business with the same key gets its own request", async () => {
    const key = randomUUID()
    const c1 = await customer(A), c2 = await customer(A), c3 = await customer(B)
    const a = await submit(A, c1.id, key)
    const b = await submit(A, c2.id, key)
    const d = await submit(B, c3.id, key)
    expect(new Set([a.id, b.id, d.id]).size).toBe(3)
    // And one customer cannot learn of another's trip through a shared key: the lookup is scoped to (business, customer).
    expect(await idem.findByOperationKey(scoped.scopedDb(A), c2.id, key, new Date())).toEqual({ id: b.id, code: b.code })
    expect(await idem.findByOperationKey(scoped.scopedDb(B), c1.id, key, new Date())).toBeNull()
  })
  it("a key expires after 24 hours: it is released and a later submission is a new request", async () => {
    const c = await customer(A)
    const key = randomUUID()
    const old = await submit(A, c.id, key)
    await db.unscopedDb.execute(drizzle.sql`update trips set created_at = now() - interval '25 hours' where id = ${old.id}`)
    expect(await idem.findByOperationKey(scoped.scopedDb(A), c.id, key, new Date())).toBeNull()
    const fresh = await submit(A, c.id, key)
    expect(fresh.id).not.toBe(old.id)
    expect(await count(A, c.id)).toBe(2)
    const [released] = await scoped.scopedDb(A).trips.select(drizzle.eq(s.trips.id, old.id))
    expect(released.idempotencyKey).toBeNull()
  })
  it("the database itself refuses two trips with one key for the same customer, so no race can create a duplicate", async () => {
    const c = await customer(A)
    const key = randomUUID()
    await submit(A, c.id, key)
    const { req, q } = quote(classOf.get(A)!)
    await expect(
      scoped.scopedTransaction(A, (tx) => tr.createTrip(tx, { customerId: c.id, req, quote: { ...q, classId: classOf.get(A)! }, source: "web", actor: { type: "customer", id: c.id }, now: new Date(), respondWindowMinutes: 30, idempotencyKey: key })),
    ).rejects.toSatisfy((e: unknown) => idem.isOperationKeyClash(e))
  })
  it("operator-made bookings carry no key and are never merged", async () => {
    const c = await customer(A)
    const { req, q } = quote(classOf.get(A)!)
    const make = () => scoped.scopedTransaction(A, (tx) => tr.createTrip(tx, { customerId: c.id, req, quote: { ...q, classId: classOf.get(A)! }, source: "phone", actor: { type: "operator", id: "op" }, now: new Date(), respondWindowMinutes: 30, confirmNow: true }))
    const [x, y] = await Promise.all([make(), make()])
    expect(x.id).not.toBe(y.id)
  })
  it("existing bookings are unaffected: the new column is nullable and old rows keep working", async () => {
    const rows = await db.unscopedDb.select({ k: s.trips.idempotencyKey }).from(s.trips).limit(50)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some((r) => r.k === null)).toBe(true)
  })
})
