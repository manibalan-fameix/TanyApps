import { sql } from "drizzle-orm"
import { bigint, boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

/**
 * Platform cost accounting. These tables belong to no single business's data (they are read by the Tany team and written by platform
 * code), so the business column is `business_id`, not `dealer_id`, and they are not tenant-scoped repositories (see tenant-tables.ts).
 * Quantities are counted in the provider's own unit. Money is in micro-rupees (1 INR = 1,000,000) and is always either an ESTIMATE we
 * computed from a configured unit cost, or an actual charge (`billed_cost_micros`) imported from a provider invoice: never mixed.
 */

/** One metered call or batch of work, written once. Idempotent when an idempotency key is given. */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    businessId: uuid("business_id").notNull(),
    product: text("product").notNull(),
    feature: text("feature").notNull(),
    provider: text("provider").notNull(),
    unit: text("unit").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    /** What we think this cost (quantity x configured unit cost). Null when no unit cost is configured. Never a provider invoice. */
    estCostMicros: bigint("est_cost_micros", { mode: "number" }),
    /** What the provider actually charged, when known (imported from an invoice). Null until then. */
    billedCostMicros: bigint("billed_cost_micros", { mode: "number" }),
    /** UTC calendar month, "2026-10". */
    period: text("period").notNull(),
    idempotencyKey: text("idempotency_key"),
  },
  (t) => [
    index("usage_events_business_period_idx").on(t.businessId, t.period, t.feature),
    index("usage_events_period_feature_idx").on(t.period, t.feature),
    uniqueIndex("usage_events_idem_uq").on(t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    check("usage_events_qty_ck", sql`${t.quantity} > 0`),
  ],
)

/**
 * Running totals per business, feature and bucket ("m:2026-10" for a month, "d:2026-10-26" for a day). Updated with one atomic upsert, which
 * is what lets a limit be enforced without a read-then-write race.
 */
export const usageCounters = pgTable(
  "usage_counters",
  {
    businessId: uuid("business_id").notNull(),
    feature: text("feature").notNull(),
    bucket: text("bucket").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull().default(0),
    estCostMicros: bigint("est_cost_micros", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.feature, t.bucket] }), index("usage_counters_bucket_idx").on(t.bucket, t.feature)],
)

/**
 * Configurable policy per feature. A row with a null `business_id` is the platform default for that feature; a row for a business overrides
 * it field by field. Every limit is optional: nothing here exists until an operator sets it, because commercial quotas start in `observe`
 * mode (measure and warn, never block) until real usage has been measured.
 */
export const usageLimits = pgTable(
  "usage_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id"),
    feature: text("feature").notNull(),
    /** Allowance per calendar month. */
    includedMonthly: bigint("included_monthly", { mode: "number" }),
    /** Warn when this percentage of the allowance is used. */
    softPct: integer("soft_pct").notNull().default(80),
    /** Anti-abuse ceiling per UTC day. Enforced whenever set, independent of `mode`: it protects against runaway or malicious use. */
    abuseDaily: bigint("abuse_daily", { mode: "number" }),
    /** observe: the monthly allowance only warns. enforce: the allowance (plus top-up) blocks. */
    mode: text("mode").notNull().default("observe"),
    /** Exempt businesses (e.g. internal or pilot accounts) are never blocked; they are still measured. */
    exempt: boolean("exempt").notNull().default(false),
    /** Extra units added to this month's allowance (a paid top-up), never replacing the plan. */
    topupQuantity: bigint("topup_quantity", { mode: "number" }).notNull().default(0),
    estUnitCostMicros: bigint("est_unit_cost_micros", { mode: "number" }),
    note: text("note"),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("usage_limits_default_uq").on(t.feature).where(sql`${t.businessId} is null`),
    uniqueIndex("usage_limits_business_uq").on(t.businessId, t.feature).where(sql`${t.businessId} is not null`),
    check("usage_limits_mode_ck", sql`${t.mode} in ('observe','enforce')`),
    check("usage_limits_soft_ck", sql`${t.softPct} between 1 and 100`),
  ],
)
