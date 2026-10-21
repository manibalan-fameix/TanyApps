import { sql } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { cronRuns } from "../db/schema"
import { expireTripHoldsJob } from "./jobs/expire-trip-holds"
import { expireUnpaidOrdersJob } from "./jobs/expire-unpaid-orders"

/**
 * Scheduled jobs. A job is a function plus a name; the Cloudflare cron worker (workers/cron) calls
 * POST /api/internal/cron/<name> for each trigger, and this module makes sure each (job, scheduled slot) runs once.
 *
 * Every job MUST be safe to run twice: the lock stops a double-fire, but a crashed run is retried, and a job that did half
 * its work before crashing will be started again. Write jobs as "make the world match the rules", never "add one".
 */
export type JobResult = string
export type Job = { name: string; run(): Promise<JobResult> }

const noop = (name: string): Job => ({ name, run: async () => "nothing to do yet" })

export const JOBS: Record<string, Job> = Object.fromEntries(
  [
    expireUnpaidOrdersJob,
    expireTripHoldsJob,
    // Placeholders for the daily (08:00 IST) and monthly (06:00 IST, 1st) triggers, so the whole path is proven end to end.
    // Document-expiry digests, corporate invoices and the like replace these in the phases that build them.
    noop("daily"),
    noop("monthly"),
    noop("ping"),
  ].map((j) => [j.name, j]),
)

/** A run that stayed "running" this long is assumed to have crashed and may be claimed again. */
export const STALE_RUN_MS = 10 * 60_000

/**
 * Takes the lock for (job, slot). True means this caller runs the job; false means someone else already did, or is doing it
 * now. A failed run, or one that looks crashed, can be claimed again so a retry can finish the work.
 */
export async function claimRun(job: string, slot: Date): Promise<boolean> {
  const rows = await unscopedDb
    .insert(cronRuns)
    .values({ job, slot })
    .onConflictDoUpdate({
      target: [cronRuns.job, cronRuns.slot],
      set: { status: "running", startedAt: sql`now()`, finishedAt: null, result: null, attempts: sql`${cronRuns.attempts} + 1` },
      setWhere: sql`${cronRuns.status} = 'failed' or (${cronRuns.status} = 'running' and ${cronRuns.startedAt} < now() - make_interval(secs => ${STALE_RUN_MS / 1000}))`,
    })
    .returning({ id: cronRuns.id })
  return rows.length === 1
}

async function finishRun(job: string, slot: Date, status: "done" | "failed", result: string) {
  await unscopedDb
    .update(cronRuns)
    .set({ status, finishedAt: new Date(), result: result.slice(0, 300) })
    .where(sql`${cronRuns.job} = ${job} and ${cronRuns.slot} = ${slot}`)
}

export type RunOutcome = { ran: false; reason: "unknown_job" | "already_ran" } | { ran: true; ok: boolean; result: string }

/** Claims the slot, runs the job, records how it went. Never throws for a job's own failure: that is the outcome. */
export async function runJob(name: string, slot: Date): Promise<RunOutcome> {
  const job = JOBS[name]
  if (!job) return { ran: false, reason: "unknown_job" }
  if (!(await claimRun(name, slot))) return { ran: false, reason: "already_ran" }
  try {
    const result = await job.run()
    await finishRun(name, slot, "done", result)
    return { ran: true, ok: true, result }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    console.error(`cron job ${name} failed: ${message}`)
    await finishRun(name, slot, "failed", message)
    return { ran: true, ok: false, result: message }
  }
}
