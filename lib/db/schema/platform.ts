import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { dealers } from "./dealers.ts"

export const cronRunStatus = pgEnum("cron_run_status", ["running", "done", "failed"])

/**
 * One row per scheduled run of a job (the lock). The unique (job, slot) key is what stops a double-fired trigger from
 * running a job twice: the second claim finds the row and backs off. `slot` is the time the trigger was scheduled for, not
 * the time it happened to arrive. Not tenant data: jobs that touch tenants loop over them themselves.
 */
export const cronRuns = pgTable(
  "cron_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job: text("job").notNull(),
    slot: timestamp("slot", { withTimezone: true }).notNull(),
    status: cronRunStatus("status").notNull().default("running"),
    attempts: integer("attempts").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** A short, non-sensitive summary of what the run did, or why it failed. */
    result: text("result"),
  },
  (t) => [uniqueIndex("cron_runs_job_slot_uq").on(t.job, t.slot), index("cron_runs_started_idx").on(t.startedAt)],
)

export const auditActorType = pgEnum("audit_actor_type", ["user", "customer", "driver", "system", "webhook"])

/**
 * Who did what to which record, for the things people argue about later: fare edits, refunds, reassignments, cancellations,
 * overrides. Append-only (a trigger in the migration blocks UPDATE, DELETE and TRUNCATE), and `dealer_id` has no cascade, so a
 * business with history cannot be hard-deleted by accident. `diff` holds changed field names with before/after values, with
 * personal data already redacted by lib/core/audit.ts.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id),
    actorType: auditActorType("actor_type").notNull(),
    /** The user / customer / driver id, or a short label for system and webhook actors. */
    actorId: text("actor_id").notNull(),
    /** Dotted verb, e.g. trip.reassign, fare.adjust, payment.refund. */
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    diff: jsonb("diff").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.dealerId, t.entity, t.entityId, t.at), index("audit_log_dealer_at_idx").on(t.dealerId, t.at)],
)
