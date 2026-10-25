// Live cross-tenant test. Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database:
//   TEST_DATABASE_URL=postgres://... pnpm test
// It inserts rows (price events are immutable, so they cannot be cleaned up) and must never
// be pointed at real data.
import { eq, inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()

describe.skipIf(!url)("cross-tenant isolation (live database)", () => {
  let scopedDb: typeof import("../lib/db/scoped").scopedDb
  let TenantViolationError: typeof import("../lib/db/scoped").TenantViolationError
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  let A: string, B: string, carA: string, carB: string

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    ;({ scopedDb, TenantViolationError } = await import("../lib/db/scoped"))
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")

    const tag = Math.random().toString(36).slice(2, 8)
    const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
    const [da, db_] = await unscopedDb
      .insert(s.dealers)
      .values([
        { slug: `it-a-${tag}`, displayName: "A", theme },
        { slug: `it-b-${tag}`, displayName: "B", theme },
      ])
      .returning()
    A = da.id
    B = db_.id
    const mk = (dealerId: string, n: string) => ({ dealerId, year: 2018, shortCode: `${n}${tag}`, slug: `car-${n}-${tag}` })
    const [ca, cb] = await unscopedDb.insert(s.cars).values([mk(A, "a"), mk(B, "b")]).returning()
    carA = ca.id
    carB = cb.id
    await unscopedDb.insert(s.carMedia).values({ carId: carB, kind: "photo", r2Key: `it/${tag}` })
    await unscopedDb.insert(s.priceEvents).values({ carId: carB, event: "listed", price: 100000 })
    await unscopedDb.insert(s.leads).values({
      dealerId: B, carId: carB, name: "x", phone: "enc", source: "enquiry", consentAt: new Date(),
    })
  })

  afterAll(async () => {
    await pool?.end()
  })

  it("A sees only A's cars", async () => {
    const rows = await scopedDb(A).cars.select()
    expect(rows.map((r) => r.id)).toContain(carA)
    expect(rows.map((r) => r.id)).not.toContain(carB)
  })

  it("A cannot fetch B's car by its exact id", async () => {
    expect(await scopedDb(A).cars.select(eq(s.cars.id, carB))).toHaveLength(0)
  })

  it("A cannot read B's leads, media or price history", async () => {
    const a = scopedDb(A)
    expect(await a.leads.select()).toHaveLength(0)
    expect(await a.carMedia.select(eq(s.carMedia.carId, carB))).toHaveLength(0)
    expect(await a.priceEvents.select(eq(s.priceEvents.carId, carB))).toHaveLength(0)
  })

  it("A's update and delete on B's rows affect nothing", async () => {
    const a = scopedDb(A)
    const upd = await a.cars.update({ colour: "hacked" }, eq(s.cars.id, carB)).returning()
    expect(upd).toHaveLength(0)
    const del = await a.leads.delete(eq(s.leads.carId, carB)).returning()
    expect(del).toHaveLength(0)
    const untouched = await scopedDb(B).cars.select(eq(s.cars.id, carB))
    expect(untouched[0].colour).toBeNull()
  })

  it("A cannot attach media to B's car", async () => {
    await expect(
      scopedDb(A).carMedia.insert({ carId: carB, kind: "photo", r2Key: "evil" }),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })

  it("B still sees its own data", async () => {
    const b = scopedDb(B)
    expect(await b.cars.select(eq(s.cars.id, carB))).toHaveLength(1)
    expect(await b.leads.select()).toHaveLength(1)
    expect(await b.carMedia.select()).toHaveLength(1)
  })

  it("price_events is append-only at the database level", async () => {
    // Drizzle wraps the driver error; the trigger's message is on `cause`.
    const causeOf = async (p: PromiseLike<unknown>) => {
      try {
        await p
      } catch (e) {
        return String((e as { cause?: { message?: string } }).cause?.message ?? e)
      }
      return "NOT BLOCKED"
    }
    // Aimed at this test's own cars, so a missing trigger could never rewrite anyone else's price history.
    expect(await causeOf(unscopedDb.update(s.priceEvents).set({ price: 1 }).where(inArray(s.priceEvents.carId, [carA, carB])))).toMatch(/append-only/)
    expect(await causeOf(unscopedDb.delete(s.priceEvents).where(inArray(s.priceEvents.carId, [carA, carB])))).toMatch(/append-only/)
  })
})
