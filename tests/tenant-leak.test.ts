import { eq, getTableColumns, is, type SQL } from "drizzle-orm"
import { PgTable } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { TenantViolationError, scopedDb } from "../lib/db/scoped"
import { CHILD_TENANT_TABLES, DIRECT_TENANT_TABLES, GLOBAL_TABLES } from "../lib/db/tenant-tables"
import * as schema from "../lib/db/schema"
import type { Db } from "../lib/db/client"

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const SOME_ID = "33333333-3333-4333-8333-333333333333"

const a = scopedDb(A)

// One harmless column to update per scoped table. A table in the registry without an entry here fails the test below, so
// nobody can register a table and skip proving that its update is scoped.
const UPDATE_PAYLOAD: Record<string, object> = {
  cars: { colour: "red" },
  leads: { name: "x" },
  bookings: { buyerName: "x" },
  dealerUsers: { role: "staff" },
  menuCategories: { name: "x" },
  menuItems: { name: "x" },
  orders: { note: "x" },
  coupons: { code: "x" },
  reviews: { name: "x" },
  enquiries: { name: "x" },
  banners: { title: "x" },
  deliveryPartners: { name: "x" },
  deliveryZones: { name: "x" },
  stockAdjustments: { reason: "x" },
  orderLocations: { lat: 1 },
  dealerDomains: { hostname: "x.example" },
  carMedia: { r2Key: "k" },
  rcLookups: { provider: "p" },
  carViews: { referrer: "r" },
  rcTransfers: { notes: "n" },
  priceEvents: { price: 1 },
}

type Buildable = { toSQL(): { sql: string; params: unknown[] } }

function assertScopedTo(query: { toSQL(): { sql: string; params: unknown[] } }, dealer: string, other: string) {
  const { sql, params } = query.toSQL()
  expect(sql).toMatch(/"dealer_id" = \$\d+/)
  expect(params).toContain(dealer)
  expect(params).not.toContain(other)
}

describe("scopedDb: every operation carries the dealer scope", () => {
  const direct = Object.keys(DIRECT_TENANT_TABLES) as (keyof typeof DIRECT_TENANT_TABLES)[]
  const child = Object.keys(CHILD_TENANT_TABLES) as (keyof typeof CHILD_TENANT_TABLES)[]

  it("has an update payload for every registered table", () => {
    for (const name of [...direct, ...child]) expect(UPDATE_PAYLOAD, `missing UPDATE_PAYLOAD.${name}`).toHaveProperty(name)
  })

  for (const name of [...direct, ...child]) {
    const repo = a[name]
    const table = { ...DIRECT_TENANT_TABLES, ...CHILD_TENANT_TABLES }[name]
    const anyCol = Object.values(getTableColumns(table))[0]

    it(`${name}.select with no filter is still scoped`, () => {
      assertScopedTo(repo.select(), A, B)
    })
    it(`${name}.select with a caller filter keeps the scope (AND, not replaced)`, () => {
      const q = repo.select(eq(anyCol, SOME_ID))
      assertScopedTo(q, A, B)
      expect(q.toSQL().sql).toContain(" and ")
    })
    it(`${name}.update is scoped in its WHERE clause`, () => {
      const q = (repo.update as (set: object, where: SQL) => { toSQL(): { sql: string; params: unknown[] } })(
        UPDATE_PAYLOAD[name],
        eq(anyCol, SOME_ID),
      )
      const { sql, params } = q.toSQL()
      expect(sql.slice(sql.indexOf(" where "))).toMatch(/"dealer_id" = \$\d+/)
      expect(params).toContain(A)
    })
    it(`${name}.delete is scoped`, () => {
      assertScopedTo(repo.delete(eq(anyCol, SOME_ID)), A, B)
    })
  }

  it("a scoped instance for B never carries A's id", () => {
    const b = scopedDb(B)
    assertScopedTo(b.cars.select(), B, A)
    assertScopedTo(b.leads.select(), B, A)
    assertScopedTo(b.carMedia.select(), B, A)
  })

  it("direct insert cannot override dealer_id", () => {
    const q = a.cars.insert({ dealerId: B, year: 2017, shortCode: "abc12", slug: "x" } as never)
    const { params } = q.toSQL()
    expect(params).toContain(A)
    expect(params).not.toContain(B)
  })

  it("update cannot move a row to another dealer", () => {
    const q = (a.cars.update as (set: object, where: SQL) => Buildable)({ dealerId: B, colour: "red" }, eq(schema.cars.id, SOME_ID))
    expect(q.toSQL().params).not.toContain(B)
  })

  it("update cannot re-point child rows at another car", () => {
    const q = (a.carMedia.update as (set: object, where: SQL) => Buildable)({ carId: B, r2Key: "k" }, eq(schema.carMedia.id, SOME_ID))
    expect(q.toSQL().params).not.toContain(B)
  })

  it("child insert refuses cars owned by another dealer", async () => {
    // Stub: the ownership lookup finds nothing, as it would for another dealer's car.
    const stub = { select: () => ({ from: () => ({ where: async () => [] }) }) } as unknown as Db
    const scoped = scopedDb(A, stub)
    await expect(
      scoped.carMedia.insert({ carId: SOME_ID, kind: "photo", r2Key: "k" }),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })

  it("child insertReturning refuses cars owned by another dealer", async () => {
    const stub = { select: () => ({ from: () => ({ where: async () => [] }) }) } as unknown as Db
    await expect(
      scopedDb(A, stub).carMedia.insertReturning({ carId: SOME_ID, kind: "photo", r2Key: "k" }),
    ).rejects.toBeInstanceOf(TenantViolationError)
  })

  it("rejects a malformed dealer id", () => {
    expect(() => scopedDb("not-a-uuid")).toThrow(TenantViolationError)
    expect(() => scopedDb("")).toThrow(TenantViolationError)
  })
})

describe("registry: no tenant table can be added without being scoped", () => {
  const tables = Object.values(schema).filter((v) => is(v, PgTable)) as unknown as PgTable[]
  const directSet = new Set<unknown>(Object.values(DIRECT_TENANT_TABLES))
  const childSet = new Set<unknown>(Object.values(CHILD_TENANT_TABLES))
  const globalSet = new Set<unknown>(Object.values(GLOBAL_TABLES))

  it("finds the schema tables", () => {
    expect(tables.length).toBeGreaterThan(10)
  })

  for (const table of tables) {
    const cols = Object.keys(getTableColumns(table))
    const label = (table as unknown as Record<symbol, string>)[Symbol.for("drizzle:Name")]
    if (cols.includes("dealerId")) {
      it(`${label} has dealer_id, so it must be a direct tenant table`, () => {
        expect(directSet.has(table)).toBe(true)
      })
    } else if (cols.includes("carId")) {
      it(`${label} has car_id, so it must be a child tenant table`, () => {
        expect(childSet.has(table)).toBe(true)
      })
    } else {
      it(`${label} has no dealer_id or car_id, so it must be declared global`, () => {
        expect(globalSet.has(table), `${label} is neither tenant-scoped nor in GLOBAL_TABLES`).toBe(true)
      })
    }
  }
})
