import { and, eq, isNull, or, sql } from "drizzle-orm"

import { unscopedDb } from "../db/client.ts"
import { usageCounters, usageEvents, usageLimits } from "../db/schema/index.ts"
import { countMetric } from "./metrics.ts"
import { safeErrorMessage } from "./safe-error.ts"

/**
 * Usage accounting for everything that costs Tany money or a provider quota, attributed to one business, one product and one feature.
 *
 *  recordUsage  : the original one-line metric (log + Analytics Engine). Still used inside meterUsage.
 *  meterUsage   : the durable path. One idempotent ledger row (`usage_events`) plus atomic day and month counters (`usage_counters`).
 *
 * Policy (docs/architecture/COST_GUARDRAILS.md):
 *  - Commercial allowances (`included_monthly`) start in OBSERVE mode: usage is measured and warned about, never blocked, until an operator
 *    switches a feature to `enforce` on the strength of real data. Nothing is enforced out of the box.
 *  - Anti-abuse ceilings (`abuse_daily`) are enforced whenever set. They are separate from the commercial allowance on purpose.
 *  - Limits are enforced inside ONE conditional upsert, so concurrent requests cannot slip past a limit (no read-then-write).
 *  - A retry that carries the same idempotency key is counted once.
 *  - Metering is never allowed to break the work it measures: if the accounting database is unreachable the call is allowed and a metric
 *    says so. (Provider-side protections and the rate limiter still apply.)
 *  - Money is an ESTIMATE (quantity x a configured unit cost); real provider charges are a separate column filled from invoices.
 */

export const USAGE_UNITS = ["llm_chat_request", "vision_ocr_request", "rc_lookup_request"] as const
export type UsageUnit = (typeof USAGE_UNITS)[number]

/** Attributes `qty` of `unit` to one business as a log line and an Analytics Engine point. No database. Never throws. */
export function recordUsage(unit: UsageUnit, dealerId: string, qty = 1): void {
  countMetric("usage", { unit, dealer: dealerId }, qty)
}

/** Every metered feature: which product it belongs to by default, who is paid, and in what unit it is counted. */
export const FEATURES = {
  llm_chat_request: { product: "motors", provider: "gemini", unit: "request" },
  llm_video_listing: { product: "motors", provider: "gemini", unit: "request" },
  vision_ocr_request: { product: "motors", provider: "gemini", unit: "request" },
  rc_lookup_request: { product: "motors", provider: "surepass", unit: "request" },
  media_upload_bytes: { product: "platform", provider: "r2", unit: "byte" },
  video_processing_seconds: { product: "motors", provider: "ffmpeg-host", unit: "second" },
  maps_places_request: { product: "cabs", provider: "google-maps", unit: "request" },
  maps_route_request: { product: "cabs", provider: "google-maps", unit: "request" },
} as const
export type FeatureKey = keyof typeof FEATURES

export type UsageInput = {
  dealerId: string
  feature: FeatureKey
  quantity?: number
  /** Same key, counted once: use it for anything that can be retried (a job, a confirmation). Omit for one-per-call work. */
  key?: string
  /** Overrides the feature's default product (for example a storefront chat for a TanyEats business). */
  product?: string
  now?: Date
}

export type UsageDecision =
  | { allowed: true; recorded: boolean; duplicate?: boolean; warning?: "soft" | "over_allowance" }
  | { allowed: false; reason: "abuse_limit" | "quota"; limit: number; used: number }

type Policy = { includedMonthly: number | null; softPct: number; abuseDaily: number | null; mode: "observe" | "enforce"; exempt: boolean; topup: number; estUnitCostMicros: number | null }

const POLICY_TTL_MS = 60_000
const policies = new Map<string, { at: number; policy: Policy }>()
/** Forget cached policy (tests, and right after an operator changes a limit). Other isolates pick a change up within a minute. */
export const clearUsagePolicyCache = () => policies.clear()

export const monthOf = (d: Date) => d.toISOString().slice(0, 7)
export const dayOf = (d: Date) => d.toISOString().slice(0, 10)

async function policyFor(dealerId: string, feature: string, now: number): Promise<Policy> {
  const key = `${dealerId}:${feature}`
  const hit = policies.get(key)
  if (hit && now - hit.at < POLICY_TTL_MS) return hit.policy
  const rows = await unscopedDb.select().from(usageLimits).where(and(eq(usageLimits.feature, feature), or(isNull(usageLimits.businessId), eq(usageLimits.businessId, dealerId))))
  const base = rows.find((r) => r.businessId === null)
  const own = rows.find((r) => r.businessId === dealerId)
  const policy: Policy = {
    includedMonthly: own?.includedMonthly ?? base?.includedMonthly ?? null,
    softPct: own?.softPct ?? base?.softPct ?? 80,
    abuseDaily: own?.abuseDaily ?? base?.abuseDaily ?? null,
    mode: (own ?? base)?.mode === "enforce" ? "enforce" : "observe",
    exempt: own?.exempt ?? base?.exempt ?? false,
    topup: own?.topupQuantity ?? 0,
    estUnitCostMicros: own?.estUnitCostMicros ?? base?.estUnitCostMicros ?? null,
  }
  policies.set(key, { at: now, policy })
  return policy
}

class Denied extends Error {
  reason: "abuse_limit" | "quota"
  limit: number
  // Explicit fields, not parameter properties: the video worker runs this under Node's strip-only TypeScript.
  constructor(reason: "abuse_limit" | "quota", limit: number) {
    super(reason)
    this.reason = reason
    this.limit = limit
  }
}

/**
 * Adds to one counter in a single statement. With a `limit`, the update applies only if the new total stays within it, so two requests
 * racing for the last unit cannot both succeed. Returns the new total, or null when the limit refused it.
 */
async function bump(tx: Pick<typeof unscopedDb, "insert">, dealerId: string, feature: string, bucket: string, quantity: number, cost: number, limit: number | null): Promise<number | null> {
  if (limit !== null && quantity > limit) return null // a first row is inserted without the update's WHERE, so check the size up front
  const rows = await tx
    .insert(usageCounters)
    .values({ businessId: dealerId, feature, bucket, quantity, estCostMicros: cost })
    .onConflictDoUpdate({
      target: [usageCounters.businessId, usageCounters.feature, usageCounters.bucket],
      set: { quantity: sql`${usageCounters.quantity} + excluded.quantity`, estCostMicros: sql`${usageCounters.estCostMicros} + excluded.est_cost_micros`, updatedAt: sql`now()` },
      ...(limit !== null ? { setWhere: sql`${usageCounters.quantity} + excluded.quantity <= ${limit}` } : {}),
    })
    .returning({ quantity: usageCounters.quantity })
  return rows.length ? Number(rows[0].quantity) : null
}

export async function meterUsage(input: UsageInput): Promise<UsageDecision> {
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1))
  const now = input.now ?? new Date()
  const def = FEATURES[input.feature]
  try {
    const policy = await policyFor(input.dealerId, input.feature, now.getTime())
    const cost = policy.estUnitCostMicros !== null ? policy.estUnitCostMicros * quantity : 0
    const dayLimit = !policy.exempt && policy.abuseDaily !== null ? policy.abuseDaily : null
    const monthLimit = !policy.exempt && policy.mode === "enforce" && policy.includedMonthly !== null ? policy.includedMonthly + policy.topup : null

    const month = await unscopedDb.transaction(async (tx) => {
      const written = await tx
        .insert(usageEvents)
        .values({ at: now, businessId: input.dealerId, product: input.product ?? def.product, feature: input.feature, provider: def.provider, unit: def.unit, quantity, estCostMicros: policy.estUnitCostMicros !== null ? cost : null, period: monthOf(now), idempotencyKey: input.key ?? null })
        .onConflictDoNothing()
        .returning({ id: usageEvents.id })
      if (written.length === 0) return "duplicate" as const
      if ((await bump(tx, input.dealerId, input.feature, `d:${dayOf(now)}`, quantity, cost, dayLimit)) === null) throw new Denied("abuse_limit", dayLimit ?? 0)
      const total = await bump(tx, input.dealerId, input.feature, `m:${monthOf(now)}`, quantity, cost, monthLimit)
      if (total === null) throw new Denied("quota", monthLimit ?? 0)
      return total
    })
    if (month === "duplicate") return { allowed: true, recorded: false, duplicate: true }

    recordUsage(input.feature as UsageUnit, input.dealerId, quantity) // the log line / Analytics Engine point, once per counted call
    return { allowed: true, recorded: true, warning: warningFor(policy, month, quantity, input) }
  } catch (error) {
    if (error instanceof Denied) {
      const used = await currentUsage(input.dealerId, input.feature, error.reason === "abuse_limit" ? `d:${dayOf(now)}` : `m:${monthOf(now)}`).catch(() => 0)
      countMetric("usage_limit_denied", { feature: input.feature, reason: error.reason })
      return { allowed: false, reason: error.reason, limit: error.limit, used }
    }
    // The accounting is down or confused: the work goes ahead. Rate limits and provider-side limits still protect it.
    countMetric("usage_metering_failed", { feature: input.feature })
    console.error(`usage metering failed (${input.feature}): ${safeErrorMessage(error)}`)
    return { allowed: true, recorded: false }
  }
}

/** Soft warning when a month crosses the warning threshold, and a one-time notice when it first passes the allowance. Each fires once per crossing. */
function warningFor(policy: Policy, monthTotal: number, quantity: number, input: UsageInput): "soft" | "over_allowance" | undefined {
  if (policy.includedMonthly === null) return undefined
  const before = monthTotal - quantity
  const soft = Math.ceil((policy.includedMonthly * policy.softPct) / 100)
  if (before <= policy.includedMonthly && monthTotal > policy.includedMonthly) {
    countMetric("usage_over_allowance", { feature: input.feature, dealer: input.dealerId, mode: policy.mode })
    return "over_allowance"
  }
  if (before < soft && monthTotal >= soft) {
    countMetric("usage_soft_limit", { feature: input.feature, dealer: input.dealerId })
    return "soft"
  }
  return undefined
}

export async function currentUsage(dealerId: string, feature: FeatureKey | string, bucket: string): Promise<number> {
  const [row] = await unscopedDb.select({ q: usageCounters.quantity }).from(usageCounters).where(and(eq(usageCounters.businessId, dealerId), eq(usageCounters.feature, feature), eq(usageCounters.bucket, bucket)))
  return row ? Number(row.q) : 0
}
