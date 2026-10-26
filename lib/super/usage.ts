import { and, desc, eq, inArray, sql, sum } from "drizzle-orm"

import { FEATURES, clearUsagePolicyCache, dayOf, monthOf } from "../core/usage.ts"
import { recordSecurityEvent } from "../core/security-audit"
import { unscopedDb as db } from "../db/client"
import { dealers, usageCounters, usageEvents, usageLimits } from "../db/schema"
import { requireSuperAdmin, superAdminActor } from "./guard"

/** Cost visibility for the Tany team. Estimates only: provider invoices are a separate column, never blended in. */

export type UsageOverview = {
  period: string
  /** Estimated cost so far this period, in micro-rupees, and a straight-line projection to month end (null before any unit cost is configured). */
  estMicros: number
  projectedMicros: number | null
  byProduct: { product: string; feature: string; quantity: number; estMicros: number }[]
  topTenants: { businessId: string; name: string; feature: string; quantity: number; estMicros: number }[]
  utilization: { businessId: string; name: string; feature: string; used: number; included: number; pct: number; mode: string }[]
  abnormal: { businessId: string; name: string; feature: string; today: number; avg7: number; ratio: number }[]
}

const ABNORMAL_RATIO = 3
/** What counts as "enough to notice" depends on the unit: 20 requests, an hour of processing, 100 MB. A flat number would flag every tiny upload. */
const ABNORMAL_MIN_BY_UNIT: Record<string, number> = { request: 20, second: 3_600, byte: 100 * 1024 * 1024 }
/** At most this many flagged businesses per feature, so one chatty feature cannot push every other feature's anomalies out of the list. */
const ABNORMAL_PER_FEATURE = 5

export async function loadUsageOverview(now = new Date()): Promise<UsageOverview> {
  await requireSuperAdmin()
  const period = monthOf(now)
  const [byProductRows, tenantRows, limitRows, monthCounters, dayCounters] = await Promise.all([
    db
      .select({ product: usageEvents.product, feature: usageEvents.feature, quantity: sum(usageEvents.quantity), est: sum(usageEvents.estCostMicros) })
      .from(usageEvents)
      .where(eq(usageEvents.period, period))
      .groupBy(usageEvents.product, usageEvents.feature)
      .orderBy(desc(sql`coalesce(sum(${usageEvents.estCostMicros}), 0)`), desc(sum(usageEvents.quantity))),
    db
      .select({ businessId: usageEvents.businessId, name: dealers.displayName, feature: usageEvents.feature, quantity: sum(usageEvents.quantity), est: sum(usageEvents.estCostMicros) })
      .from(usageEvents)
      .innerJoin(dealers, eq(dealers.id, usageEvents.businessId))
      .where(eq(usageEvents.period, period))
      .groupBy(usageEvents.businessId, dealers.displayName, usageEvents.feature)
      .orderBy(desc(sql`coalesce(sum(${usageEvents.estCostMicros}), 0)`), desc(sum(usageEvents.quantity)))
      .limit(20),
    db.select().from(usageLimits),
    db.select().from(usageCounters).where(eq(usageCounters.bucket, `m:${period}`)).limit(5000),
    db
      .select()
      .from(usageCounters)
      .where(inArray(usageCounters.bucket, [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `d:${dayOf(new Date(now.getTime() - i * 86_400_000))}`)))
      .limit(10_000),
  ])

  const names = new Map((await db.select({ id: dealers.id, name: dealers.displayName }).from(dealers).where(inArray(dealers.id, [...new Set([...monthCounters, ...dayCounters].map((c) => c.businessId))].slice(0, 2000)))).map((d) => [d.id, d.name]))
  const num = (v: string | number | null) => Number(v ?? 0)

  const byProduct = byProductRows.map((r) => ({ product: r.product, feature: r.feature, quantity: num(r.quantity), estMicros: num(r.est) }))
  const estMicros = byProduct.reduce((a, r) => a + r.estMicros, 0)
  const dayOfMonth = now.getUTCDate()
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()

  const defaults = new Map(limitRows.filter((l) => l.businessId === null).map((l) => [l.feature, l]))
  const own = new Map(limitRows.filter((l) => l.businessId !== null).map((l) => [`${l.businessId}:${l.feature}`, l]))
  const utilization = monthCounters
    .flatMap((c) => {
      const l = own.get(`${c.businessId}:${c.feature}`)
      const included = l?.includedMonthly ?? defaults.get(c.feature)?.includedMonthly ?? null
      if (included === null || included <= 0) return []
      const mode = (l ?? defaults.get(c.feature))?.mode ?? "observe"
      return [{ businessId: c.businessId, name: names.get(c.businessId) ?? c.businessId.slice(0, 8), feature: c.feature, used: num(c.quantity), included, pct: Math.round((num(c.quantity) / included) * 100), mode }]
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 20)

  const today = dayOf(now)
  const history = new Map<string, number[]>()
  const todayQty = new Map<string, number>()
  for (const c of dayCounters) {
    const key = `${c.businessId}|${c.feature}`
    if (c.bucket === `d:${today}`) todayQty.set(key, num(c.quantity))
    else history.set(key, [...(history.get(key) ?? []), num(c.quantity)])
  }
  const abnormal = [...todayQty]
    .flatMap(([key, qty]) => {
      const past = history.get(key) ?? []
      const avg7 = past.reduce((a, b) => a + b, 0) / 7 // days with no use count as zero
      const ratio = qty / Math.max(avg7, 1)
      const [businessId, feature] = key.split("|")
      const min = ABNORMAL_MIN_BY_UNIT[FEATURES[feature as keyof typeof FEATURES]?.unit ?? "request"] ?? 20
      return qty >= min && ratio >= ABNORMAL_RATIO ? [{ businessId, name: names.get(businessId) ?? businessId.slice(0, 8), feature, today: qty, avg7: Math.round(avg7 * 10) / 10, ratio: Math.round(ratio * 10) / 10 }] : []
    })
    .sort((a, b) => b.ratio - a.ratio)
    .filter(((seen: Map<string, number>) => (row: { feature: string }) => {
      const n = (seen.get(row.feature) ?? 0) + 1
      seen.set(row.feature, n)
      return n <= ABNORMAL_PER_FEATURE
    })(new Map()))
    .slice(0, 30)

  return {
    period,
    estMicros,
    projectedMicros: estMicros > 0 ? Math.round((estMicros / dayOfMonth) * daysInMonth) : null,
    byProduct,
    topTenants: tenantRows.map((r) => ({ businessId: r.businessId, name: r.name, feature: r.feature, quantity: num(r.quantity), estMicros: num(r.est) })),
    utilization,
    abnormal,
  }
}

export type LimitInput = {
  /** A business id, or null for the platform default of this feature. */
  businessId: string | null
  feature: string
  includedMonthly?: number | null
  softPct?: number
  abuseDaily?: number | null
  mode?: "observe" | "enforce"
  exempt?: boolean
  topupQuantity?: number
  estUnitCostMicros?: number | null
  note?: string
}

const intOrNull = (v: unknown, max = 1_000_000_000_000) => (v === null || v === undefined ? null : Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : NaN)

/**
 * Sets one limit row (the platform default for a feature, or one business's override). Tany team only. The change and its record in the
 * security trail commit together; the trail holds the new numeric values and who changed them, never free text.
 * Switching a feature to `enforce` is a deliberate commercial decision and is recorded as such.
 */
export async function saveUsageLimit(input: LimitInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await superAdminActor()
  if (!(input.feature in FEATURES)) return { ok: false, error: "Unknown feature." }
  if (input.businessId !== null && !/^[0-9a-f-]{36}$/i.test(input.businessId)) return { ok: false, error: "Not a business id." }
  const included = intOrNull(input.includedMonthly)
  const abuse = intOrNull(input.abuseDaily)
  const topup = intOrNull(input.topupQuantity ?? 0)
  const unit = intOrNull(input.estUnitCostMicros)
  const soft = input.softPct ?? 80
  if ([included, abuse, topup, unit].some((v) => Number.isNaN(v)) || !Number.isInteger(soft) || soft < 1 || soft > 100) return { ok: false, error: "Check the numbers." }
  if (input.mode && input.mode !== "observe" && input.mode !== "enforce") return { ok: false, error: "Mode is observe or enforce." }

  await db.transaction(async (tx) => {
    const where = input.businessId === null ? and(eq(usageLimits.feature, input.feature), sql`${usageLimits.businessId} is null`) : and(eq(usageLimits.feature, input.feature), eq(usageLimits.businessId, input.businessId))
    const [before] = await tx.select().from(usageLimits).where(where)
    const values = {
      businessId: input.businessId,
      feature: input.feature,
      includedMonthly: included,
      softPct: soft,
      abuseDaily: abuse,
      mode: input.mode ?? before?.mode ?? "observe",
      exempt: input.exempt ?? before?.exempt ?? false,
      topupQuantity: topup ?? 0,
      estUnitCostMicros: unit,
      note: input.note?.slice(0, 200) ?? before?.note ?? null,
      updatedBy: actor.email,
      updatedAt: new Date(),
    }
    if (before) await tx.update(usageLimits).set(values).where(eq(usageLimits.id, before.id))
    else await tx.insert(usageLimits).values(values)
    await recordSecurityEvent(
      {
        actorType: "super_admin",
        actorId: actor.uid,
        actorLabel: actor.email,
        businessId: input.businessId,
        action: "usage.limit_changed",
        targetType: "usage_limit",
        targetId: input.feature,
        outcome: "success",
        metadata: { scope: input.businessId ? "business" : "default", includedMonthly: included, abuseDaily: abuse, mode: values.mode, exempt: values.exempt, topupQuantity: values.topupQuantity, hadPrevious: Boolean(before) },
      },
      tx,
    )
  })
  clearUsagePolicyCache()
  return { ok: true }
}

