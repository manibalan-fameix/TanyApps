// Live test: failed and stuck scheduled jobs are visible to the Tany team, and only to them. Runs only against a DISPOSABLE migrated database.
import { randomBytes } from "node:crypto"
import { like } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()
const who = vi.hoisted(() => ({ admin: null as string | null }))
vi.mock("../lib/super/guard", () => ({
  requireSuperAdmin: async () => {
    if (!who.admin) throw new Error("NEXT_NOT_FOUND")
    return { email: who.admin }
  },
}))

describe.skipIf(!url)("scheduled job visibility (live database)", () => {
  let q: typeof import("../lib/super/queries")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  const tag = randomBytes(3).toString("hex")

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    q = await import("../lib/super/queries")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
    await unscopedDb.delete(s.cronRuns).where(like(s.cronRuns.job, "zz-vis-%"))
  })
  afterAll(async () => {
    await unscopedDb.delete(s.cronRuns).where(like(s.cronRuns.job, "zz-vis-%"))
    await pool.end()
  })

  it("lists the latest run per job, failures and stuck runs first, and only for the team", async () => {
    const now = new Date()
    const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000)
    await unscopedDb.insert(s.cronRuns).values([
      { job: `zz-vis-ok-${tag}`, slot: at(5), status: "done", startedAt: at(5), finishedAt: at(4), result: "3 done" },
      { job: `zz-vis-bad-${tag}`, slot: at(30), status: "failed", startedAt: at(30), finishedAt: at(29), result: "every business failed (2)", attempts: 2 },
      { job: `zz-vis-bad-${tag}`, slot: at(90), status: "done", startedAt: at(90), finishedAt: at(89) }, // an older, healthy run of the same job is not the latest
      { job: `zz-vis-stuck-${tag}`, slot: at(25), status: "running", startedAt: at(25) },
      { job: `zz-vis-fresh-${tag}`, slot: at(2), status: "running", startedAt: at(2) }, // running, but only just started: not stuck
    ])
    who.admin = null
    await expect(q.loadCronStatus(now)).rejects.toThrow("NEXT_NOT_FOUND")
    who.admin = `ops-${tag}@tany.test`
    const mine = (await q.loadCronStatus(now)).filter((r) => r.job.startsWith("zz-vis-"))
    expect(mine.map((r) => r.job)).toEqual([`zz-vis-bad-${tag}`, `zz-vis-stuck-${tag}`, `zz-vis-fresh-${tag}`, `zz-vis-ok-${tag}`])
    expect(mine.find((r) => r.job === `zz-vis-bad-${tag}`)).toMatchObject({ status: "failed", result: "every business failed (2)", attempts: 2, stuck: false })
    expect(mine.find((r) => r.job === `zz-vis-stuck-${tag}`)?.stuck).toBe(true)
    expect(mine.find((r) => r.job === `zz-vis-fresh-${tag}`)?.stuck).toBe(false)
    expect(mine.find((r) => r.job === `zz-vis-ok-${tag}`)?.stuck).toBe(false)
  })
})
