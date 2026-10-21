import type { ScopedDb } from "../db/scoped"
import type { auditLog } from "../db/schema"

type AuditActorType = (typeof auditLog.$inferInsert)["actorType"]

export type AuditEntry = {
  actorType: AuditActorType
  actorId: string
  /** Dotted verb: trip.reassign, fare.adjust, payment.refund, trip.cancel. */
  action: string
  entity: string
  entityId: string
  /** What changed. Use diffOf() so personal data is redacted. */
  diff?: Record<string, unknown>
}

/**
 * Words that mark a field as personal or secret. A key is split into words (reg_number, regNumber and REG-NUMBER all give
 * "reg" and "number") and redacted when any word is on this list, so "template" is not caught by "lat" but "pickupLat" is.
 */
const SENSITIVE_WORDS = new Set([
  "phone", "mobile", "email", "address", "licence", "license", "password", "token", "secret", "otp",
  "reg", "registration", "gstin", "pan", "aadhaar", "lat", "lng", "latitude", "longitude", "enc", "hash",
])

export function isSensitiveKey(key: string): boolean {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
  return words.some((w) => SENSITIVE_WORDS.has(w))
}
const MAX_DIFF_CHARS = 8_000

const redactValue = () => "[redacted]"

/**
 * Before/after for the fields that differ between two versions of a record, with sensitive fields reduced to "[redacted]"
 * (the log says that a phone number changed, not what it was). Both sides are plain objects, usually a row.
 */
export function diffOf(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[key]
    const b = after[key]
    if (JSON.stringify(a) === JSON.stringify(b)) continue
    out[key] = isSensitiveKey(key) ? { from: redactValue(), to: redactValue() } : { from: a ?? null, to: b ?? null }
  }
  return out
}

/** Redacts sensitive keys anywhere in a free-form diff the caller built by hand. */
export function redactDiff(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]"
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactDiff(v, depth + 1))
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, isSensitiveKey(k) ? redactValue() : redactDiff(v, depth + 1)]))
  }
  return value
}

/**
 * Appends one entry to the audit log for the dealer behind `db`. Call it with the same scoped handle (and transaction) as
 * the change it records, so the change and its record commit together or not at all. It throws if the write fails: an action
 * that must be audited should not go ahead unrecorded.
 */
export async function audit(db: ScopedDb, entry: AuditEntry): Promise<void> {
  let diff = redactDiff(entry.diff ?? {}) as Record<string, unknown>
  if (JSON.stringify(diff).length > MAX_DIFF_CHARS) diff = { truncated: true, keys: Object.keys(diff).slice(0, 50) }
  await db.auditLog.insert({
    actorType: entry.actorType,
    actorId: entry.actorId.slice(0, 100),
    action: entry.action.slice(0, 100),
    entity: entry.entity.slice(0, 60),
    entityId: entry.entityId.slice(0, 100),
    diff,
  })
}
