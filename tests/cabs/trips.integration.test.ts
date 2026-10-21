// Live test of the booking service. Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database
// (audit rows are append-only and cannot be cleaned up).
import { randomBytes, randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)("bookings (live database)", () => {
  let db: typeof import("../../lib/db/client")
  let s: typeof import("../../lib/db/schema")
  let scoped: typeof import("../../lib/db/scoped")
  let tr: typeof import("../../lib/cabs/trips")
  let tq: typeof import("../../lib/cabs/trip-quote")
  let data: typeof import("../../lib/cabs/booking-admin-data")
  let usage: typeof import("../../lib/cabs/usage")
  let session: typeof import("../../lib/core/login/customer-session")
  let customerLib: typeof import("../../lib/core/login/customer")
  let drizzle: typeof import("drizzle-orm")
  let A: string
  let B: string
  let classA: string
  const classes = new Map<string, string>()
  const classOf = async (dealer: string) => {
    let id = classes.get(dealer) ?? (dealer === A ? classA : undefined)
    if (!id) {
      id = (await db.unscopedDb.insert(s.vehicleClasses).values({ dealerId: dealer, name: "Sedan", seats: 4, bags: 2 }).returning({ id: s.vehicleClasses.id }))[0].id
      classes.set(dealer, id)
    }
    return id
  }
  const freshDealer = async (name: string) => (await db.unscopedDb.insert(s.dealers).values({ slug: `tr-${name}-${randomUUID().slice(0, 6)}`, displayName: name, industry: "cabs", plan: "starter", theme, trialEndsAt: future, phone: "+919812345678" }).returning({ id: s.dealers.id }))[0].id
  const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
  const future = new Date(Date.now() + 20 * 86_400_000)
  const operator = { type: "operator" as const, id: "op-1" }
  const settings = { nightStart: "22:00", nightEnd: "06:00", gstRateBps: 500, stateCode: "33", advanceBps: null as number | null }
  const card = { tripType: "airport" as const, basePaise: 20000, perKmPaise: 1400, minKmPerDay: null, perHourPaise: null, packageHours: null, packageKm: null, extraKmPaise: null, extraHourPaise: null, bataPerDayPaise: null }
  const place = (name: string) => ({ placeId: name, name, address: `${name}, Chennai`, lat: 13, lng: 80, stateCode: "TN" })

  const quoteFor = (advanceBps: number | null = null, startInMinutes = 300) => {
    const req: import("../../lib/cabs/trip-quote").TripRequest = { tripType: "airport", pickup: place("Anna Nagar"), drop: place("Airport"), startAt: new Date(Date.now() + startInMinutes * 60_000), returnAt: null, pax: 2, bags: 1 }
    const q = tq.quoteForClass({ id: classA, name: "Sedan", seats: 4, bags: 2, active: true }, req, { cards: [{ id: "c", vehicleClassId: classA, validFrom: null, validTo: null, active: true, ...card }], surcharges: [], packages: [], settings: { ...settings, advanceBps } }, { distanceM: 12_000, durationS: 1800, source: "google" })
    if (!q.ok) throw new Error(`quote failed: ${q.code}`)
    return { req, q }
  }

  async function newCustomer(dealer: string, phone = `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`) {
    return tr.upsertCustomer(scoped.scopedDb(dealer), phone, { verified: true, now: new Date() })
  }
  async function newTrip(dealer = A, opts: { advanceBps?: number | null; startInMinutes?: number; confirmNow?: boolean; max?: number } = {}) {
    const c = await newCustomer(dealer)
    const { req, q } = quoteFor(opts.advanceBps ?? null, opts.startInMinutes ?? 300)
    const created = await scoped.scopedTransaction(dealer, async (tx) => tr.createTrip(tx, { customerId: c.id, req, quote: { ...q, classId: await classOf(dealer) }, source: "web", actor: { type: "customer", id: c.id }, now: new Date(), respondWindowMinutes: opts.max ?? 30, confirmNow: opts.confirmNow }))
    return { ...created, customerId: c.id }
  }
  const row = async (id: string, dealer = A) => (await scoped.scopedDb(dealer).trips.select(drizzle.eq(s.trips.id, id), { limit: 1 }))[0]

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    process.env.BLIND_INDEX_KEY = randomBytes(32).toString("base64")
    process.env.AUTH_SECRET = "integration-secret"
    vi.stubEnv("NODE_ENV", "development")
    ;[db, s, scoped, tr, tq, data, usage, session, customerLib, drizzle] = await Promise.all([
      import("../../lib/db/client"),
      import("../../lib/db/schema"),
      import("../../lib/db/scoped"),
      import("../../lib/cabs/trips"),
      import("../../lib/cabs/trip-quote"),
      import("../../lib/cabs/booking-admin-data"),
      import("../../lib/cabs/usage"),
      import("../../lib/core/login/customer-session"),
      import("../../lib/core/login/customer"),
      import("drizzle-orm"),
    ])
    const tag = randomUUID().slice(0, 6)
    const rows = await db.unscopedDb.insert(s.dealers).values([{ slug: `tr-a-${tag}`, displayName: "Anna Travels", industry: "cabs", plan: "starter", theme, trialEndsAt: future, phone: "+919812345678" }, { slug: `tr-b-${tag}`, displayName: "B", industry: "cabs", plan: "starter", theme, trialEndsAt: future }]).returning({ id: s.dealers.id })
    ;[A, B] = rows.map((r) => r.id)
    const [cls] = await db.unscopedDb.insert(s.vehicleClasses).values({ dealerId: A, name: "Sedan", seats: 4, bags: 2 }).returning({ id: s.vehicleClasses.id })
    classA = cls.id
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await db.pool.end()
  })

  describe("customers", () => {
    it("are found again by phone at the same business, and separate at another", async () => {
      const a1 = await tr.upsertCustomer(scoped.scopedDb(A), "+919876500001", { verified: true, now: new Date() })
      const a2 = await tr.upsertCustomer(scoped.scopedDb(A), "+919876500001", { verified: true, now: new Date() })
      const b1 = await tr.upsertCustomer(scoped.scopedDb(B), "+919876500001", { verified: true, now: new Date() })
      expect(a2.id).toBe(a1.id)
      expect(a2.isNew).toBe(false)
      expect(b1.id).not.toBe(a1.id)
      const [stored] = await scoped.scopedDb(A).customers.select(drizzle.eq(s.customers.id, a1.id))
      expect(stored.phoneEnc).not.toContain("9876500001") // encrypted
      expect(stored.phoneHash).toMatch(/^[0-9a-f]{64}$/)
    })
    it("survive two people creating the same customer at once", async () => {
      const results = await Promise.all(Array.from({ length: 6 }, () => tr.upsertCustomer(scoped.scopedDb(A), "+919876500002", { verified: true, now: new Date() })))
      expect(new Set(results.map((r) => r.id)).size).toBe(1)
    })
    it("can be added by the operator without a verified phone, and verified at their first login", async () => {
      const walkIn = await tr.upsertCustomer(scoped.scopedDb(A), "+919876500003", { verified: false, name: "Walk In", now: new Date() })
      let [c] = await scoped.scopedDb(A).customers.select(drizzle.eq(s.customers.id, walkIn.id))
      expect(c.verifiedAt).toBeNull()
      await tr.upsertCustomer(scoped.scopedDb(A), "+919876500003", { verified: true, now: new Date() })
      ;[c] = await scoped.scopedDb(A).customers.select(drizzle.eq(s.customers.id, walkIn.id))
      expect(c.verifiedAt).not.toBeNull()
      expect(c.name).toBe("Walk In")
    })
  })

  describe("sessions", () => {
    it("are valid for the customer's business and version only; signing out everywhere ends them all", async () => {
      const c = await newCustomer(A)
      const token = await session.issueSession({ cid: c.id, did: A, v: c.sessionVersion })
      expect((await customerLib.customerFromToken(A, token))?.id).toBe(c.id)
      expect(await customerLib.customerFromToken(B, token)).toBeNull() // another business
      const second = await session.issueSession({ cid: c.id, did: A, v: c.sessionVersion }) // a second device
      await scoped.scopedDb(A).customers.update({ sessionVersion: drizzle.sql`${s.customers.sessionVersion} + 1` as unknown as number }, drizzle.eq(s.customers.id, c.id))
      expect(await customerLib.customerFromToken(A, token)).toBeNull()
      expect(await customerLib.customerFromToken(A, second)).toBeNull()
    })
    it("from before customers existed (a hash, not an id) are refused", async () => {
      const old = await session.issueSession({ cid: "a".repeat(32), did: A, v: 1 })
      expect(await customerLib.customerFromToken(A, old)).toBeNull()
    })
  })

  describe("a new request", () => {
    it("is stored with a code, an unchanging quote, deadlines, a hashed share token and a first event", async () => {
      const t = await newTrip(A, { startInMinutes: 24 * 60 })
      expect(t.code).toMatch(/^[A-Z0-9]{6}$/)
      expect(t.shareToken).toHaveLength(22)
      const r = await row(t.id)
      expect(r).toMatchObject({ status: "requested", source: "web", quoteTotalPaise: 38_600, advanceDuePaise: 0, bookedByType: "customer" })
      expect(r.shareTokenHash).toMatch(/^[0-9a-f]{64}$/)
      expect(r.shareTokenHash).not.toContain(t.shareToken)
      expect(r.quote).toMatchObject({ version: 1, distanceM: 12_000, durationS: 1800 })
      expect(r.pickup.addressEnc).not.toContain("Anna Nagar") // encrypted
      expect(r.holdExpiresAt!.getTime() - r.createdAt.getTime()).toBeGreaterThan(29 * 60_000)
      expect(r.holdExpiresAt!.getTime() - r.createdAt.getTime()).toBeLessThan(31 * 60_000)
      const events = await scoped.scopedDb(A).tripEvents.select(drizzle.eq(s.tripEvents.tripId, t.id))
      expect(events.map((e) => [e.type, e.toStatus, e.actorType])).toEqual([["created", "requested", "customer"]])
    })
    it("gets a shorter window for a soon pickup, never under ten minutes", async () => {
      const t = await newTrip(A, { startInMinutes: 75 })
      const r = await row(t.id)
      const minutes = (r.holdExpiresAt!.getTime() - r.createdAt.getTime()) / 60_000
      expect(minutes).toBeGreaterThanOrEqual(10)
      expect(minutes).toBeLessThan(16)
    })
    it("never reuses a booking code at one business", async () => {
      const t = await newTrip(A)
      const r = await row(t.id)
      const c = await newCustomer(A)
      await expect(
        scoped.scopedDb(A).trips.insert({ code: r.code, customerId: c.id, tripType: "airport", pickup: r.pickup, drop: r.drop, startAt: r.startAt, pax: 1, bags: 0, vehicleClassId: classA, quote: r.quote, quoteTotalPaise: 100, shareTokenHash: "x".repeat(64) }),
      ).rejects.toThrow()
    })
    it("is refused by the database when the numbers are nonsense", async () => {
      const t = await newTrip(A)
      const r = await row(t.id)
      const c = await newCustomer(A)
      const bad = { customerId: c.id, tripType: "airport" as const, pickup: r.pickup, drop: r.drop, startAt: r.startAt, bags: 0, vehicleClassId: classA, quote: r.quote }
      await expect(scoped.scopedDb(A).trips.insert({ ...bad, code: "ZZZZZ1", pax: 0, quoteTotalPaise: 100, shareTokenHash: "a".repeat(64) })).rejects.toThrow()
      await expect(scoped.scopedDb(A).trips.insert({ ...bad, code: "ZZZZZ2", pax: 1, quoteTotalPaise: -5, shareTokenHash: "b".repeat(64) })).rejects.toThrow()
      await expect(scoped.scopedDb(A).trips.insert({ ...bad, code: "bad", pax: 1, quoteTotalPaise: 100, shareTokenHash: "c".repeat(64) })).rejects.toThrow()
    })
  })

  describe("the operator's answer", () => {
    it("accepting confirms it and clears the deadline when no advance is due", async () => {
      const t = await newTrip()
      const res = await scoped.scopedTransaction(A, (tx) => tr.acceptTrip(tx, t.id, operator, { unpaidHoldMinutes: 20 }, new Date()))
      expect(res.ok).toBe(true)
      expect(await row(t.id)).toMatchObject({ status: "confirmed", holdExpiresAt: null, holdAlertAt: null })
      const events = await scoped.scopedDb(A).tripEvents.select(drizzle.eq(s.tripEvents.tripId, t.id), { orderBy: [drizzle.asc(s.tripEvents.at)] })
      expect(events.map((e) => e.type)).toEqual(["created", "accepted"])
      expect(events[1]).toMatchObject({ fromStatus: "requested", toStatus: "confirmed", actorType: "operator" })
    })
    it("accepting starts a 20-minute payment clock when an advance is due", async () => {
      const t = await newTrip(A, { advanceBps: 2500 })
      const now = new Date()
      await scoped.scopedTransaction(A, (tx) => tr.acceptTrip(tx, t.id, operator, { unpaidHoldMinutes: 20 }, now))
      const r = await row(t.id)
      expect(r.status).toBe("confirmed")
      expect(r.advanceDuePaise).toBeGreaterThan(0)
      expect(r.holdExpiresAt!.getTime()).toBe(now.getTime() + 20 * 60_000)
    })
    it("rejecting records the reason; a rejected booking cannot be accepted", async () => {
      const t = await newTrip()
      expect((await scoped.scopedTransaction(A, (tx) => tr.rejectTrip(tx, t.id, operator, "No car free that day"))).ok).toBe(true)
      expect(await row(t.id)).toMatchObject({ status: "rejected", rejectReason: "No car free that day" })
      expect(await scoped.scopedTransaction(A, (tx) => tr.acceptTrip(tx, t.id, operator, { unpaidHoldMinutes: 20 }, new Date()))).toEqual({ ok: false, reason: "changed" })
    })
    it("accept and cancel at the same moment: exactly one wins, and the record agrees", async () => {
      for (let i = 0; i < 5; i++) {
        const t = await newTrip()
        const [acc, can] = await Promise.all([
          scoped.scopedTransaction(A, (tx) => tr.acceptTrip(tx, t.id, operator, { unpaidHoldMinutes: 20 }, new Date())),
          scoped.scopedTransaction(A, (tx) => tr.cancelTrip(tx, t.id, { type: "customer", id: t.customerId }, "changed my mind", t.customerId)),
        ])
        // Accept then cancel is legal (confirmed -> cancelled); cancel then accept is not. Either way the status is consistent with the events.
        const r = await row(t.id)
        const events = await scoped.scopedDb(A).tripEvents.select(drizzle.eq(s.tripEvents.tripId, t.id), { orderBy: [drizzle.asc(s.tripEvents.at)] })
        expect(["confirmed", "cancelled"]).toContain(r.status)
        expect(events.filter((e) => e.toStatus).length).toBe(1 + (acc.ok ? 1 : 0) + (can.ok ? 1 : 0))
        if (!acc.ok) expect(r.status).toBe("cancelled")
        if (acc.ok && !can.ok) expect(r.status).toBe("confirmed")
      }
    })
    it("cannot be done to another business's booking, or by another customer", async () => {
      const t = await newTrip(A)
      expect(await scoped.scopedTransaction(B, (tx) => tr.acceptTrip(tx, t.id, operator, { unpaidHoldMinutes: 20 }, new Date()))).toEqual({ ok: false, reason: "not_found" })
      expect(await scoped.scopedTransaction(B, (tx) => tr.cancelTrip(tx, t.id, operator, "x"))).toEqual({ ok: false, reason: "not_found" })
      expect(await tr.loadTrip(scoped.scopedDb(B), t.id)).toBeNull()
      const other = await newCustomer(A)
      expect(await scoped.scopedTransaction(A, (tx) => tr.cancelTrip(tx, t.id, { type: "customer", id: other.id }, "x", other.id))).toEqual({ ok: false, reason: "not_found" })
      expect((await row(t.id)).status).toBe("requested")
    })
    it("cannot cancel a finished booking", async () => {
      const t = await newTrip()
      await scoped.scopedTransaction(A, (tx) => tr.rejectTrip(tx, t.id, operator, "full"))
      expect(await scoped.scopedTransaction(A, (tx) => tr.cancelTrip(tx, t.id, operator, "x"))).toEqual({ ok: false, reason: "illegal" })
    })
  })

  describe("adjusting the fare", () => {
    it("keeps the customer's quote, records the new fare with a reason, an event and an audit entry", async () => {
      const t = await newTrip()
      const before = await row(t.id)
      const res = await scoped.scopedTransaction(A, (tx) => tr.adjustQuote(tx, t.id, operator, 33_000, "Regular customer discount", 2500))
      expect(res.ok).toBe(true)
      const after = await row(t.id)
      expect(after.quote).toEqual(before.quote)
      expect(after.quoteTotalPaise).toBe(38_600)
      expect(after).toMatchObject({ adjustedTotalPaise: 33_000, adjustmentReason: "Regular customer discount", advanceDuePaise: 8_300 })
      expect(tr.effectiveTotalPaise(after)).toBe(33_000)
      const ev = (await scoped.scopedDb(A).tripEvents.select(drizzle.eq(s.tripEvents.tripId, t.id))).find((e) => e.type === "quote_adjusted")!
      expect(ev.data).toMatchObject({ fromPaise: 38_600, toPaise: 33_000, reason: "Regular customer discount" })
      const logged = await scoped.scopedDb(A).auditLog.select(drizzle.and(drizzle.eq(s.auditLog.action, "fare.adjust"), drizzle.eq(s.auditLog.entityId, t.id)))
      expect(logged).toHaveLength(1)
      expect(JSON.stringify(logged[0].diff)).toContain("Regular customer discount")
    })
    it("is allowed only before a driver is assigned", async () => {
      const t = await newTrip()
      await scoped.scopedTransaction(A, (tx) => tr.rejectTrip(tx, t.id, operator, "full"))
      expect(await scoped.scopedTransaction(A, (tx) => tr.adjustQuote(tx, t.id, operator, 100, "x", null))).toEqual({ ok: false, reason: "illegal" })
    })
  })

  describe("holds (the clock)", () => {
    let H: string
    beforeAll(async () => {
      H = await freshDealer("holds")
    })
    const sweep = (now: Date) => tr.sweepHolds(scoped.scopedDb(H), now, { operatorPhone: "+919812345678", operatorName: "Anna Travels" })
    const outbox = (event: string, tripId: string) => scoped.scopedDb(H).notifications.select(drizzle.eq(s.notifications.event, event)).then((rows) => rows.filter((n) => (n.payload as { tripId?: string }).tripId === tripId))

    it("nudges the operator once at half the window, not before", async () => {
      const t = await newTrip(H, { startInMinutes: 24 * 60 })
      const created = (await row(t.id, H)).createdAt
      expect((await sweep(new Date(created.getTime() + 10 * 60_000))).alerted).toBe(0)
      const at = new Date(created.getTime() + 16 * 60_000)
      await sweep(at)
      await sweep(at)
      await sweep(new Date(created.getTime() + 20 * 60_000))
      expect(await outbox("trip.hold_alert", t.id)).toHaveLength(1)
      const events = (await scoped.scopedDb(H).tripEvents.select(drizzle.eq(s.tripEvents.tripId, t.id))).filter((e) => e.type === "hold_alert")
      expect(events).toHaveLength(1)
      expect((await row(t.id, H)).status).toBe("requested")
    })
    it("releases an unanswered request at the deadline, tells the customer, and writes the event", async () => {
      const t = await newTrip(H, { startInMinutes: 24 * 60 })
      const created = (await row(t.id, H)).createdAt
      expect((await sweep(new Date(created.getTime() + 29 * 60_000))).expired).toBe(0)
      const late = new Date(created.getTime() + 31 * 60_000)
      const r1 = await sweep(late)
      expect(r1.expired).toBeGreaterThanOrEqual(1)
      expect((await sweep(late)).expired).toBe(0) // repeating changes nothing
      expect(await row(t.id, H)).toMatchObject({ status: "expired", holdExpiresAt: null })
      const ev = (await scoped.scopedDb(H).tripEvents.select(drizzle.eq(s.tripEvents.tripId, t.id))).find((e) => e.type === "expired")!
      expect(ev).toMatchObject({ fromStatus: "requested", toStatus: "expired", actorType: "system" })
      expect(ev.data).toMatchObject({ reason: "no_response" })
      const told = await outbox("trip.expired", t.id)
      expect(told).toHaveLength(1)
      expect(told[0]).toMatchObject({ recipientType: "customer", channel: "wa_link" })
      expect((told[0].payload as { text: string }).text).toContain(t.code)
    })
    it("does not release a request the operator already answered", async () => {
      const t = await newTrip(H, { startInMinutes: 24 * 60 })
      await scoped.scopedTransaction(H, (tx) => tr.acceptTrip(tx, t.id, operator, { unpaidHoldMinutes: 20 }, new Date()))
      await sweep(new Date(Date.now() + 5 * 3600_000))
      expect((await row(t.id, H)).status).toBe("confirmed")
    })
    it("releases an accepted booking whose advance is not paid in 20 minutes", async () => {
      const t = await newTrip(H, { advanceBps: 2500, startInMinutes: 24 * 60 })
      const accepted = new Date()
      await scoped.scopedTransaction(H, (tx) => tr.acceptTrip(tx, t.id, operator, { unpaidHoldMinutes: 20 }, accepted))
      expect((await sweep(new Date(accepted.getTime() + 19 * 60_000))).expired).toBe(0)
      await sweep(new Date(accepted.getTime() + 21 * 60_000))
      expect(await row(t.id, H)).toMatchObject({ status: "expired" })
      const ev = (await scoped.scopedDb(H).tripEvents.select(drizzle.eq(s.tripEvents.tripId, t.id))).find((e) => e.type === "expired")!
      expect(ev.data).toMatchObject({ reason: "advance_unpaid" })
    })
    it("leaves a booking whose advance was paid alone", async () => {
      const t = await newTrip(H, { advanceBps: 2500, startInMinutes: 24 * 60 })
      const accepted = new Date()
      await scoped.scopedTransaction(H, (tx) => tr.acceptTrip(tx, t.id, operator, { unpaidHoldMinutes: 20 }, accepted))
      await scoped.scopedDb(H).trips.update({ advancePaidPaise: 8_925, holdExpiresAt: null }, drizzle.eq(s.trips.id, t.id))
      await sweep(new Date(accepted.getTime() + 60 * 60_000))
      expect((await row(t.id, H)).status).toBe("confirmed")
    })
    it("never touches another business's bookings", async () => {
      const t = await newTrip(B)
      const created = (await row(t.id, B)).createdAt
      await sweep(new Date(created.getTime() + 5 * 3600_000))
      expect((await row(t.id, B)).status).toBe("requested")
    })
  })

  describe("the operator's lists", () => {
    it("sort bookings into new, pending, today and upcoming", async () => {
      const dealer = (await db.unscopedDb.insert(s.dealers).values({ slug: `tr-c-${randomUUID().slice(0, 6)}`, displayName: "C", industry: "cabs", plan: "starter", theme, trialEndsAt: future }).returning({ id: s.dealers.id }))[0].id
      const [k] = await db.unscopedDb.insert(s.vehicleClasses).values({ dealerId: dealer, name: "Sedan", seats: 4, bags: 2 }).returning({ id: s.vehicleClasses.id })
      const mk = async (startInMinutes: number, confirm: boolean) => {
        const c = await tr.upsertCustomer(scoped.scopedDb(dealer), `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, { verified: true, now: new Date() })
        const { req, q } = quoteFor(null, startInMinutes)
        const quote = { ...q, classId: k.id }
        return scoped.scopedTransaction(dealer, (tx) => tr.createTrip(tx, { customerId: c.id, req, quote, source: "phone", actor: operator, now: new Date(), respondWindowMinutes: 30, confirmNow: confirm }))
      }
      const now = new Date()
      const dayStart = data.istDayStart(now)
      const hoursIntoDay = (now.getTime() - dayStart.getTime()) / 3_600_000
      const later = Math.min(23.5 - hoursIntoDay, 3) // still today if there is room, otherwise skip the "today" assertion
      const reqNow = await mk(60, false)
      const confirmedFar = await mk(3 * 24 * 60, true)
      const requestedFar = await mk(2 * 24 * 60, false)
      const inbox = (tab: import("../../lib/cabs/booking-admin-data").InboxTab) => data.loadInbox(scoped.scopedDb(dealer), tab, now)
      expect((await inbox("new")).rows.map((r) => r.id).sort()).toEqual([reqNow.id, requestedFar.id].sort())
      expect((await inbox("pending")).rows.map((r) => r.id)).toEqual([confirmedFar.id])
      expect((await inbox("upcoming")).rows.map((r) => r.id).sort()).toEqual([confirmedFar.id, requestedFar.id].sort())
      expect((await inbox("all")).rows).toHaveLength(3)
      const counts = (await inbox("new")).counts
      expect(counts).toMatchObject({ new: 2, pending: 1, unpaid: 0, upcoming: 2, all: 3 })
      // A confirmed booking whose advance is not paid is Unpaid as well as Pending; once paid it leaves Unpaid.
      await scoped.scopedDb(dealer).trips.update({ advanceDuePaise: 5000 }, drizzle.eq(s.trips.id, confirmedFar.id))
      expect((await inbox("unpaid")).rows.map((r) => r.id)).toEqual([confirmedFar.id])
      expect((await inbox("pending")).rows.map((r) => r.id)).toEqual([confirmedFar.id])
      await scoped.scopedDb(dealer).trips.update({ advancePaidPaise: 5000 }, drizzle.eq(s.trips.id, confirmedFar.id))
      expect((await inbox("unpaid")).rows).toEqual([])
      expect((await inbox("new")).rows.some((r) => r.id === requestedFar.id)).toBe(true) // a request awaiting an answer is never "unpaid"
      if (later > 1.2) expect((await inbox("today")).rows.map((r) => r.id)).toContain(reqNow.id)
      // The list shows the customer's name and number to the operator, and only this business's bookings.
      expect((await inbox("all")).rows.every((r) => r.customerPhone.startsWith("+91"))).toBe(true)
      expect((await data.loadInbox(scoped.scopedDb(B), "all", now)).rows.some((r) => r.id === reqNow.id)).toBe(false)
    })
    it("find customers by exact phone or part of a name, within one business", async () => {
      const c = await tr.upsertCustomer(scoped.scopedDb(A), "+919876511111", { verified: false, name: "Lakshmi Narayanan", now: new Date() })
      await scoped.scopedDb(A).customers.update({ name: "Lakshmi Narayanan" }, drizzle.eq(s.customers.id, c.id))
      expect((await data.loadCustomers(scoped.scopedDb(A), "9876511111")).map((r) => r.id)).toEqual([c.id])
      expect((await data.loadCustomers(scoped.scopedDb(A), "lakshmi")).map((r) => r.id)).toEqual([c.id])
      expect(await data.loadCustomers(scoped.scopedDb(B), "9876511111")).toEqual([])
      expect(await data.loadCustomers(scoped.scopedDb(A), "100%_")).toEqual([]) // wildcards are not wildcards
      expect((await data.loadCustomerDetail(scoped.scopedDb(A), c.id))?.customer.phone).toBe("+919876511111")
      expect(await data.loadCustomerDetail(scoped.scopedDb(B), c.id)).toBeNull()
    })
  })

  describe("the monthly bookings allowance", () => {
    it("counts this month's bookings, not the ones the clock released", async () => {
      const dealer = (await db.unscopedDb.insert(s.dealers).values({ slug: `tr-d-${randomUUID().slice(0, 6)}`, displayName: "D", industry: "cabs", plan: "starter", theme, trialEndsAt: future }).returning({ id: s.dealers.id }))[0].id
      const [k] = await db.unscopedDb.insert(s.vehicleClasses).values({ dealerId: dealer, name: "Sedan", seats: 4, bags: 2 }).returning({ id: s.vehicleClasses.id })
      const make = async () => {
        const c = await tr.upsertCustomer(scoped.scopedDb(dealer), `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, { verified: true, now: new Date() })
        const { req, q } = quoteFor()
        return scoped.scopedTransaction(dealer, (tx) => tr.createTrip(tx, { customerId: c.id, req, quote: { ...q, classId: k.id }, source: "web", actor: { type: "customer", id: c.id }, now: new Date(), respondWindowMinutes: 30 }))
      }
      const ids = [await make(), await make(), await make()]
      const db2 = scoped.scopedDb(dealer)
      expect(await usage.monthlyBookingCount(db2, new Date())).toBe(3)
      await db2.trips.update({ status: "expired" }, drizzle.eq(s.trips.id, ids[0].id))
      expect(await usage.monthlyBookingCount(db2, new Date())).toBe(2)
      // Last month's bookings do not count.
      await db2.trips.update({ createdAt: new Date(Date.now() - 40 * 86_400_000) }, drizzle.eq(s.trips.id, ids[1].id))
      expect(await usage.monthlyBookingCount(db2, new Date())).toBe(1)
      expect(await usage.monthlyBookingCount(scoped.scopedDb(await freshDealer("empty")), new Date())).toBe(0)
    })
  })
})
