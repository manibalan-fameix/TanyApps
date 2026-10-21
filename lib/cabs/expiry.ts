import { istDateString } from "./time"

export type ExpiryStatus = "none" | "expired" | "soon" | "ok"

export const EXPIRY_WARNING_DAYS = 30

/** Whole days from today (IST) to a "YYYY-MM-DD" date. Negative once it has passed. */
export function daysUntil(date: string, now: Date): number {
  const a = Date.parse(`${istDateString(now)}T00:00:00Z`)
  const b = Date.parse(`${date}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/**
 * Where a document stands: "none" when it does not expire (an RC), "expired" once its last valid day has passed, "soon" within
 * 30 days (including the last valid day itself), otherwise "ok". A document is valid through the whole of its `validTill` day.
 */
export function expiryStatus(validTill: string | null | undefined, now: Date): ExpiryStatus {
  if (!validTill || !/^\d{4}-\d{2}-\d{2}$/.test(validTill)) return "none"
  const days = daysUntil(validTill, now)
  if (days < 0) return "expired"
  return days <= EXPIRY_WARNING_DAYS ? "soon" : "ok"
}

export const EXPIRY_LABEL: Record<ExpiryStatus, string> = { none: "No expiry", expired: "Expired", soon: "Expires soon", ok: "Valid" }

export type ExpiryCounts = { expired: number; soon: number }

/** Counts for a dashboard badge. */
export function countExpiry(dates: readonly (string | null | undefined)[], now: Date): ExpiryCounts {
  const out = { expired: 0, soon: 0 }
  for (const d of dates) {
    const s = expiryStatus(d, now)
    if (s === "expired") out.expired++
    else if (s === "soon") out.soon++
  }
  return out
}
