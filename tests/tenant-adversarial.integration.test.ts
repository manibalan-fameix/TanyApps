// Live adversarial tests across products: two businesses with conflicting identifiers, an attacker holding business A's scope and
// business B's real ids. Complements tenant-leak.integration.test.ts (TanyMotos) with TanyEats, TanyCabs, platform tables, background jobs,
// role bypass and public/private confusion. Runs only against a DISPOSABLE migrated database (see docs/staging/neon-test-database.md).
import { randomBytes } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()
const ctxState = vi.hoisted(() => ({ ctx: null as unknown }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/core/rate-limit", () => ({ rateLimit: async () => true }))
vi.mock("@/lib/auth/context", () => ({ getDealerContext: async () => ctxState.ctx }))

describe.skipIf(!url)("cross-tenant adversarial access (live database)", () => {
  let scoped: typeof import("../lib/db/scoped")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  let trips: typeof import("../lib/cabs/trips")
  let holds: typeof import("../lib/core/jobs/expire-trip-holds")
  let session: typeof import("../lib/core/login/customer-session")
  let audit: typeof import("../lib/core/audit")
  let crypto_: typeof import("../lib/crypto")
  const tag = randomBytes(3).toString("hex")
  let n = 0
  const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
  let A: { id: string }, B: { id: string }
  const cabs = { A: {} as Record<string, string>, B: {} as Record<string, string> }
  const eats = { A: {} as Record<string, string>, B: {} as Record<string, string> }
  const SHARED_PHONE_HASH = `hash-${randomBytes(6).toString("hex")}`

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    process.env.BLIND_INDEX_KEY = randomBytes(32).toString("base64")
    process.env.AUTH_SECRET = "test-secret-" + tag
    scoped = await import("../lib/db/scoped")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
    trips = await import("../lib/cabs/trips")
    holds = await import("../lib/core/jobs/expire-trip-holds")
    session = await import("../lib/core/login/customer-session")
    audit = await import("../lib/core/audit")
    crypto_ = await import("../lib/crypto")
    const mk = async (industry: "restaurants" | "cabs") =>
      (await unscopedDb.insert(s.dealers).values({ slug: `adv-${tag}-${++n}`, displayName: `Adv ${n}`, industry, theme }).returning())[0]
    // Both businesses run BOTH products' data in this test: the point is that scope, not product, separates them.
    A = await mk("cabs")
    B = await mk("cabs")
    for (const [key, d] of [["A", A], ["B", B]] as const) {
      const db = scoped.scopedDb(d.id)
      // TanyEats
      const [cat] = await db.menuCategories.insert({ name: `Cat ${key}` }).returning({ id: s.menuCategories.id })
      const [item] = await db.menuItems.insert({ categoryId: cat.id, name: `Dish ${key}`, price: 100 } as never).returning({ id: s.menuItems.id })
      const [order] = await db.orders
        .insert({ code: `${key}${randomBytes(3).toString("hex").toUpperCase()}`.slice(0, 6), customerName: `Guest ${key}`, customerPhone: "9000000000", fulfilment: "pickup", lines: [], subtotal: 100, total: 100 } as never)
        .returning({ id: s.orders.id, code: s.orders.code })
      const [partner] = await db.deliveryPartners.insert({ name: `Rider ${key}`, phone: "9000000001", code: `R${key}`, pinHash: "x" } as never).returning({ id: s.deliveryPartners.id })
      const [coupon] = await db.coupons.insert({ code: "SAVE10", kind: "percent", value: 10 } as never).returning({ id: s.coupons.id }) // the same code in both businesses
      eats[key] = { cat: cat.id, item: item.id, order: order.id, code: order.code, partner: partner.id, coupon: coupon.id }
      // TanyCabs
      const [cls] = await db.vehicleClasses.insert({ name: "Sedan", seats: 4, bags: 2 } as never).returning({ id: s.vehicleClasses.id })
      const [cust] = await db.customers.insert({ phoneEnc: crypto_.encrypt("+919000000099"), phoneHash: SHARED_PHONE_HASH, name: `Cust ${key}`, sessionVersion: 1 } as never).returning({ id: s.customers.id })
      const [trip] = await db.trips
        .insert({
          code: `T${key}${randomBytes(2).toString("hex")}`.toUpperCase(),
          customerId: cust.id,
          tripType: "airport",
          pickup: { name: "P", address: "P", lat: 13, lng: 80 },
          startAt: new Date(Date.now() + 86_400_000),
          pax: 2,
          vehicleClassId: cls.id,
          quote: {},
          quoteTotalPaise: 100000,
          shareTokenHash: `share-${key}-${tag}`,
          status: "requested",
          holdExpiresAt: new Date(Date.now() - 60_000), // overdue: the sweep job will want it
        } as never)
        .returning({ id: s.trips.id })
      cabs[key] = { cls: cls.id, cust: cust.id, trip: trip.id }
    }
    A = { id: A.id }
    B = { id: B.id }
  })
  afterAll(async () => {
    await pool.end()
  })

  const a = () => scoped.scopedDb(A.id)
  const b = () => scoped.scopedDb(B.id)

  describe("TanyEats", () => {
    it("business A cannot read B's order by id or by its code, and sees only its own", async () => {
      expect(await a().orders.select(eq(s.orders.id, eats.B.order))).toHaveLength(0)
      expect(await a().orders.select(eq(s.orders.code, eats.B.code))).toHaveLength(0)
      expect((await a().orders.select(eq(s.orders.code, eats.A.code))).map((o) => o.id)).toEqual([eats.A.order])
    })
    it("A's updates and deletes aimed at B's order, menu, partner and coupon change nothing", async () => {
      await a().orders.update({ note: "hacked" }, eq(s.orders.id, eats.B.order))
      await a().menuItems.update({ name: "hacked" }, eq(s.menuItems.id, eats.B.item))
      await a().deliveryPartners.update({ name: "hacked" }, eq(s.deliveryPartners.id, eats.B.partner))
      await a().coupons.delete(eq(s.coupons.id, eats.B.coupon))
      await a().menuCategories.delete(eq(s.menuCategories.id, eats.B.cat))
      expect((await b().orders.select(eq(s.orders.id, eats.B.order)))[0].note).toBe("")
      expect((await b().menuItems.select(eq(s.menuItems.id, eats.B.item)))[0].name).toBe("Dish B")
      expect((await b().deliveryPartners.select(eq(s.deliveryPartners.id, eats.B.partner)))[0].name).toBe("Rider B")
      expect(await b().coupons.select(eq(s.coupons.id, eats.B.coupon))).toHaveLength(1)
      expect(await b().menuCategories.select(eq(s.menuCategories.id, eats.B.cat))).toHaveLength(1)
    })
    it("the same coupon code exists independently in both businesses", async () => {
      const mine = await a().coupons.select(eq(s.coupons.code, "SAVE10"))
      const theirs = await b().coupons.select(eq(s.coupons.code, "SAVE10"))
      expect(mine.map((c) => c.id)).toEqual([eats.A.coupon])
      expect(theirs.map((c) => c.id)).toEqual([eats.B.coupon])
    })
    it("a client-supplied dealer id in an insert or update is ignored: rows cannot be planted in or moved to another business", async () => {
      const [planted] = await a().coupons.insert({ code: `PLANT-${tag}`, kind: "percent", value: 5, dealerId: B.id } as never).returning({ id: s.coupons.id, dealerId: s.coupons.dealerId })
      expect(planted.dealerId).toBe(A.id)
      // An update that tries to change only the owner is refused outright; one that also changes a real field applies that field alone.
      expect(() => a().coupons.update({ dealerId: B.id } as never, eq(s.coupons.id, planted.id))).toThrow()
      await a().coupons.update({ value: 6, dealerId: B.id } as never, eq(s.coupons.id, planted.id))
      expect((await unscopedDb.select().from(s.coupons).where(eq(s.coupons.id, planted.id)))[0].dealerId).toBe(A.id)
    })
  })

  describe("TanyCabs", () => {
    it("the same phone is two unrelated customers in two businesses; neither sees the other's", async () => {
      const mine = await a().customers.select(eq(s.customers.phoneHash, SHARED_PHONE_HASH))
      const theirs = await b().customers.select(eq(s.customers.phoneHash, SHARED_PHONE_HASH))
      expect(mine.map((c) => c.id)).toEqual([cabs.A.cust])
      expect(theirs.map((c) => c.id)).toEqual([cabs.B.cust])
      expect(await a().customers.select(eq(s.customers.id, cabs.B.cust))).toHaveLength(0)
    })
    it("within one business the same phone cannot be registered twice", async () => {
      await expect(a().customers.insert({ phoneEnc: crypto_.encrypt("+919000000098"), phoneHash: SHARED_PHONE_HASH } as never)).rejects.toThrow()
    })
    it("A cannot cancel, move or read B's trip even holding its real id", async () => {
      expect(await a().trips.select(eq(s.trips.id, cabs.B.trip))).toHaveLength(0)
      const cancel = await scoped.scopedTransaction(A.id, (db) => trips.cancelTrip(db, cabs.B.trip, { type: "customer", id: cabs.A.cust }, "attack", cabs.A.cust))
      expect(cancel.ok).toBe(false)
      expect((await b().trips.select(eq(s.trips.id, cabs.B.trip)))[0].status).toBe("requested")
      await a().trips.update({ status: "cancelled" } as never, eq(s.trips.id, cabs.B.trip))
      expect((await b().trips.select(eq(s.trips.id, cabs.B.trip)))[0].status).toBe("requested")
    })
    it("a customer session for business A is worthless at business B (cookie and signature are bound to the business)", async () => {
      const token = await session.issueSession({ cid: cabs.A.cust, did: A.id, v: 1 })
      expect(await session.readSession(token, A.id)).not.toBeNull()
      expect(await session.readSession(token, B.id)).toBeNull()
      const { customerFromToken } = await import("../lib/core/login/customer")
      expect((await customerFromToken(A.id, token))?.id).toBe(cabs.A.cust)
      expect(await customerFromToken(B.id, token)).toBeNull()
    })
    it("a customer session that names business B's customer but was issued for A cannot read B's customer", async () => {
      const token = await session.issueSession({ cid: cabs.B.cust, did: A.id, v: 1 })
      const { customerFromToken } = await import("../lib/core/login/customer")
      expect(await customerFromToken(A.id, token)).toBeNull() // the id is scoped to A, so B's customer does not exist there
    })
  })

  describe("platform tables", () => {
    it("business membership, audit trail and notifications are per business", async () => {
      const [u] = await unscopedDb.insert(s.users).values({ name: "M", email: `m-${tag}@example.test` }).returning()
      await a().dealerUsers.insert({ userId: u.id, role: "staff" })
      expect(await b().dealerUsers.select(eq(s.dealerUsers.userId, u.id))).toHaveLength(0)
      await audit.audit(a(), { actorType: "user", actorId: u.id, action: "adv.test", entity: "thing", entityId: "1" })
      expect(await b().auditLog.select(eq(s.auditLog.action, "adv.test"))).toHaveLength(0)
      expect(await a().auditLog.select(eq(s.auditLog.action, "adv.test"))).toHaveLength(1)
      // A cannot remove B's membership either.
      await a().dealerUsers.delete(eq(s.dealerUsers.userId, u.id))
      await b().dealerUsers.delete(eq(s.dealerUsers.userId, u.id))
      expect(await a().dealerUsers.select(eq(s.dealerUsers.userId, u.id))).toHaveLength(0)
    })
    it("the scoped factory refuses anything that is not a business id", () => {
      expect(() => scoped.scopedDb("not-a-uuid")).toThrow(scoped.TenantViolationError)
      expect(() => scoped.scopedDb("' or 1=1 --")).toThrow(scoped.TenantViolationError)
    })
  })

  describe("background jobs", () => {
    it("a sweep limited to business A expires A's overdue trip and leaves B's untouched; a later sweep of B only touches B", async () => {
      const first = await holds.sweepDueHolds({ only: [A.id] })
      expect(first, JSON.stringify(first)).toMatchObject({ expired: 1 })
      expect((await a().trips.select(eq(s.trips.id, cabs.A.trip)))[0].status).not.toBe("requested")
      expect((await b().trips.select(eq(s.trips.id, cabs.B.trip)))[0].status).toBe("requested") // not in the sweep's scope
      await holds.sweepDueHolds({ only: [B.id] })
      expect((await b().trips.select(eq(s.trips.id, cabs.B.trip)))[0].status).not.toBe("requested")
      // The events each sweep wrote belong to the trip's own business.
      const aEvents = await a().tripEvents.select(eq(s.tripEvents.tripId, cabs.A.trip))
      const bEventsSeenByA = await a().tripEvents.select(eq(s.tripEvents.tripId, cabs.B.trip))
      expect(aEvents.length).toBeGreaterThan(0)
      expect(bEventsSeenByA).toHaveLength(0)
    })
  })

  describe("role bypass and product confusion", () => {
    const ctxFor = (dealer: string, role: "owner" | "staff", industry: string) => ({
      status: "ok", dealerInDb: true, role, user: { id: `u-${role}`, name: null, email: null }, dealer: { id: dealer, industry },
    })
    it("a staff member cannot change settings, payouts, prices or the team, even in their own business", async () => {
      ctxState.ctx = ctxFor(A.id, "staff", "cabs")
      const settings = await import("../app/(admin)/(shell)/settings/actions")
      const payments = await import("../app/(admin)/(shell)/settings/payments/actions")
      const team = await import("../app/(admin)/(shell)/settings/team/actions")
      const cabsAdmin = await import("../lib/cabs/admin-actions")
      expect(await settings.saveHours({})).toEqual({ ok: false, error: "Only the owner can change settings." })
      expect(await payments.connectRazorpayAccount({})).toEqual({ ok: false, error: "Only the owner can connect payouts." })
      expect(await team.inviteTeammate("x@example.test")).toEqual({ ok: false, error: "Only the owner can manage the team." })
      expect(await team.removeTeammate("any")).toEqual({ ok: false, error: "Only the owner can manage the team." })
      expect(await cabsAdmin.saveRateCard(null, {})).toEqual({ ok: false, error: "Only the owner can change prices and settings." })
    })
    it("a business of another product cannot use a product's admin actions", async () => {
      ctxState.ctx = ctxFor(A.id, "owner", "motors") // a TanyMotos business
      const cabsAdmin = await import("../lib/cabs/admin-actions")
      const eatsAdmin = await import("../lib/restaurant/admin-actions")
      const rateCard = await cabsAdmin.saveRateCard(null, {})
      expect(rateCard.ok).toBe(false)
      const refused = await eatsAdmin.createCoupon({})
      expect((refused as { ok: boolean }).ok).toBe(false)
    })
    it("an owner session for business A is bound to A: actions take the business from the session, so B's ids do nothing", async () => {
      ctxState.ctx = ctxFor(A.id, "owner", "cabs")
      const team = await import("../app/(admin)/(shell)/settings/team/actions")
      const [u] = await unscopedDb.insert(s.users).values({ name: "T", email: `t-${tag}@example.test` }).returning()
      await b().dealerUsers.insert({ userId: u.id, role: "staff" })
      expect(await team.removeTeammate(u.id)).toEqual({ ok: false, error: "That person is not on your team." })
      expect(await b().dealerUsers.select(and(eq(s.dealerUsers.userId, u.id)))).toHaveLength(1) // still B's teammate
    })
  })
})
