import { and, eq } from "drizzle-orm"

import { audit } from "../core/audit"
import { countMetric } from "../core/metrics"
import { auditLog } from "../db/schema"
import type { ScopedDb } from "../db/scoped"
import { BOOKINGS_EVENT, type BookingsUsage, monthKey } from "./limits"

/**
 * Bookings made this month (IST). Trips do not exist until Phase 2, so this is 0 for now; Phase 2 replaces this one function with
 * a count of the month's trips and everything below (the banner, the 80% and 100% events) starts working with no other change.
 */
export async function monthlyBookingCount(db: ScopedDb, now: Date): Promise<number> {
  void db
  void now
  return 0
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
