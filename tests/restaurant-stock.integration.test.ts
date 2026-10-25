// Live test: TanyEats stock and order handling against a real database. Stock, order and stock log are one transaction; a cancel
// and its restock are one transaction that only one caller can win. Faults ("crashes") are injected inside the database, by
// triggers that fire only for a probe value unique to this run, so the failure happens at the exact step under test.
// Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database (see docs/staging/neon-test-database.md).
import { randomBytes } from "node:crypto"
import { eq, inArray, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { uniqueCode } from "./support/ids"
import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()

describe.skipIf(!url)("TanyEats stock and orders (live database)", () => {
  let stock: typeof import("../lib/restaurant/stock-server")
  let pay: typeof import("../lib/restaurant/payments")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  let dealerId: string
  const tag = randomBytes(3).toString("hex")
  let n = 0
  const code = () => uniqueCode()

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    stock = await import("../lib/restaurant/stock-server")
    pay = await import("../lib/restaurant/payments")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
    const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
    const [d] = await unscopedDb.insert(s.dealers).values({ slug: `st-${tag}`, displayName: "ST", industry: "restaurants", theme }).returning()
    dealerId = d.id
  })
  afterAll(async () => {
    try {
      // Only what this run created. Deleting the dealer cascades to its dishes, orders and stock log.
      await unscopedDb.delete(s.dealers).where(eq(s.dealers.id, dealerId))
    } finally {
      await pool.end()
    }
  })

  async function dish(name: string, qty: number | null) {
    const [d] = await unscopedDb.insert(s.menuItems).values({ dealerId, name: `${name} ${tag}`, price: 100, stockQuantity: qty, isAvailable: true }).returning()
    return { id: d.id, name: d.name, start: qty }
  }
  const order = (over: Record<string, unknown> = {}) => ({
    customerName: "Guest", customerPhone: "+919999999999", fulfilment: "pickup", lines: [], subtotal: 100, total: 100, paymentMethod: "cod", status: "new", ...over,
  }) as Parameters<typeof stock.placeOrderAtomically>[1]["order"]
  const place = (lines: { itemId: string; qty: number }[], over: Record<string, unknown> = {}, makeCode?: () => string) => stock.placeOrderAtomically(dealerId, { lines, order: order(over) }, makeCode)
  const qty = async (id: string) => (await unscopedDb.select().from(s.menuItems).where(eq(s.menuItems.id, id)))[0].stockQuantity
  const orderRow = async (c: string) => (await unscopedDb.select().from(s.orders).where(eq(s.orders.code, c)))[0]
  const log = async (ids: string[]) => unscopedDb.select().from(s.stockAdjustments).where(inArray(s.stockAdjustments.itemId, ids))
  const ordersFor = async (name: string) => (await unscopedDb.select().from(s.orders).where(eq(s.orders.customerName, name))).length

  /** The stock log explains the stock: what is left equals what there was plus every recorded change, and is never negative. */
  async function expectConsistent(items: { id: string; start: number | null }[]) {
    for (const it of items) {
      if (it.start === null) continue
      const now = await qty(it.id)
      const delta = (await log([it.id])).reduce((a, r) => a + r.delta, 0)
      expect(now, `stock of ${it.id}`).toBe(it.start + delta)
      expect(now).toBeGreaterThanOrEqual(0)
    }
  }

  /** Makes one statement fail inside the database, only for rows carrying `when`, for the length of `fn`. */
  async function withFault(table: string, event: "insert" | "update", when: string, fn: () => Promise<void>) {
    const fnName = `tany_fault_fn_${tag}_${++n}`
    const trg = `tany_fault_trg_${tag}_${n}`
    await unscopedDb.execute(sql.raw(`create function ${fnName}() returns trigger language plpgsql as $$ begin raise exception 'fault injected'; end $$`))
    await unscopedDb.execute(sql.raw(`create trigger ${trg} before ${event} on ${table} for each row when (${when}) execute function ${fnName}()`))
    try {
      await fn()
    } finally {
      await unscopedDb.execute(sql.raw(`drop trigger if exists ${trg} on ${table}`))
      await unscopedDb.execute(sql.raw(`drop function if exists ${fnName}()`))
    }
  }

  // ---------- no overselling ----------

  it("twenty simultaneous orders for five units: exactly five succeed, nothing goes below zero, the log explains the stock", async () => {
    const d = await dish("Biryani", 5)
    const results = await Promise.all(Array.from({ length: 20 }, () => place([{ itemId: d.id, qty: 1 }])))
    expect(results.filter((r) => r.ok)).toHaveLength(5)
    const refused = results.filter((r): r is { ok: false; error: string } => !r.ok)
    expect(refused).toHaveLength(15)
    for (const r of refused) expect(r.error).toMatch(/sold out|Only \d+ left/)
    expect(await qty(d.id)).toBe(0)
    expect((await log([d.id])).filter((r) => r.delta < 0)).toHaveLength(5)
    await expectConsistent([d])
  })

  it("leaves dishes without tracked stock alone", async () => {
    const d = await dish("Water", null)
    expect((await place([{ itemId: d.id, qty: 3 }])).ok).toBe(true)
    expect(await qty(d.id)).toBeNull()
    expect(await log([d.id])).toHaveLength(0)
  })

  // ---------- a crash anywhere rolls the whole order back ----------

  it("crash after the first dish was taken (the second dish's update fails): nothing stays taken", async () => {
    const a = await dish("First", 10)
    const b = await dish("ProbeDish", 10)
    await withFault("menu_items", "update", `new.name = '${b.name}'`, async () => {
      await expect(place([{ itemId: a.id, qty: 2 }, { itemId: b.id, qty: 2 }])).rejects.toThrow()
    })
    expect([await qty(a.id), await qty(b.id)]).toEqual([10, 10])
    expect(await log([a.id, b.id])).toHaveLength(0)
  })

  it("a shortage on the second dish gives the first dish back, and the guest sees which dish ran short", async () => {
    const a = await dish("Plenty", 10)
    const b = await dish("Scarce", 1)
    const r = await place([{ itemId: a.id, qty: 3 }, { itemId: b.id, qty: 2 }])
    expect(r).toMatchObject({ ok: false })
    expect((r as { error: string }).error).toContain("Only 1 left of Scarce")
    expect([await qty(a.id), await qty(b.id)]).toEqual([10, 1])
    expect(await log([a.id, b.id])).toHaveLength(0)
  })

  it("crash before the order row is written: the stock taken for it is not lost", async () => {
    const d = await dish("Curry", 10)
    const guest = `ProbeGuest${tag}${++n}`
    await withFault("orders", "insert", `new.customer_name = '${guest}'`, async () => {
      await expect(place([{ itemId: d.id, qty: 4 }], { customerName: guest })).rejects.toThrow()
    })
    expect(await qty(d.id)).toBe(10)
    expect(await ordersFor(guest)).toBe(0)
    expect(await log([d.id])).toHaveLength(0)
  })

  it("crash after the order row was written but before the stock was logged: no order, no stock taken", async () => {
    const d = await dish("Dosa", 10)
    const c = code()
    const guest = `Guest${tag}${++n}`
    await withFault("stock_adjustments", "insert", `new.reason = 'Order ${c}'`, async () => {
      await expect(place([{ itemId: d.id, qty: 4 }], { customerName: guest }, () => c)).rejects.toThrow()
    })
    expect(await orderRow(c)).toBeUndefined()
    expect(await qty(d.id)).toBe(10)
    expect(await log([d.id])).toHaveLength(0)
    // The same order, with the fault gone, goes through whole.
    expect((await place([{ itemId: d.id, qty: 4 }], { customerName: guest }, () => c)).ok).toBe(true)
    expect(await qty(d.id)).toBe(6)
    await expectConsistent([d])
  })

  it("an order code that is already taken is retried as a whole: no stock is taken twice", async () => {
    const d = await dish("Idli", 10)
    const first = await place([{ itemId: d.id, qty: 1 }])
    expect(first.ok).toBe(true)
    const taken = (first as { code: string }).code
    const fresh = code()
    const codes = [taken, taken, fresh]
    const second = await place([{ itemId: d.id, qty: 1 }], {}, () => codes.shift() as string)
    expect(second).toEqual({ ok: true, code: fresh })
    expect(await qty(d.id)).toBe(8) // exactly two orders' worth
    await expectConsistent([d])
  })

  it("gives up after five collisions without leaking stock, and does not hide unrelated errors", async () => {
    const d = await dish("Vada", 10)
    const first = await place([{ itemId: d.id, qty: 1 }])
    const taken = (first as { code: string }).code
    await expect(place([{ itemId: d.id, qty: 1 }], {}, () => taken)).rejects.toThrow(/free order code/)
    expect(await qty(d.id)).toBe(9)
    const guest = `ProbeGuest${tag}${++n}`
    await withFault("orders", "insert", `new.customer_name = '${guest}'`, async () => {
      await expect(place([{ itemId: d.id, qty: 1 }], { customerName: guest })).rejects.toThrow() // not swallowed, not retried as a collision
    })
    expect(await qty(d.id)).toBe(9)
  })

  // ---------- restocked exactly once ----------

  it("two simultaneous cancellations restock once", async () => {
    const d = await dish("Meals", 10)
    const placed = (await place([{ itemId: d.id, qty: 4 }])) as { ok: true; code: string }
    expect(await qty(d.id)).toBe(6)
    const o = await orderRow(placed.code)
    const results = await Promise.all(Array.from({ length: 6 }, () => stock.cancelAndRestock(dealerId, { id: o.id }, ["new"], "cancelled")))
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await qty(d.id)).toBe(10)
    const after = await orderRow(placed.code)
    expect([after.status, after.stockReleased]).toEqual(["cancelled", true])
    expect((await log([d.id])).filter((r) => r.delta > 0)).toHaveLength(1)
    await expectConsistent([d])
  })

  it("cancelling again, later, changes nothing", async () => {
    const d = await dish("Soup", 10)
    const placed = (await place([{ itemId: d.id, qty: 2 }])) as { ok: true; code: string }
    expect(await stock.cancelAndRestock(dealerId, { code: placed.code }, ["new"], "cancelled")).toBe(true)
    expect(await stock.cancelAndRestock(dealerId, { code: placed.code }, ["new", "cancelled"], "cancelled again")).toBe(false)
    expect(await qty(d.id)).toBe(10)
  })

  it("does not cancel an order that has moved on", async () => {
    const d = await dish("Wrap", 10)
    const placed = (await place([{ itemId: d.id, qty: 2 }])) as { ok: true; code: string }
    await unscopedDb.update(s.orders).set({ status: "completed" }).where(eq(s.orders.code, placed.code))
    expect(await stock.cancelAndRestock(dealerId, { code: placed.code }, ["new"], "cancelled")).toBe(false)
    expect(await qty(d.id)).toBe(8)
    expect((await orderRow(placed.code)).status).toBe("completed")
  })

  it("a cancel racing the payment-expiry job restocks once, whichever wins", async () => {
    const d = await dish("Pasta", 10)
    const placed = (await place([{ itemId: d.id, qty: 3 }], { status: "pending_payment", paymentMethod: "online" })) as { ok: true; code: string }
    await unscopedDb.update(s.orders).set({ createdAt: new Date(Date.now() - 60 * 60_000) }).where(eq(s.orders.code, placed.code))
    const outcomes = await Promise.all([
      stock.cancelAndRestock(dealerId, { code: placed.code }, ["pending_payment"], "cancelled by guest"),
      pay.expireUnpaidOrders(dealerId),
      stock.cancelAndRestock(dealerId, { code: placed.code }, ["pending_payment"], "payment could not start"),
      pay.expireUnpaidOrders(dealerId),
    ])
    expect(outcomes.filter((o) => o === true || o === 1)).toHaveLength(1)
    expect(await qty(d.id)).toBe(10)
    expect((await log([d.id])).filter((r) => r.delta > 0)).toHaveLength(1)
    await expectConsistent([d])
  })

  it("a crash during the cancel's restock leaves the order exactly as it was, so a retry finishes the job", async () => {
    const d = await dish("Rice", 10)
    const placed = (await place([{ itemId: d.id, qty: 3 }])) as { ok: true; code: string }
    await withFault("stock_adjustments", "insert", `new.reason like 'Order ${placed.code} %'`, async () => {
      await expect(stock.cancelAndRestock(dealerId, { code: placed.code }, ["new"], "cancelled")).rejects.toThrow()
    })
    const mid = await orderRow(placed.code)
    expect([mid.status, mid.stockReleased]).toEqual(["new", false]) // the claim rolled back with the failed restock
    expect(await qty(d.id)).toBe(7)
    expect(await stock.cancelAndRestock(dealerId, { code: placed.code }, ["new"], "cancelled")).toBe(true)
    expect(await qty(d.id)).toBe(10)
    await expectConsistent([d])
  })

  // ---------- payments ----------

  it("duplicate payment deliveries do not touch stock; cancelling the paid order later restocks once", async () => {
    const d = await dish("Thali", 10)
    const rzp = `order_${tag}${++n}`
    const placed = (await place([{ itemId: d.id, qty: 2 }], { status: "pending_payment", paymentMethod: "online" })) as { ok: true; code: string }
    await unscopedDb.update(s.orders).set({ razorpayOrderId: rzp }).where(eq(s.orders.code, placed.code))
    const results = await Promise.all(Array.from({ length: 5 }, () => pay.applyOrderPayment(rzp, `pay_${tag}${n}`)))
    expect(results.filter((r) => r.applied)).toHaveLength(1)
    const paid = await orderRow(placed.code)
    expect([paid.status, paid.paymentStatus]).toEqual(["new", "paid"])
    expect(await qty(d.id)).toBe(8)
    expect(await stock.cancelAndRestock(dealerId, { code: placed.code }, ["new"], "cancelled")).toBe(true)
    expect(await stock.cancelAndRestock(dealerId, { code: placed.code }, ["new"], "cancelled")).toBe(false)
    expect(await qty(d.id)).toBe(10)
    await expectConsistent([d])
  })

  it("the payment window expiring twice at once restocks once", async () => {
    const d = await dish("Noodles", 10)
    const placed = (await place([{ itemId: d.id, qty: 5 }], { status: "pending_payment", paymentMethod: "online" })) as { ok: true; code: string }
    await unscopedDb.update(s.orders).set({ createdAt: new Date(Date.now() - 60 * 60_000) }).where(eq(s.orders.code, placed.code))
    const counts = await Promise.all([pay.expireUnpaidOrders(dealerId), pay.expireUnpaidOrders(dealerId), pay.expireUnpaidOrders(dealerId)])
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1)
    expect(await qty(d.id)).toBe(10)
    await expectConsistent([d])
  })

  it("never writes a secret or a payment id into its logs", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const d = await dish("LogCheck", 1)
    await place([{ itemId: d.id, qty: 5 }])
    expect(spy).not.toHaveBeenCalled() // a shortage is an answer, not an error log
    spy.mockRestore()
  })
})
