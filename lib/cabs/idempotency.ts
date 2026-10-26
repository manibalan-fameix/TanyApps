import { and, eq } from "drizzle-orm"

import { trips } from "../db/schema"
import type { ScopedDb } from "../db/scoped"
import { pgConstraint } from "./pg"

/**
 * Booking submissions are idempotent per operation key. The booking page makes one key (a UUID) for each time a customer reaches the
 * review screen and sends it with every attempt from that screen, so a double tap, a retry after a dropped connection, or a second tab
 * returns the request that already exists instead of creating another. A different route, time or a fresh visit to the review screen
 * has a different key, so intentional repeat bookings are never merged.
 *
 * A key is honoured for 24 hours; after that it is released (set to null) and may be used again. The database enforces uniqueness per
 * business and customer (trips_customer_op_key_uq), so two simultaneous requests cannot both create a trip.
 */

export const OP_KEY_TTL_MS = 24 * 3_600_000
export const OP_KEY_CONSTRAINT = "trips_customer_op_key_uq"
const OP_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The key as given if it is a UUID, else undefined (a malformed key is ignored, never an error: the booking just is not de-duplicated). */
export const cleanOperationKey = (v: unknown): string | undefined => (typeof v === "string" && OP_KEY.test(v) ? v.toLowerCase() : undefined)

/** The request this customer already made with this key within the last 24 hours, if any. An expired key is released. */
export async function findByOperationKey(db: ScopedDb, customerId: string, key: string, now: Date): Promise<{ id: string; code: string } | null> {
  const [t] = await db.trips.select(and(eq(trips.customerId, customerId), eq(trips.idempotencyKey, key)), { limit: 1 })
  if (!t) return null
  if (now.getTime() - t.createdAt.getTime() > OP_KEY_TTL_MS) {
    await db.trips.update({ idempotencyKey: null }, eq(trips.id, t.id))
    return null
  }
  return { id: t.id, code: t.code }
}

/** True when a failed insert lost the race for an operation key to a concurrent request. */
export const isOperationKeyClash = (e: unknown): boolean => pgConstraint(e) === OP_KEY_CONSTRAINT

/**
 * Runs `create` (which inserts the trip, passing the same key) at most once per operation key: an existing request is returned as is, and
 * if a concurrent request wins the database's uniqueness race this returns the winner's trip rather than failing. With no key it simply
 * creates.
 */
export async function createTripOnce(db: ScopedDb, customerId: string, key: string | undefined, now: Date, create: () => Promise<{ id: string; code: string }>): Promise<{ id: string; code: string }> {
  if (key) {
    const existing = await findByOperationKey(db, customerId, key, now)
    if (existing) return existing
  }
  try {
    return await create()
  } catch (error) {
    const winner = key && isOperationKeyClash(error) ? await findByOperationKey(db, customerId, key, now) : null
    if (!winner) throw error
    return winner
  }
}
