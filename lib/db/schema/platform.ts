import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

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
