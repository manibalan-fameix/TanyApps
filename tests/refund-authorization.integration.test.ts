// Live test: who may refund. The real server actions, called with a mocked signed-in session (owner, staff, an owner of a DIFFERENT
// business), against a real database and a MOCKED Razorpay. Authorization is enforced on the server before anything changes.
// Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database (see docs/staging/neon-test-database.md).
import { randomBytes } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { createFakeRazorpay } from "./support/fake-razorpay"
import { uniqueCode } from "./support/ids"
import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/core/rate-limit", () => ({ rateLimit: async () => true }))
const session = vi.hoisted(() => ({ current: null as null | { role: "owner" | "staff"; userId: string; dealer: { id: string; industry: string } } }))
vi.mock("@/lib/auth/context", () => ({
  getDealerContext: async () => (session.current ? { status: "ok", dealerInDb: true, role: session.current.role, user: { id: session.current.userId }, dealer: session.current.dealer } : { status: "anonymous" }),
}))

describe.skipIf(!url)("refund authorization (live database, mocked Razorpay)", () => {
  const rz = createFakeRazorpay()
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  let motors: typeof import("../app/(admin)/(shell)/cars/[id]/actions")
  let eats: typeof import("../lib/restaurant/admin-actions")
  let team: typeof import("../app/(admin)/(shell)/settings/team/actions")
  let scoped: typeof import("../lib/db/scoped")
  let A: string, B: string, R: string, R2: string
  const tag = randomBytes(3).toString("hex")
  let n = 0
  const as = (role: "owner" | "staff", dealerId: string, industry: string) => void (session.current = { role, userId: `u-${role}-${dealerId.slice(0, 4)}`, dealer: { id: dealerId, industry } })

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc"
    process.env.RAZORPAY_KEY_SECRET = "secret"
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
    scoped = await import("../lib/db/scoped")
    motors = await import("../app/(admin)/(shell)/cars/[id]/actions")
    eats = await import("../lib/restaurant/admin-actions")
    team = await import("../app/(admin)/(shell)/settings/team/actions")
    const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
    const mk = (slug: string, industry: "motors" | "restaurants") => ({ slug: `${slug}-${tag}`, displayName: slug, industry, theme, razorpayAccountId: "acc_test", razorpayAccountStatus: "activated" })
    ;[A, B, R, R2] = (await unscopedDb.insert(s.dealers).values([mk("ra-a", "motors"), mk("ra-b", "motors"), mk("ra-r", "restaurants"), mk("ra-r2", "restaurants")]).returning({ id: s.dealers.id })).map((r) => r.id)
  })
  afterAll(async () => {
    await pool.end()
  })
  beforeEach(() => {
    rz.reset()
    rz.install()
    vi.spyOn(console, "error").mockImplementation(() => {})
    session.current = null
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  async function paidBooking(dealer = A) {
    n++
    const [car] = await unscopedDb.insert(s.cars).values({ dealerId: dealer, year: 2018, status: "on_hold", shortCode: uniqueCode(), slug: `ra-${tag}-${n}` }).returning()
    const [b] = await unscopedDb.insert(s.bookings).values({ dealerId: dealer, carId: car.id, buyerName: "Buyer", buyerPhone: "enc", amount: 5000, razorpayOrderId: `order_${tag}${n}`, razorpayPaymentId: `pay_${tag}${n}`, status: "paid", paidAt: new Date() }).returning()
    return b
  }
  async function paidOrder(dealer = R, over: Record<string, unknown> = {}) {
    n++
    const [o] = await unscopedDb
      .insert(s.orders)
      .values({ dealerId: dealer, code: uniqueCode(), customerName: "Guest", customerPhone: "+919999999999", fulfilment: "pickup", lines: [], subtotal: 250, total: 250, paymentMethod: "online", paymentStatus: "paid", paidAt: new Date(), status: "new", razorpayOrderId: `order_${tag}${n}`, razorpayPaymentId: `pay_${tag}${n}`, ...over })
      .returning()
    return o
  }
  const booking = async (id: string) => (await unscopedDb.select().from(s.bookings).where(eq(s.bookings.id, id)))[0]
  const order = async (id: string) => (await unscopedDb.select().from(s.orders).where(eq(s.orders.id, id)))[0]
  const audits = async (dealer: string, entityId: string, action: string) => scoped.scopedDb(dealer).auditLog.select(and(eq(s.auditLog.entityId, entityId), eq(s.auditLog.action, action)))

  describe("TanyMotos booking refunds", () => {
    it("staff cannot refund: refused on the server, nothing changes, Razorpay is never called, nothing is recorded", async () => {
      const b = await paidBooking()
      as("staff", A, "motors")
      expect(await motors.refundBooking(b.id)).toEqual({ ok: false, error: "Only the owner can refund a payment." })
      const after = await booking(b.id)
      expect([after.status, after.refundReason, after.refundId]).toEqual(["paid", null, null])
      expect(rz.state.posts).toBe(0)
      expect(await audits(A, b.id, "payment.refund")).toHaveLength(0)
    })
    it("the owner can", async () => {
      const b = await paidBooking()
      as("owner", A, "motors")
      expect(await motors.refundBooking(b.id)).toEqual({ ok: true, refund: "pending" })
      expect(rz.state.refunds).toHaveLength(1)
      expect((await audits(A, b.id, "payment.refund"))[0]).toMatchObject({ actorType: "user", actorId: expect.stringContaining("u-owner") })
    })
    it("an owner of ANOTHER business cannot refund this business's booking, by its real id", async () => {
      const b = await paidBooking(A)
      as("owner", B, "motors")
      expect(await motors.refundBooking(b.id)).toEqual({ ok: false, error: "Booking not found." })
      expect((await booking(b.id)).status).toBe("paid")
      expect(rz.state.posts).toBe(0)
    })
    it("forged, malformed or empty ids are refused without touching the database or Razorpay", async () => {
      as("owner", A, "motors")
      for (const id of ["", "not-a-uuid", "' OR 1=1 --", "00000000-0000-0000-0000-000000000000", "../../etc/passwd"]) {
        expect(await motors.refundBooking(id)).toEqual({ ok: false, error: "Booking not found." })
      }
      expect(rz.state.posts).toBe(0)
    })
    it("signed out is refused", async () => {
      const b = await paidBooking()
      session.current = null
      expect(await motors.refundBooking(b.id)).toEqual({ ok: false, error: "Please sign in again." })
      expect(rz.state.posts).toBe(0)
    })
    it("the page offers the refund button only to the owner", () => {
      const perms = import("../lib/core/permissions")
      return perms.then((p) => {
        expect([p.canRefund("owner"), p.canRefund("staff"), p.canRefund(undefined), p.canRefund(null)]).toEqual([true, false, false, false])
      })
    })
  })

  describe("TanyEats: cancelling a paid online order refunds the guest", () => {
    it("staff cannot: refused before anything changes (order, stock and money untouched)", async () => {
      const o = await paidOrder()
      as("staff", R, "restaurants")
      expect(await eats.setOrderStatus(o.id, "cancelled")).toEqual({ ok: false, error: "Only the owner can refund a payment." })
      const after = await order(o.id)
      expect([after.status, after.paymentStatus, after.stockReleased, after.refundId]).toEqual(["new", "paid", false, null])
      expect(rz.state.posts).toBe(0)
      expect(await audits(R, o.id, "payment.refund")).toHaveLength(0)
    })
    it("staff can still cancel an order that has no online payment to return, and run the kitchen as before", async () => {
      const cod = await paidOrder(R, { paymentMethod: "cod", paymentStatus: "pending", razorpayPaymentId: null, razorpayOrderId: null })
      as("staff", R, "restaurants")
      expect(await eats.setOrderStatus(cod.id, "cancelled")).toEqual({ ok: true })
      const online = await paidOrder()
      expect(await eats.setOrderStatus(online.id, "confirmed")).toEqual({ ok: true })
      expect(rz.state.posts).toBe(0)
    })
    it("the owner can: the guest is refunded once, the order is cancelled, and who did it is on record", async () => {
      const o = await paidOrder()
      as("owner", R, "restaurants")
      expect(await eats.setOrderStatus(o.id, "cancelled")).toEqual({ ok: true })
      const after = await order(o.id)
      expect([after.status, after.paymentStatus, after.refundStatus]).toEqual(["cancelled", "refunded", "pending"]) // pending until Razorpay says processed
      expect(rz.state.refunds.map((r) => r.payment_id)).toEqual([o.razorpayPaymentId])
      expect((await audits(R, o.id, "payment.refund"))[0]).toMatchObject({ actorType: "user" })
    })
    it("an owner of another business cannot cancel or refund this business's order", async () => {
      const o = await paidOrder(R)
      as("owner", R2, "restaurants")
      expect(await eats.setOrderStatus(o.id, "cancelled")).toEqual({ ok: false, error: "Order not found." })
      expect((await order(o.id)).status).toBe("new")
      expect(rz.state.posts).toBe(0)
    })
    it("a forged order id or an unknown status is refused", async () => {
      as("owner", R, "restaurants")
      expect(await eats.setOrderStatus("nope", "cancelled")).toEqual({ ok: false, error: "Order not found." })
      expect(await eats.setOrderStatus((await paidOrder()).id, "refund_everything")).toEqual({ ok: false, error: "Order not found." })
    })
  })

  describe("changes to who has access are on record", () => {
    it("removing a teammate is audited with the owner who did it, and staff cannot do it", async () => {
      const [u] = await unscopedDb.insert(s.users).values({ name: "Staffer", email: `st-${tag}@example.com`, phone: `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}` }).returning({ id: s.users.id })
      await scoped.scopedDb(A).dealerUsers.insert({ userId: u.id, role: "staff" })
      as("staff", A, "motors")
      expect(await team.removeTeammate(u.id)).toEqual({ ok: false, error: "Only the owner can manage the team." })
      expect((await scoped.scopedDb(A).dealerUsers.select(eq(s.dealerUsers.userId, u.id))).length).toBe(1)
      as("owner", A, "motors")
      expect(await team.removeTeammate(u.id)).toEqual({ ok: true })
      expect(await audits(A, u.id, "team.remove_staff")).toHaveLength(1)
    })
  })
})
