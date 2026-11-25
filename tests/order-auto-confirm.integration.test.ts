// Live test: the stock bot against a real database. Runs only when TEST_DATABASE_URL points at a disposable, migrated database.
import { randomBytes } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()

describe.skipIf(!url)("order stock bot (live database)", () => {
  let stock: typeof import("../lib/restaurant/stock-server")
  let bot: typeof import("../lib/restaurant/auto-confirm")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  let dealerId: string
  const tag = randomBytes(3).toString("hex")

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    process.env.BLIND_INDEX_KEY = randomBytes(32).toString("base64")
    stock = await import("../lib/restaurant/stock-server")
    bot = await import("../lib/restaurant/auto-confirm")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
    const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
    dealerId = (await unscopedDb.insert(s.dealers).values({ slug: `ac-${tag}`, displayName: "AC", industry: "restaurants", theme }).returning({ id: s.dealers.id }))[0].id
  })
  afterAll(async () => {
    // The shop is left behind: the stock bot writes to audit_log, which is append-only, so its dealer cannot be deleted.
    await pool.end()
  })

  async function place(stockQuantity: number | null, qty: number) {
    const [d] = await unscopedDb.insert(s.menuItems).values({ dealerId, name: `Dish ${randomBytes(3).toString("hex")}`, price: 100, stockQuantity }).returning()
    const lines = [{ itemId: d.id, name: d.name, portion: null, price: 100, qty }]
    const placed = await stock.placeOrderAtomically(dealerId, { lines, order: { customerName: "Guest", customerPhone: "+919999999999", fulfilment: "pickup", lines, subtotal: 100, total: 100, paymentMethod: "cod", status: "new" } })
    if (!placed.ok) throw new Error(placed.error)
    return { code: placed.code, itemId: d.id }
  }
  const row = async (code: string) => (await unscopedDb.select().from(s.orders).where(eq(s.orders.code, code)))[0]
  const actions = async (id: string) => (await unscopedDb.select().from(s.auditLog).where(and(eq(s.auditLog.dealerId, dealerId), eq(s.auditLog.entityId, id)))).map((a) => a.action)

  it("moves a covered order to preparing, even when it took the last units, without touching stock again", async () => {
    const o = await place(2, 2)
    expect(await bot.autoConfirmOrder(dealerId, o.code)).toEqual({ outcome: "preparing" })
    expect((await row(o.code)).status).toBe("preparing")
    expect((await unscopedDb.select().from(s.menuItems).where(eq(s.menuItems.id, o.itemId)))[0].stockQuantity).toBe(0)
    expect(await actions((await row(o.code)).id)).toEqual(["order.auto_confirmed"])
  })

  it("leaves an order as new when a dish has since been marked sold out", async () => {
    const o = await place(null, 1)
    await unscopedDb.update(s.menuItems).set({ isAvailable: false }).where(eq(s.menuItems.id, o.itemId))
    expect((await bot.autoConfirmOrder(dealerId, o.code)).outcome).toBe("held")
    expect((await row(o.code)).status).toBe("new")
    expect(await actions((await row(o.code)).id)).toEqual(["order.auto_confirm_held"])
  })

  it("acts once when run many times at once", async () => {
    const o = await place(5, 1)
    const results = await Promise.all(Array.from({ length: 5 }, () => bot.autoConfirmOrder(dealerId, o.code)))
    expect(results.filter((r) => r.outcome === "preparing")).toHaveLength(1)
    expect(await actions((await row(o.code)).id)).toEqual(["order.auto_confirmed"])
  })

  it("never revives a cancelled order", async () => {
    const o = await place(5, 1)
    await stock.cancelAndRestock(dealerId, { code: o.code }, ["new"], "cancelled")
    expect(await bot.autoConfirmOrder(dealerId, o.code)).toEqual({ outcome: "skipped" })
    expect((await row(o.code)).status).toBe("cancelled")
  })
})
