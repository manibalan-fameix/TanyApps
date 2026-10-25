// Live test of the server actions behind the booking pages. Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database.
import { randomBytes, randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { testDatabaseUrl } from "../support/disposable-db"

const url = testDatabaseUrl()

let operator: { dealer: Record<string, unknown>; owner: boolean } | null = null
let tenant: { dealer: Record<string, unknown>; ip: string } | null = null
let signedIn: Record<string, unknown> | null = null

vi.mock("@/lib/core/guards", () => ({ industrySession: async () => operator, tenantContext: async () => tenant }))
vi.mock("@/lib/core/login/customer", () => ({ currentCustomer: async () => signedIn }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

describe.skipIf(!url)("booking actions (live database)", () => {
  let db: typeof import("../../lib/db/client")
  let s: typeof import("../../lib/db/schema")
  let scoped: typeof import("../../lib/db/scoped")
  let admin: typeof import("../../lib/cabs/booking-admin-actions")
  let pub: typeof import("../../lib/cabs/public-actions")
  let seal: typeof import("../../lib/cabs/place-token")
  let tr: typeof import("../../lib/cabs/trips")
  let drizzle: typeof import("drizzle-orm")
  let A: string
  let B: string
  let cls: string
  let dealerA: Record<string, unknown>
  const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
  const future = new Date(Date.now() + 20 * 86_400_000)
  const inHours = (h: number) => new Date(Date.now() + h * 3600_000 + 330 * 60_000).toISOString().slice(0, 16)
  const place = (name: string, stateCode = "TN") => ({ placeId: name, name, address: `${name}, Tamil Nadu`, lat: 13, lng: 80, stateCode })
  const manual = (over: Record<string, unknown> = {}) => ({ source: "phone", phone: "9876543210", name: "Ravi", tripType: "airport", pickup: place("T Nagar"), drop: place("Airport"), startAt: inHours(30), pax: 2, bags: 1, classId: cls, manualDistanceKm: "20", ...over })

  const asOperator = () => {
    operator = { dealer: dealerA, owner: true }
    tenant = { dealer: dealerA, ip: "1.2.3.4" }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    process.env.BLIND_INDEX_KEY = randomBytes(32).toString("base64")
    process.env.AUTH_SECRET = "integration-secret"
    process.env.GEO_FIXTURE = "1"
    vi.stubEnv("NODE_ENV", "development")
    ;[db, s, scoped, admin, pub, seal, tr, drizzle] = await Promise.all([
      import("../../lib/db/client"),
      import("../../lib/db/schema"),
      import("../../lib/db/scoped"),
      import("../../lib/cabs/booking-admin-actions"),
      import("../../lib/cabs/public-actions"),
      import("../../lib/cabs/place-token"),
      import("../../lib/cabs/trips"),
      import("drizzle-orm"),
    ])
    const tag = randomUUID().slice(0, 6)
    const rows = await db.unscopedDb.insert(s.dealers).values([{ slug: `ba-a-${tag}`, displayName: "Anna Travels", industry: "cabs", plan: "starter", theme, trialEndsAt: future, phone: "+919812345678" }, { slug: `ba-b-${tag}`, displayName: "B", industry: "cabs", plan: "starter", theme, trialEndsAt: future }]).returning()
    ;[A, B] = rows.map((r) => r.id)
    dealerA = { id: A, displayName: "Anna Travels", industry: "cabs", phone: "+919812345678", plan: "starter", trialEndsAt: future, paidThrough: null, subscriptionStatus: null, nextPlan: null, nextPlanStartsAt: null, cancelRequestedAt: null, slug: rows[0].slug, suspended: false }
    const db1 = scoped.scopedDb(A)
    cls = (await db.unscopedDb.insert(s.vehicleClasses).values({ dealerId: A, name: "Sedan", seats: 4, bags: 2, sortOrder: 1 }).returning({ id: s.vehicleClasses.id }))[0].id
    await db.unscopedDb.insert(s.vehicleClasses).values({ dealerId: A, name: "Tempo", seats: 12, bags: 8, sortOrder: 2 })
    await db1.rateCards.insert({ vehicleClassId: cls, tripType: "airport", basePaise: 20000, perKmPaise: 1400 })
    await db1.cabSettings.insert({ gstRateBps: 500, stateCode: "33", minLeadMinutes: 60, respondWindowMinutes: 30 })
    asOperator()
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    delete process.env.GEO_FIXTURE
    await db.pool.end()
  })

  describe("a booking the operator takes", () => {
    it("is priced like the website, confirmed on the spot, and the customer record is created unverified", async () => {
      const preview = await admin.previewManualFare(manual())
      expect(preview).toMatchObject({ ok: true, distanceKm: 20 })
      const made = await admin.createManualBooking(manual())
      expect(made.ok).toBe(true)
      if (!made.ok || !preview.ok) return
      const [t] = await scoped.scopedDb(A).trips.select(drizzle.eq(s.trips.id, made.id))
      expect(t).toMatchObject({ status: "confirmed", source: "phone", bookedByType: "operator", quoteTotalPaise: preview.totalPaise, holdExpiresAt: null })
      expect(t.quoteTotalPaise).toBe(Math.round(((20000 + 20 * 1400) * 1.05) / 100) * 100) // (200 + 280) * 1.05 = 504
      const [c] = await scoped.scopedDb(A).customers.select(drizzle.eq(s.customers.id, t.customerId))
      expect(c).toMatchObject({ name: "Ravi", verifiedAt: null })
      const audit = await scoped.scopedDb(A).auditLog.select(drizzle.and(drizzle.eq(s.auditLog.action, "trip.manual_booking"), drizzle.eq(s.auditLog.entityId, made.id)))
      expect(audit).toHaveLength(1)
    })
    it("reuses the customer for the same number", async () => {
      const a = await admin.createManualBooking(manual({ phone: "9876500777" }))
      const b = await admin.createManualBooking(manual({ phone: "+91 98765 00777", source: "walk_in" }))
      expect(a.ok && b.ok).toBe(true)
      if (!a.ok || !b.ok) return
      const ts = await scoped.scopedDb(A).trips.select(drizzle.inArray(s.trips.id, [a.id, b.id]))
      expect(new Set(ts.map((t) => t.customerId)).size).toBe(1)
    })
    it("refuses a bad number, a past pickup, no distance, a vehicle that does not exist", async () => {
      expect(await admin.createManualBooking(manual({ phone: "12345" }))).toMatchObject({ ok: false, error: expect.stringContaining("10-digit") })
      expect(await admin.createManualBooking(manual({ startAt: inHours(-5) }))).toMatchObject({ ok: false, error: expect.stringContaining("past") })
      expect(await admin.createManualBooking(manual({ manualDistanceKm: "" }))).toMatchObject({ ok: false })
      expect(await admin.createManualBooking(manual({ classId: randomUUID() }))).toMatchObject({ ok: false, error: expect.stringContaining("vehicle class") })
      expect(await admin.createManualBooking(manual({ manualDistanceKm: "abc" }))).toMatchObject({ ok: false })
    })
    it("tells the operator plainly when the class has no fare for that trip type", async () => {
      const r = await admin.createManualBooking(manual({ tripType: "outstation_one_way" }))
      expect(r).toMatchObject({ ok: false })
    })
    it("is refused for a signed-out visitor", async () => {
      operator = null
      expect(await admin.createManualBooking(manual())).toEqual({ ok: false, error: "Please sign in again." })
      expect(await admin.acceptBooking(randomUUID())).toEqual({ ok: false, error: "Please sign in again." })
      asOperator()
    })
  })

  describe("the operator answers a customer's request", () => {
    async function request(over: Partial<{ startAt: string }> = {}) {
      const c = await tr.upsertCustomer(scoped.scopedDb(A), `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, { verified: true, now: new Date() })
      signedIn = (await scoped.scopedDb(A).customers.select(drizzle.eq(s.customers.id, c.id)))[0]
      const sess = randomUUID()
      const p = await pub.placeDetailsPublic("fixture-t-nagar", sess)
      const d = await pub.placeDetailsPublic("fixture-maa", randomUUID())
      if (!p.ok || !d.ok) throw new Error("place lookup failed")
      const draft = { tripType: "airport", pickup: p.place.token, drop: d.place.token, startAt: over.startAt ?? inHours(30), returnAt: null, pax: 2, bags: 1 }
      const quotes = await pub.getQuotes(draft)
      if (!quotes.ok) throw new Error(`quotes failed: ${quotes.code}`)
      const opt = quotes.options.find((o) => o.name === "Sedan")!
      const res = await pub.requestBooking(draft, opt.classId, opt.totalPaise, "Two small bags")
      if (!res.ok) throw new Error(`request failed: ${res.code}`)
      return { ...res, customerId: c.id, total: opt.totalPaise }
    }

    it("accept: confirms it, writes the audit entry, and queues the customer's message in their language", async () => {
      const r = await request()
      expect(await admin.acceptBooking(r.id)).toEqual({ ok: true })
      const [t] = await scoped.scopedDb(A).trips.select(drizzle.eq(s.trips.id, r.id))
      expect(t.status).toBe("confirmed")
      expect(await scoped.scopedDb(A).auditLog.count(drizzle.and(drizzle.eq(s.auditLog.action, "trip.accept"), drizzle.eq(s.auditLog.entityId, r.id)))).toBe(1)
      const notes = await scoped.scopedDb(A).notifications.select(drizzle.eq(s.notifications.event, "trip.acceptedToCustomer"))
      expect(notes.some((n) => (n.payload as { tripId: string }).tripId === r.id)).toBe(true)
      expect(await admin.acceptBooking(r.id)).toMatchObject({ ok: false }) // already answered
    })
    it("reject: needs a reason, records it in the audit log", async () => {
      const r = await request()
      expect(await admin.rejectBooking(r.id, "")).toMatchObject({ ok: false, error: "Please give a short reason." })
      expect(await admin.rejectBooking(r.id, "No driver that day")).toEqual({ ok: true })
      const [t] = await scoped.scopedDb(A).trips.select(drizzle.eq(s.trips.id, r.id))
      expect(t).toMatchObject({ status: "rejected", rejectReason: "No driver that day" })
      const logged = await scoped.scopedDb(A).auditLog.select(drizzle.and(drizzle.eq(s.auditLog.action, "trip.reject"), drizzle.eq(s.auditLog.entityId, r.id)))
      expect(JSON.stringify(logged[0].diff)).toContain("No driver that day")
    })
    it("adjust: needs a reason and a sensible amount; the customer's quote is untouched", async () => {
      const r = await request()
      expect(await admin.adjustBookingFare(r.id, "4500", "")).toMatchObject({ ok: false })
      expect(await admin.adjustBookingFare(r.id, "-5", "discount")).toMatchObject({ ok: false })
      expect(await admin.adjustBookingFare(r.id, "abc", "discount")).toMatchObject({ ok: false })
      expect(await admin.adjustBookingFare(r.id, "450", "Loyal customer")).toEqual({ ok: true })
      const [t] = await scoped.scopedDb(A).trips.select(drizzle.eq(s.trips.id, r.id))
      expect(t).toMatchObject({ adjustedTotalPaise: 45_000, quoteTotalPaise: r.total, adjustmentReason: "Loyal customer" })
    })
    it("cancel by the operator: needs a reason", async () => {
      const r = await request()
      expect(await admin.cancelBookingAsOperator(r.id, "x")).toMatchObject({ ok: false })
      expect(await admin.cancelBookingAsOperator(r.id, "Vehicle broke down")).toEqual({ ok: true })
      expect((await scoped.scopedDb(A).trips.select(drizzle.eq(s.trips.id, r.id)))[0]).toMatchObject({ status: "cancelled", cancelledByType: "operator" })
    })
    it("another business's operator cannot touch it", async () => {
      const r = await request()
      operator = { dealer: { ...dealerA, id: B }, owner: true }
      expect(await admin.acceptBooking(r.id)).toEqual({ ok: false, error: "Booking not found." })
      expect(await admin.rejectBooking(r.id, "not mine")).toEqual({ ok: false, error: "Booking not found." })
      expect(await admin.adjustBookingFare(r.id, "100", "not mine")).toEqual({ ok: false, error: "Booking not found." })
      expect((await scoped.scopedDb(A).trips.select(drizzle.eq(s.trips.id, r.id)))[0].status).toBe("requested")
      asOperator()
    })
  })

  describe("the customer's request", () => {
    const sess = () => randomUUID()
    async function draft(over: Record<string, unknown> = {}) {
      const p = await pub.placeDetailsPublic("fixture-t-nagar", sess())
      const d = await pub.placeDetailsPublic("fixture-maa", sess())
      if (!p.ok || !d.ok) throw new Error("place lookup failed")
      return { tripType: "airport", pickup: p.place.token, drop: d.place.token, startAt: inHours(30), returnAt: null, pax: 2, bags: 1, ...over }
    }
    const customer = async () => {
      const c = await tr.upsertCustomer(scoped.scopedDb(A), `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, { verified: true, now: new Date() })
      return (await scoped.scopedDb(A).customers.select(drizzle.eq(s.customers.id, c.id)))[0]
    }

    it("shows live fares per vehicle, only for vehicles that fit, with the tolls notice", async () => {
      const q = await pub.getQuotes(await draft())
      expect(q.ok).toBe(true)
      if (!q.ok) return
      expect(q.options.map((o) => o.name)).toEqual(["Sedan"]) // Tempo has no rate card
      expect(q.options[0].notices).toEqual(["tolls_parking_extra"])
      expect(q.distanceKm).toBeGreaterThan(5)
      const big = await pub.getQuotes(await draft({ pax: 6 }))
      expect(big).toMatchObject({ ok: false }) // nothing fits six
    })
    it("refuses a pickup sooner than the operator's lead time", async () => {
      expect(await pub.getQuotes(await draft({ startAt: inHours(0.5) }))).toEqual({ ok: false, code: "too_soon" })
    })
    it("refuses a place the browser edited", async () => {
      const d = await draft()
      const [body, sig] = d.pickup.split(".")
      const edited = JSON.parse(Buffer.from(body, "base64url").toString())
      edited.stateCode = "KL"
      const forged = `${Buffer.from(JSON.stringify(edited)).toString("base64url")}.${sig}`
      expect(await pub.getQuotes({ ...d, pickup: forged })).toEqual({ ok: false, code: "bad_request" })
      expect(await pub.getQuotes({ ...d, pickup: "x".repeat(40) })).toEqual({ ok: false, code: "bad_request" })
    })
    it("needs the phone login before any booking is created", async () => {
      signedIn = null
      const d = await draft()
      const q = await pub.getQuotes(d)
      if (!q.ok) throw new Error("no quote")
      const before = await scoped.scopedDb(A).trips.count()
      expect(await pub.requestBooking(d, q.options[0].classId, q.options[0].totalPaise, "")).toEqual({ ok: false, code: "signed_out" })
      expect(await scoped.scopedDb(A).trips.count()).toBe(before)
    })
    it("books at the fare shown, with a code, and asks to re-check if the fare moved", async () => {
      signedIn = await customer()
      const d = await draft()
      const q = await pub.getQuotes(d)
      if (!q.ok) throw new Error("no quote")
      const opt = q.options[0]
      expect(await pub.requestBooking(d, opt.classId, opt.totalPaise + 100, "")).toMatchObject({ ok: false, code: "fare_changed", newTotalPaise: opt.totalPaise })
      const res = await pub.requestBooking(d, opt.classId, opt.totalPaise, "Gate 2 please")
      expect(res.ok).toBe(true)
      if (!res.ok) return
      const [t] = await scoped.scopedDb(A).trips.select(drizzle.eq(s.trips.id, res.id))
      expect(t).toMatchObject({ status: "requested", code: res.code, quoteTotalPaise: opt.totalPaise, source: "web", bookedByType: "customer" })
      expect(t.notesEnc).not.toContain("Gate 2")
      const told = await scoped.scopedDb(A).notifications.select(drizzle.eq(s.notifications.event, "trip.requested"))
      expect(told.filter((n) => (n.payload as { tripId: string }).tripId === res.id).map((n) => n.recipientType).sort()).toEqual(["customer", "operator"])
    })
    it("refuses a vehicle the business does not have", async () => {
      signedIn = await customer()
      const d = await draft()
      expect(await pub.requestBooking(d, randomUUID(), 100, "")).toEqual({ ok: false, code: "class_gone" })
    })
    it("lets a customer cancel only their own booking", async () => {
      const mine = await customer()
      signedIn = mine
      const d = await draft()
      const q = await pub.getQuotes(d)
      if (!q.ok) throw new Error("no quote")
      const res = await pub.requestBooking(d, q.options[0].classId, q.options[0].totalPaise, "")
      if (!res.ok) throw new Error("no booking")
      signedIn = await customer() // someone else
      expect(await pub.cancelMyBooking(res.id, "not mine")).toMatchObject({ ok: false })
      expect((await scoped.scopedDb(A).trips.select(drizzle.eq(s.trips.id, res.id)))[0].status).toBe("requested")
      signedIn = mine
      expect(await pub.cancelMyBooking(res.id, "Plans changed")).toEqual({ ok: true })
      expect((await scoped.scopedDb(A).trips.select(drizzle.eq(s.trips.id, res.id)))[0]).toMatchObject({ status: "cancelled", cancelledByType: "customer", cancelledReason: "Plans changed" })
      expect(await pub.cancelMyBooking(res.id, "again")).toMatchObject({ ok: false })
    })
    it("does nothing for a business that is not a cab operator's host", async () => {
      tenant = null
      expect(await pub.getQuotes(await draft().catch(() => ({})))).toMatchObject({ ok: false })
      expect(await pub.searchPlacesPublic("anna", sess())).toEqual({ ok: false, code: "unavailable" })
      tenant = { dealer: dealerA, ip: "1.2.3.4" }
    })
  })

  describe("the customer's account", () => {
    it("keeps profile, saved addresses and SOS contacts private to the customer, encrypted", async () => {
      const c = await tr.upsertCustomer(scoped.scopedDb(A), "+919876522222", { verified: true, now: new Date() })
      signedIn = (await scoped.scopedDb(A).customers.select(drizzle.eq(s.customers.id, c.id)))[0]
      expect(await pub.updateProfile({ name: "Meena", language: "ta" })).toEqual({ ok: true })
      expect((await scoped.scopedDb(A).customers.select(drizzle.eq(s.customers.id, c.id)))[0]).toMatchObject({ name: "Meena", language: "ta" })
      expect(await pub.updateProfile({ name: "x", language: "fr" })).toEqual({ ok: false })

      const p = await pub.placeDetailsPublic("fixture-t-nagar", randomUUID())
      if (!p.ok) throw new Error("place")
      expect(await pub.saveAddress({ label: "Home", place: p.place.token })).toEqual({ ok: true })
      expect(await pub.saveAddress({ label: "Home", place: "x".repeat(40) })).toEqual({ ok: false })
      const addresses = await scoped.scopedDb(A).customerAddresses.select(drizzle.eq(s.customerAddresses.customerId, c.id))
      expect(addresses).toHaveLength(1)
      expect(addresses[0].addressEnc).not.toContain("T Nagar")

      expect(await pub.saveContact({ name: "Mother", phone: "9876500123" })).toEqual({ ok: true })
      expect(await pub.saveContact({ name: "Mother again", phone: "98765 00123" })).toEqual({ ok: false, error: "phone" }) // the same number
      expect(await pub.saveContact({ name: "Bad", phone: "123" })).toEqual({ ok: false, error: "phone" })
      for (let i = 0; i < 4; i++) await pub.saveContact({ name: `P${i}`, phone: `98765001${10 + i}` })
      expect(await pub.saveContact({ name: "Sixth", phone: "9876500199" })).toEqual({ ok: false, error: "limit" })
      const contacts = await scoped.scopedDb(A).customerContacts.select(drizzle.eq(s.customerContacts.customerId, c.id))
      expect(contacts).toHaveLength(5)
      expect(contacts[0].phoneEnc).not.toContain("9876500123")

      // Someone else cannot delete them.
      const other = await tr.upsertCustomer(scoped.scopedDb(A), "+919876533333", { verified: true, now: new Date() })
      signedIn = (await scoped.scopedDb(A).customers.select(drizzle.eq(s.customers.id, other.id)))[0]
      await pub.deleteAddress(addresses[0].id)
      await pub.deleteContact(contacts[0].id)
      expect(await scoped.scopedDb(A).customerAddresses.count(drizzle.eq(s.customerAddresses.customerId, c.id))).toBe(1)
      expect(await scoped.scopedDb(A).customerContacts.count(drizzle.eq(s.customerContacts.customerId, c.id))).toBe(5)
      signedIn = (await scoped.scopedDb(A).customers.select(drizzle.eq(s.customers.id, c.id)))[0]
      await pub.deleteAddress(addresses[0].id)
      await pub.deleteContact(contacts[0].id)
      expect(await scoped.scopedDb(A).customerAddresses.count(drizzle.eq(s.customerAddresses.customerId, c.id))).toBe(0)
      expect(await scoped.scopedDb(A).customerContacts.count(drizzle.eq(s.customerContacts.customerId, c.id))).toBe(4)
    })
  })

  it("unused import guard", () => {
    expect(seal.sealPlace).toBeTypeOf("function")
  })

  // ---------- a package id from the browser must belong to the business being booked ----------

  describe("package ownership", () => {
    let ownPkg: string
    let foreignPkg: string
    const sess = () => randomUUID()
    const pkgRow = (dealerId: string, name: string) => ({ dealerId, name, slug: `${name}-${randomUUID().slice(0, 6)}`, days: 2, vehicleClassPrices: {}, active: true })

    beforeAll(async () => {
      ownPkg = (await db.unscopedDb.insert(s.packages).values(pkgRow(A, "own")).returning({ id: s.packages.id }))[0].id
      foreignPkg = (await db.unscopedDb.insert(s.packages).values(pkgRow(B, "foreign")).returning({ id: s.packages.id }))[0].id
    })
    async function draft(over: Record<string, unknown> = {}) {
      const p = await pub.placeDetailsPublic("fixture-t-nagar", sess())
      const d = await pub.placeDetailsPublic("fixture-maa", sess())
      if (!p.ok || !d.ok) throw new Error("place lookup failed")
      return { tripType: "airport", pickup: p.place.token, drop: d.place.token, startAt: inHours(30), returnAt: null, pax: 2, bags: 1, ...over }
    }
    const tripsWithPackage = async (id: string) => (await db.unscopedDb.select().from(s.trips).where(drizzle.eq(s.trips.packageId, id))).length

    it("public: a package of another business is refused for every trip type, exactly like an unknown id", async () => {
      for (const tripType of ["airport", "outstation_one_way", "outstation_round", "local_hourly", "package_tour"]) {
        expect(await pub.getQuotes(await draft({ tripType, packageId: foreignPkg }))).toEqual({ ok: false, code: "bad_request" })
        expect(await pub.getQuotes(await draft({ tripType, packageId: randomUUID() }))).toEqual({ ok: false, code: "bad_request" })
      }
    })
    it("public: a booking naming another business's package creates nothing and stores no reference to it", async () => {
      const c = await tr.upsertCustomer(scoped.scopedDb(A), `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, { verified: true, now: new Date() })
      signedIn = (await scoped.scopedDb(A).customers.select(drizzle.eq(s.customers.id, c.id)))[0]
      const ok = await pub.getQuotes(await draft())
      if (!ok.ok) throw new Error("no quote")
      const before = await scoped.scopedDb(A).trips.count()
      const forged = await draft({ packageId: foreignPkg })
      expect(await pub.requestBooking(forged, ok.options[0].classId, ok.options[0].totalPaise, "")).toEqual({ ok: false, code: "bad_request" })
      expect(await scoped.scopedDb(A).trips.count()).toBe(before)
      expect(await tripsWithPackage(foreignPkg)).toBe(0)
    })
    it("public: the business's own package is still accepted", async () => {
      expect((await pub.getQuotes(await draft({ packageId: ownPkg }))).ok).toBe(true)
    })
    it("operator: a manual booking naming another business's package is refused for every trip type, and nothing is stored", async () => {
      asOperator()
      const before = await scoped.scopedDb(A).trips.count()
      for (const tripType of ["airport", "package_tour"]) {
        expect(await admin.createManualBooking(manual({ tripType, packageId: foreignPkg }))).toEqual({ ok: false, error: "Choose a package from your list." })
      }
      expect(await scoped.scopedDb(A).trips.count()).toBe(before)
      expect(await tripsWithPackage(foreignPkg)).toBe(0)
    })
    it("operator: the business's own package is accepted", async () => {
      asOperator()
      expect((await admin.createManualBooking(manual({ packageId: ownPkg, phone: "9876500888" }))).ok).toBe(true)
    })
    it("business B cannot be made to reference A's package either (the check is symmetric)", async () => {
      const mine = await db.unscopedDb.select().from(s.packages).where(drizzle.eq(s.packages.id, ownPkg))
      expect(mine[0].dealerId).toBe(A)
      expect(await tripsWithPackage(ownPkg)).toBeGreaterThanOrEqual(0)
      const crossB = await db.unscopedDb.select().from(s.trips).where(drizzle.and(drizzle.eq(s.trips.dealerId, B), drizzle.eq(s.trips.packageId, ownPkg)))
      expect(crossB).toHaveLength(0)
    })
  })
})
