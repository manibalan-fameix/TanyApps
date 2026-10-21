import { and, count, eq, exists, inArray, type SQL } from "drizzle-orm"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"
import { z } from "zod"

import { unscopedDb, type Db } from "./client.ts"
import { CHILD_TENANT_TABLES, DIRECT_TENANT_TABLES } from "./tenant-tables.ts"
import { cars } from "./schema/index.ts"

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TenantViolationError"
  }
}

export type SelectOptions = { orderBy?: SQL[]; limit?: number; offset?: number }
/** A scoped read: awaitable, and inspectable via toSQL() for the leak tests. */
export type ScopedSelect<T extends PgTable> = PromiseLike<T["$inferSelect"][]> & {
  toSQL(): { sql: string; params: unknown[] }
}

type DirectTable = PgTable & { dealerId: AnyPgColumn }
type ChildTable = PgTable & { carId: AnyPgColumn }

export { CHILD_TENANT_TABLES, DIRECT_TENANT_TABLES }

const uuid = z.string().uuid()

function omitKey<T extends object>(obj: T, key: string): Partial<T> {
  const copy = { ...obj } as Record<string, unknown>
  delete copy[key]
  return copy as Partial<T>
}

/**
 * The ONLY way tenant and admin code touches tenant data.
 *
 * Every read, update and delete is ANDed with the dealer's scope, and every insert
 * has dealer_id forced (direct tables) or car ownership verified (child tables).
 * There is no method that takes a raw table or an unscoped where clause, and the raw
 * client is blocked from tenant code by ESLint.
 *
 * Updates and deletes require an explicit `where`, so a forgotten filter can never
 * mean "every row this dealer owns".
 */
export function scopedDb(dealerId: string, db: Db = unscopedDb) {
  if (!uuid.safeParse(dealerId).success) {
    throw new TenantViolationError("scopedDb requires a valid dealer id")
  }

  function read<T extends PgTable>(table: T, where: SQL, opts: SelectOptions = {}): ScopedSelect<T> {
    let q = db.select().from(table as PgTable).where(where).$dynamic()
    if (opts.orderBy?.length) q = q.orderBy(...opts.orderBy)
    if (opts.limit !== undefined) q = q.limit(opts.limit)
    if (opts.offset !== undefined) q = q.offset(opts.offset)
    return q as unknown as ScopedSelect<T>
  }

  const carScope = (carIdColumn: AnyPgColumn): SQL =>
    exists(
      db
        .select({ one: cars.id })
        .from(cars)
        .where(and(eq(cars.id, carIdColumn), eq(cars.dealerId, dealerId))),
    )

  function direct<T extends DirectTable>(table: T) {
    const scope = eq(table.dealerId, dealerId)
    return {
      select: (where?: SQL, opts?: SelectOptions) => read(table, and(scope, where) as SQL, opts),
      count: async (where?: SQL) => {
        const [row] = await db.select({ n: count() }).from(table as PgTable).where(and(scope, where))
        return Number(row?.n ?? 0)
      },
      insert: (values: Omit<T["$inferInsert"], "dealerId">) =>
        db.insert(table).values({ ...values, dealerId } as T["$inferInsert"]),
      // dealer_id is stripped at runtime too: a row can never be moved to another dealer.
      update: (set: Partial<Omit<T["$inferInsert"], "dealerId">>, where: SQL) =>
        db.update(table).set(omitKey(set, "dealerId") as Partial<T["$inferInsert"]>).where(and(scope, where)),
      delete: (where: SQL) => db.delete(table).where(and(scope, where)),
    }
  }

  function child<T extends ChildTable>(table: T) {
    const scope = carScope(table.carId)
    const ownedRows = async (values: T["$inferInsert"] | T["$inferInsert"][]) => {
      const rows = (Array.isArray(values) ? values : [values]) as T["$inferInsert"][]
      const carIds = [...new Set(rows.map((r) => (r as { carId: string }).carId))]
      const owned = await db
        .select({ id: cars.id })
        .from(cars)
        .where(and(eq(cars.dealerId, dealerId), inArray(cars.id, carIds)))
      if (owned.length !== carIds.length) {
        throw new TenantViolationError("Attempted to write to a car outside this dealer")
      }
      return rows
    }
    return {
      select: (where?: SQL, opts?: SelectOptions) => read(table, and(scope, where) as SQL, opts),
      count: async (where?: SQL) => {
        const [row] = await db.select({ n: count() }).from(table as PgTable).where(and(scope, where))
        return Number(row?.n ?? 0)
      },
      /** Verifies every car_id belongs to this dealer before inserting. */
      insert: async (values: T["$inferInsert"] | T["$inferInsert"][]) => {
        const rows = await ownedRows(values)
        return db.insert(table).values(rows)
      },
      /** Same ownership check, then returns the created rows. */
      insertReturning: async (values: T["$inferInsert"] | T["$inferInsert"][]): Promise<T["$inferSelect"][]> => {
        const rows = await ownedRows(values)
        return (await db.insert(table).values(rows).returning()) as T["$inferSelect"][]
      },
      // car_id is stripped at runtime too: media/views can never be re-pointed at another car.
      update: (set: Partial<Omit<T["$inferInsert"], "carId">>, where: SQL) =>
        db.update(table).set(omitKey(set, "carId") as Partial<T["$inferInsert"]>).where(and(scope, where)),
      delete: (where: SQL) => db.delete(table).where(and(scope, where)),
    }
  }

  type Direct = typeof DIRECT_TENANT_TABLES
  type Child = typeof CHILD_TENANT_TABLES
  // One scoped repository per registered table, keyed by the name it has in lib/db/tenant-tables.ts.
  const directRepos = Object.fromEntries(Object.entries(DIRECT_TENANT_TABLES).map(([name, table]) => [name, direct(table)])) as {
    [K in keyof Direct]: ReturnType<typeof direct<Direct[K]>>
  }
  const childRepos = Object.fromEntries(Object.entries(CHILD_TENANT_TABLES).map(([name, table]) => [name, child(table)])) as {
    [K in keyof Child]: ReturnType<typeof child<Child[K]>>
  }

  return { dealerId, ...directRepos, ...childRepos }
}

export type ScopedDb = ReturnType<typeof scopedDb>
