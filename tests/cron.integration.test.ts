// Live lock test. Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database (see tenant-leak.integration.test.ts).
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)("cron lock (live database)", () => {
  let scheduler: typeof import("../lib/core/scheduler")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let cronRuns: typeof import("../lib/db/schema").cronRuns
  const tag = Math.random().toString(36).slice(2, 8)
  const name = `it-job-${tag}`
  const slot = (n: number) => new Date(Date.UTC(2030, 0, 1, 0, n, 0))

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    scheduler = await import("../lib/core/scheduler")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    ;({ cronRuns } = await import("../lib/db/schema"))
  })
  afterAll(async () => {
    await unscopedDb.delete(cronRuns).where(eq(cronRuns.job, name))
    await pool.end()
  })

  it("lets only one of many simultaneous claims for the same slot win", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => scheduler.claimRun(name, slot(1))))
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it("treats a different slot as a different run", async () => {
    expect(await scheduler.claimRun(name, slot(2))).toBe(true)
    expect(await scheduler.claimRun(name, slot(3))).toBe(true)
  })

  it("runs a job once however many times its trigger fires", async () => {
    let runs = 0
    scheduler.JOBS[name] = { name, run: async () => (runs++, "ok") }
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => scheduler.runJob(name, slot(10))))
    expect(runs).toBe(1)
    expect(outcomes.filter((o) => o.ran)).toHaveLength(1)
    expect(outcomes.filter((o) => !o.ran).every((o) => !o.ran && o.reason === "already_ran")).toBe(true)
    const [row] = await unscopedDb.select().from(cronRuns).where(eq(cronRuns.job, name)).limit(50)
    expect(row).toBeTruthy()
    // A later duplicate of a finished run is still refused.
    expect((await scheduler.runJob(name, slot(10))).ran).toBe(false)
  })

  it("lets a failed run be claimed again, and records the failure", async () => {
    let calls = 0
    scheduler.JOBS[name] = {
      name,
      run: async () => {
        calls++
        if (calls === 1) throw new Error("boom")
        return "recovered"
      },
    }
    const first = await scheduler.runJob(name, slot(20))
    expect(first).toEqual({ ran: true, ok: false, result: "boom" })
    const second = await scheduler.runJob(name, slot(20))
    expect(second).toEqual({ ran: true, ok: true, result: "recovered" })
    const [row] = await unscopedDb.select().from(cronRuns).where(eq(cronRuns.slot, slot(20)))
    expect(row.status).toBe("done")
    expect(row.attempts).toBe(2)
  })

  it("reclaims a run that has stayed 'running' past the stale limit, but not a fresh one", async () => {
    expect(await scheduler.claimRun(name, slot(30))).toBe(true)
    expect(await scheduler.claimRun(name, slot(30))).toBe(false) // still running, just started
    await unscopedDb.update(cronRuns).set({ startedAt: new Date(Date.now() - scheduler.STALE_RUN_MS - 1000) }).where(eq(cronRuns.slot, slot(30)))
    expect(await scheduler.claimRun(name, slot(30))).toBe(true)
  })

  it("runs the real expire-unpaid-orders job end to end", async () => {
    const outcome = await scheduler.runJob("expire-unpaid-orders", slot(50 + Math.floor(Math.random() * 9)))
    expect(outcome.ran && outcome.ok).toBe(true)
    expect(outcome.ran && outcome.result).toMatch(/order\(s\) released across \d+ restaurant\(s\)/)
    await unscopedDb.delete(cronRuns).where(eq(cronRuns.job, "expire-unpaid-orders"))
  })

  it("answers unknown_job without touching the lock table", async () => {
    expect(await scheduler.runJob(`missing-${tag}`, slot(40))).toEqual({ ran: false, reason: "unknown_job" })
  })
})
