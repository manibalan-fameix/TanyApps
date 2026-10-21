import { and, eq, gte, inArray, lt } from "drizzle-orm"

import { audit } from "../core/audit"
import { countMetric } from "../core/metrics"
import { auditLog, trips } from "../db/schema"
import type { ScopedDb } from "../db/scoped"
import { BOOKINGS_EVENT, type BookingsUsage, monthKey } from "./limits"
import { COUNTED_STATUSES } from "./trip-status"

/**
 * Bookings made this month (India time): every trip created since the 1st, except ones the clock released unanswered. That is the
 * number the plan allowance counts, and what the banner and the 80% / 100% events are measured against.
 */
export async function monthlyBookingCount(db: ScopedDb, now: Date): Promise<number> {
  const [y, m] = monthKey(now).split("-").map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1) - 330 * 60_000)
  const end = new Date(Date.UTC(y, m, 1) - 330 * 60_000)
  return db.trips.count(and(gte(trips.createdAt, start), lt(trips.createdAt, end), inArray(trips.status, [...COUNTED_STATUSES])))
}

/**
 * Records, once per month and level, that the business crossed 80% or 100% of its bookings allowance, so the Tany team can see
 * who is outgrowing a plan. It writes an audit-log entry (append-only) and counts a metric. Returns whether it recorded something.
 * Calling it on every page view is fine: after the first time it only reads.
 */
export async function recordBookingsThreshold(db: ScopedDb, usage: BookingsUsage | null, now: Date): Promise<boolean> {
  if (!usage || usage.level === "ok") return false
  const action = BOOKINGS_EVENT[usage.level]
  const month = monthKey(now)
  const seen = await db.auditLog.count(and(eq(auditLog.action, action), eq(auditLog.entity, "plan"), eq(auditLog.entityId, month)))
  if (seen > 0) return false
  await audit(db, { actorType: "system", actorId: "plan-usage", action, entity: "plan", entityId: month, diff: { used: usage.used, limit: usage.limit, percent: usage.percent } })
  countMetric("cab_bookings_threshold", { level: usage.level, month })
  return true
}
