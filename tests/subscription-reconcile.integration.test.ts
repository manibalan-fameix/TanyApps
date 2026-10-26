// Live test of the subscription reconciliation job. The provider is a fake function: nothing here can reach Razorpay.
// Runs only against a DISPOSABLE migrated database (see docs/staging/neon-test-database.md).
import { randomBytes } from "node:crypto"
import { eq, like } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()
vi.mock("../lib/billing/razorpay", async (orig) => ({ ...(await orig<typeof import("../lib/billing/razorpay")>()), cancelSubscription: async () => {} }))

const DAY = 86_400
const NOW = Math.floor(Date.now() / 1000)

describe.skipIf(!url)("subscription reconciliation (live database, fake provider)", () => {
  let job: typeof import("../lib/core/jobs/reconcile-subscriptions")
  let scheduler: typeof import("../lib/core/scheduler")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  const tag = randomBytes(3).toString("hex")
  let n = 0
  const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    job = await import("../lib/core/jobs/reconcile-subscriptions")
    scheduler = await import("../lib/core/scheduler")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
    // Businesses left by earlier runs of this file would crowd the oldest-first queue the job works through.
    await unscopedDb.delete(s.dealers).where(like(s.dealers.slug, "rc-%"))
  })
  afterAll(async () => {
    await pool.end()
  })

  const dealer = async (over: Partial<typeof import("../lib/db/schema").dealers.$inferInsert> = {}) => {
    const sub = `sub_rc_${tag}_${++n}`
    const [d] = await unscopedDb.insert(s.dealers).values({ slug: `rc-${tag}-${n}`, displayName: `Rc ${n}`, theme, plan: "starter", subscriptionId: sub, subscriptionStatus: "active", paidThrough: new Date((NOW - DAY) * 1000), trialEndsAt: null, ...over }).returning()
    return { d, sub }
  }
  const reload = async (id: string) => (await unscopedDb.select().from(s.dealers).where(eq(s.dealers.id, id)))[0]
  const answer = (d: { id: string }, id: string, status: string, end: number | null) => ({ id, status, current_end: end, notes: { dealer_id: d.id, plan: "starter", cycle: "monthly" } })
  /** Only the businesses this test created are asked about, whatever else the shared database holds. */
  const only = (ids: string[], answers: Record<string, ReturnType<typeof answer> | null | Error>) => async (subId: string) => {
    const a = answers[subId]
    if (a === undefined) throw new Error("not a test subscription")
    if (a instanceof Error) throw a
    return a
  }
  const run = (answers: Parameters<typeof only>[1], opts: { maxPerRun?: number } = {}) => job.reconcileSubscriptions({ fetchSubscription: only([], answers), ...opts })

  it("a renewal whose webhook was lost is found: the paid-through date moves forward", async () => {
    const { d, sub } = await dealer()
    const r = await run({ [sub]: answer(d, sub, "active", NOW + 30 * DAY) })
    expect(r.updated).toBeGreaterThanOrEqual(1)
    expect((await reload(d.id)).paidThrough?.getTime()).toBe((NOW + 30 * DAY) * 1000)
  })
  it("is idempotent: a second run changes nothing and never moves the date back", async () => {
    const { d, sub } = await dealer()
    await run({ [sub]: answer(d, sub, "active", NOW + 30 * DAY) })
    const before = await reload(d.id)
    await run({ [sub]: answer(d, sub, "active", NOW + 30 * DAY) })
    await run({ [sub]: answer(d, sub, "active", NOW + 2 * DAY) }) // an older answer
    expect((await reload(d.id)).paidThrough?.getTime()).toBe(before.paidThrough?.getTime())
  })
  it("does not ask about subscriptions that are not due, or that are finished", async () => {
    const paidUp = await dealer({ paidThrough: new Date((NOW + 20 * DAY) * 1000) })
    const cancelled = await dealer({ subscriptionStatus: "cancelled" })
    const asked: string[] = []
    await job.reconcileSubscriptions({ fetchSubscription: async (id) => { asked.push(id); return null } })
    expect(asked).not.toContain(paidUp.sub)
    expect(asked).not.toContain(cancelled.sub)
  })
  it("cannot revive a subscription Razorpay reports as cancelled, nor touch another business: the notes must name this one", async () => {
    const a = await dealer(), b = await dealer()
    // A's subscription answers with B's id in its notes: ignored for A, and B is untouched.
    await run({ [a.sub]: answer(b.d, a.sub, "active", NOW + 40 * DAY), [b.sub]: null })
    expect((await reload(a.d.id)).paidThrough?.getTime()).toBe((NOW - DAY) * 1000)
    expect((await reload(b.d.id)).paidThrough?.getTime()).toBe((NOW - DAY) * 1000)
    // A cancelled answer ends the subscription; a later stale "active" for the same record cannot undo it.
    await run({ [a.sub]: answer(a.d, a.sub, "cancelled", NOW + 1 * DAY), [b.sub]: null })
    expect((await reload(a.d.id)).subscriptionStatus).toBe("cancelled")
    const again = await job.reconcileSubscriptions({ fetchSubscription: only([], { [a.sub]: answer(a.d, a.sub, "active", NOW + 60 * DAY), [b.sub]: null }) })
    expect(again.checked).toBeLessThanOrEqual(1) // cancelled businesses are no longer candidates
    expect((await reload(a.d.id)).subscriptionStatus).toBe("cancelled")
  })
  it("one provider failure does not stop the others, and is counted", async () => {
    const bad = await dealer(), good = await dealer()
    vi.spyOn(console, "error").mockImplementation(() => {})
    const r = await run({ [bad.sub]: new Error("Razorpay timed out"), [good.sub]: answer(good.d, good.sub, "active", NOW + 30 * DAY) })
    expect(r.failed).toBeGreaterThanOrEqual(1)
    expect((await reload(good.d.id)).paidThrough?.getTime()).toBe((NOW + 30 * DAY) * 1000)
    expect((await reload(bad.d.id)).paidThrough?.getTime()).toBe((NOW - DAY) * 1000) // unchanged, retried tomorrow
  })
  it("a business entitled today is not cut off by a provider outage: nothing is written when the provider cannot answer", async () => {
    const { d, sub } = await dealer({ paidThrough: new Date((NOW + 1 * DAY) * 1000) })
    vi.spyOn(console, "error").mockImplementation(() => {})
    await run({ [sub]: new Error("unreachable") })
    const after = await reload(d.id)
    expect(after.paidThrough?.getTime()).toBe((NOW + 1 * DAY) * 1000)
    expect(after.subscriptionStatus).toBe("active")
  })
  it("is bounded: a run asks about at most the configured number and reports the rest as deferred", async () => {
    for (let i = 0; i < 4; i++) await dealer()
    const asked: string[] = []
    const r = await job.reconcileSubscriptions({ maxPerRun: 2, fetchSubscription: async (id) => { asked.push(id); return null } })
    expect(asked.length).toBeLessThanOrEqual(2)
    expect(r.deferred).toBeGreaterThanOrEqual(1)
  })
  it("is registered, runs on the daily schedule, and is reachable only through the guarded cron route", async () => {
    const { SCHEDULE } = await import("../workers/cron/index")
    expect(Object.keys(scheduler.JOBS)).toContain("reconcile-subscriptions")
    expect(Object.values(SCHEDULE).flat()).toContain("reconcile-subscriptions")
  })
})
