import { and, eq, inArray, isNotNull, isNull, lte, min } from "drizzle-orm"

import { sweepHolds } from "../../cabs/trips"
import { unscopedDb } from "../../db/client"
import { dealers, trips } from "../../db/schema"
import { scopedDb } from "../../db/scoped"
import { safeErrorMessage } from "../safe-error"
import type { Job } from "../scheduler"

/** At most this many businesses are swept per run; the rest wait one minute. */
export const MAX_BUSINESSES_PER_RUN = 100
/** Stop starting new businesses after this long, well inside the cron caller's 25 s limit. */
export const TIME_BUDGET_MS = 15_000
/** At most this many trips of each kind per business per run. */
export const MAX_TRIPS_PER_BUSINESS = 200

export type DueSweep = { alerted: number; expired: number; businesses: number; deferred: number; failed: number }

/**
 * The businesses that have hold work due right now, oldest-due first: a request past half its window that has not been nudged, or
 * a request or accepted booking past its deadline. Two indexed range scans (trips_hold_alert_idx, trips_hold_idx) whose cost depends
 * on how much is due, not on how many cab businesses exist.
 */
export async function businessesWithDueHolds(now: Date, limit: number, only?: string[]): Promise<string[]> {
  const scope = only ? inArray(trips.dealerId, only) : undefined
  const [alerts, expiries] = await Promise.all([
    unscopedDb
      .select({ dealerId: trips.dealerId, due: min(trips.holdAlertAt) })
      .from(trips)
      .where(and(eq(trips.status, "requested"), isNull(trips.holdAlertedAt), isNotNull(trips.holdAlertAt), lte(trips.holdAlertAt, now), scope))
      .groupBy(trips.dealerId)
      .orderBy(min(trips.holdAlertAt))
      .limit(limit),
    unscopedDb
      .select({ dealerId: trips.dealerId, due: min(trips.holdExpiresAt) })
      .from(trips)
      .where(and(inArray(trips.status, ["requested", "confirmed"]), isNotNull(trips.holdExpiresAt), lte(trips.holdExpiresAt, now), scope))
      .groupBy(trips.dealerId)
      .orderBy(min(trips.holdExpiresAt))
      .limit(limit),
  ])
  // The oldest `limit` across both lists is inside the union of each list's oldest `limit`.
  const oldest = new Map<string, number>()
  for (const r of [...alerts, ...expiries]) {
    if (!r.due) continue
    const t = r.due.getTime()
    oldest.set(r.dealerId, Math.min(oldest.get(r.dealerId) ?? t, t))
  }
  return [...oldest].sort((a, b) => a[1] - b[1]).slice(0, limit).map(([id]) => id)
}

/**
 * Sweeps only the businesses with due work, oldest first, within a business count and a time budget. Whatever does not fit is
 * still due next minute and is at the front of the queue then, so nothing starves. At least one business is always processed,
 * so a run always makes progress. Every step inside a business is the same conditional update as before.
 */
export async function sweepDueHolds(opts: { now?: () => Date; maxBusinesses?: number; budgetMs?: number; /** Only these businesses (tests share a database with other tests). */ only?: string[] } = {}): Promise<DueSweep> {
  const clock = opts.now ?? (() => new Date())
  const started = Date.now()
  const ids = await businessesWithDueHolds(clock(), opts.maxBusinesses ?? MAX_BUSINESSES_PER_RUN, opts.only)
  const out: DueSweep = { alerted: 0, expired: 0, businesses: 0, deferred: 0, failed: 0 }
  if (ids.length === 0) return out
  const contacts = new Map((await unscopedDb.select({ id: dealers.id, displayName: dealers.displayName, phone: dealers.phone }).from(dealers).where(inArray(dealers.id, ids))).map((d) => [d.id, d]))
  for (const [i, id] of ids.entries()) {
    if (i > 0 && Date.now() - started > (opts.budgetMs ?? TIME_BUDGET_MS)) {
      out.deferred = ids.length - i
      break
    }
    const b = contacts.get(id)
    if (!b) continue
    try {
      const r = await sweepHolds(scopedDb(b.id), clock(), { operatorPhone: b.phone, operatorName: b.displayName, limit: MAX_TRIPS_PER_BUSINESS })
      out.alerted += r.alerted
      out.expired += r.expired
      out.businesses++
    } catch (error) {
      // One business's problem must not stop the others from being swept.
      out.failed++
      console.error(`expire-trip-holds failed for one business: ${safeErrorMessage(error)}`)
    }
  }
  return out
}

/**
 * Keeps cab bookings honest about time. For every cab business with something due: nudges the operator when a request is half-way
 * through its answer window, and releases (expires) a request nobody answered in time or an accepted booking whose advance was not
 * paid in time. The customer is told and a trip event is written. Safe to repeat: every step is a conditional update on the
 * booking's status.
 */
export const expireTripHoldsJob: Job = {
  name: "expire-trip-holds",
  async run() {
    const r = await sweepDueHolds()
    if (r.failed > 0 && r.failed === r.businesses + r.failed) throw new Error(`every business failed (${r.failed})`)
    return `${r.alerted} reminder(s), ${r.expired} released across ${r.businesses} cab business(es) with work due${r.deferred ? `, ${r.deferred} deferred to the next run` : ""}${r.failed ? `, ${r.failed} failed` : ""}`
  },
}
