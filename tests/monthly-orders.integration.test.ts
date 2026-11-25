// Live test: the daily monthly-groceries job. Real database. Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated
// database (see docs/staging/neon-test-database.md).
import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()
const ist = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 6, 30)) // noon in India

describe.skipIf(!url)("monthly groceries job (live database)", () => {
  let run: typeof import("../lib/restaurant/monthly-orders").createMonthlyOrders
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  let dealerId: string
  let planId: string
  let itemA: string
  let itemB: string
  const tag = randomBytes(3).toString("hex")

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    vi.spyOn(console, "error").mockImplementation(() => {})
    ;({ createMonthlyOrders: run } = await import("../lib/restaurant/monthly-orders"))
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
    const { encrypt } = await import("../lib/crypto")
    const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
    const orderSettings = { monthly: { enabled: true, percentOff: 10, maxDiscount: null, freeDelivery: true }, deliveryFee: 40 }
    dealerId = (await unscopedDb.insert(s.dealers).values({ slug: `mg-${tag}`, displayName: "MG", industry: "retail", theme, orderSettings }).returning({ id: s.dealers.id }))[0].id
    ;[itemA, itemB] = (await unscopedDb.insert(s.menuItems).values([{ dealerId, name: "Rice 5kg", price: 400 }, { dealerId, name: "Oil 1L", price: 200 }]).returning({ id: s.menuItems.id })).map((r) => r.id)
    const customerId = (await unscopedDb.insert(s.customers).values({ dealerId, phoneEnc: encrypt("+919000000000"), phoneHash: `h-${tag}` }).returning({ id: s.customers.id }))[0].id
    planId = (await unscopedDb.insert(s.monthlyPlans).values({ dealerId, customerId, name: "Asha", deliveryDay: 10, address: "12 Main Road, Chennai", pincode: "600001", lastCycle: "2026-10" }).returning({ id: s.monthlyPlans.id }))[0].id
    await unscopedDb.insert(s.monthlyPlanItems).values([{ dealerId, planId, itemId: itemA, qty: 2 }, { dealerId, planId, itemId: itemB, qty: 1 }])
  })
  afterAll(async () => {
    // The shop is left behind: the stock bot writes to audit_log, which is append-only, so its dealer cannot be deleted.
    await pool.end()
  })

  const mine = () => unscopedDb.select().from(s.orders).where(eq(s.orders.dealerId, dealerId))

  it("does nothing before the delivery day", async () => {
    await run(ist(2026, 11, 9))
    expect(await mine()).toHaveLength(0)
  })

  it("creates the month's order on the day, with the subscriber offer and free delivery", async () => {
    const r = await run(ist(2026, 11, 10))
    expect(r.created).toBe(1)
    const [o] = await mine()
    expect(o).toMatchObject({ subtotal: 1000, discount: 100, deliveryFee: 0, total: 900, paymentMethod: "cod", status: "preparing", monthlyPlanId: planId, monthlyCycle: "2026-11", customerName: "Asha" })
    expect(o.note).toContain("Monthly groceries")
  })

  it("gives the order the pin of the saved address the plan uses, and none for a typed address", async () => {
    expect((await mine())[0]).toMatchObject({ latitude: null, longitude: null })
    const { encrypt } = await import("../lib/crypto")
    const { encodeAddress } = await import("../lib/restaurant/saved-address")
    const [plan] = await unscopedDb.select().from(s.monthlyPlans).where(eq(s.monthlyPlans.id, planId))
    const home = { label: "Home", house: "12", street: "Main Road, Chennai", landmark: "", pincode: "600001", lat: 13.0878, lng: 80.2785 }
    await unscopedDb.insert(s.customerAddresses).values({ dealerId, customerId: plan.customerId, label: home.label, addressEnc: encrypt(encodeAddress(home), dealerId), lat: home.lat, lng: home.lng })
    await unscopedDb.update(s.monthlyPlans).set({ address: "12, Main Road, Chennai" }).where(eq(s.monthlyPlans.id, planId))
  })

  it("never orders the same month twice, however often it runs", async () => {
    await run(ist(2026, 11, 10))
    await run(ist(2026, 11, 25))
    expect(await mine()).toHaveLength(1)
  })

  it("orders again next month", async () => {
    await run(ist(2026, 12, 10))
    expect(await mine()).toHaveLength(2)
    expect((await mine()).find((o) => o.monthlyCycle === "2026-12")).toMatchObject({ latitude: 13.0878, longitude: 80.2785 })
  })

  it("records why a delivery could not be placed and tries again later", async () => {
    await unscopedDb.update(s.menuItems).set({ isAvailable: false }).where(eq(s.menuItems.id, itemA))
    const r = await run(ist(2027, 1, 10))
    expect(r.failed).toBe(1)
    const [plan] = await unscopedDb.select().from(s.monthlyPlans).where(eq(s.monthlyPlans.id, planId))
    expect(plan.lastError).toContain("Rice 5kg")
    expect(plan.lastCycle).toBe("2026-12")
    await unscopedDb.update(s.menuItems).set({ isAvailable: true }).where(eq(s.menuItems.id, itemA))
    expect((await run(ist(2027, 1, 12))).created).toBe(1)
  })

  it("skips paused plans and shops with the offer off", async () => {
    await unscopedDb.update(s.monthlyPlans).set({ status: "paused" }).where(eq(s.monthlyPlans.id, planId))
    const before = (await mine()).length
    await run(ist(2027, 2, 10))
    expect(await mine()).toHaveLength(before)
  })
})
