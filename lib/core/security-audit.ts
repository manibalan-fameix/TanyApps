import { unscopedDb, type Db } from "../db/client"
import { securityAuditEvents } from "../db/schema"
import { isSensitiveKey } from "./audit"
import { countMetric } from "./metrics"
import { currentRequestId } from "./request-id"
import { safeErrorMessage } from "./safe-error"

/**
 * The platform security trail (table `security_audit_events`). Two ways to record, chosen by what the event protects:
 *
 *  - recordSecurityEvent(event, handle): throws on failure. Use it INSIDE the transaction of the thing being audited (pass the
 *    transaction as `handle`), or immediately before releasing sensitive data, so that if the record cannot be written the action does
 *    not happen. This is the fail-closed mode: Tany team exports, payment exception resolutions, invitations and membership changes.
 *  - recordSecurityEventBestEffort(event): never throws, counts a metric when it fails. For events where losing the record must not
 *    break the customer or operator: sign-in attempts and other signals.
 *
 * Ordinary customer actions are NOT audited here (a customer ordering food must never depend on this table).
 * Metadata is redacted by key and capped, and never takes secrets, tokens, OTPs, payment details or exported content.
 */

export type SecurityActor = "super_admin" | "owner" | "staff" | "user" | "system" | "webhook" | "anonymous"
export type SecurityEvent = {
  actorType: SecurityActor
  actorId?: string | null
  /** The verified email of a Tany team member only. Never a customer's or business user's contact. */
  actorLabel?: string | null
  businessId?: string | null
  action: string
  targetType: string
  targetId?: string | null
  outcome: "success" | "denied" | "failed"
  requestId?: string | null
  metadata?: Record<string, unknown>
  /** Recording twice with the same key writes one row (for operations that may be retried). */
  dedupeKey?: string
}

type Handle = Pick<Db, "insert">

const MAX_STRING = 200
const MAX_JSON = 2_000

/** Drops sensitive keys, shortens long strings, keeps plain data only, and caps the total size. */
export function safeMetadata(input: Record<string, unknown> | undefined): Record<string, unknown> {
  const clean = (value: unknown, depth: number): unknown => {
    if (value === null || typeof value === "number" || typeof value === "boolean") return value
    if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value
    if (depth >= 2) return "[nested]"
    if (Array.isArray(value)) return value.slice(0, 20).map((v) => clean(v, depth + 1))
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k]) => !isSensitiveKey(k)).slice(0, 30).map(([k, v]) => [k, clean(v, depth + 1)]))
    }
    return undefined
  }
  const out = (clean(input ?? {}, 0) ?? {}) as Record<string, unknown>
  return JSON.stringify(out).length > MAX_JSON ? { truncated: true } : out
}

export async function recordSecurityEvent(event: SecurityEvent, handle: Handle = unscopedDb): Promise<void> {
  await handle
    .insert(securityAuditEvents)
    .values({
      actorType: event.actorType,
      actorId: event.actorId ?? null,
      actorLabel: event.actorLabel ?? null,
      businessId: event.businessId ?? null,
      action: event.action.slice(0, 80),
      targetType: event.targetType.slice(0, 60),
      targetId: event.targetId?.slice(0, 120) ?? null,
      outcome: event.outcome,
      requestId: event.requestId ?? (await currentRequestId()),
      metadata: safeMetadata(event.metadata),
      dedupeKey: event.dedupeKey ?? null,
    })
    .onConflictDoNothing()
}

export async function recordSecurityEventBestEffort(event: SecurityEvent, handle?: Handle): Promise<void> {
  try {
    await recordSecurityEvent(event, handle)
  } catch (error) {
    countMetric("security_audit_failed", { action: event.action.slice(0, 40) })
    console.error(`security audit record failed (${event.action}): ${safeErrorMessage(error)}`)
  }
}
