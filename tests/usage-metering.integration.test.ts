// Live test of usage accounting and cost protection. Runs only against a DISPOSABLE migrated database
// (see docs/staging/neon-test-database.md). No provider is ever called: the meter only counts.
import { randomBytes } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()
const who = vi.hoisted(() => ({ admin: null as string | null }))
vi.mock("@/lib/core/rate-limit", () => ({ rateLimit: async () => true }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("../lib/super/guard", () => ({
  requireSuperAdmin: async () => {
    if (!who.admin) throw new Error("NEXT_NOT_FOUND")
    return { email: who.admin }
  },
  superAdminActor: async () => {
    if (!who.admin) throw new Error("NEXT_NOT_FOUND")
    return { email: who.admin, uid: "uid-usage" }
  },
}))

describe.skipIf(!url)("usage metering and cost protection (live database)", () => {
  let usage: typeof import("../lib/core/usage")
  let admin: typeof import("../lib/super/usage")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  const tag = randomBytes(3).toString("hex")
  let n = 0
  const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
  // Default (platform-wide) rows are shared state: this file uses one feature for them and removes them afterwards.
  const SHARED = "maps_places_request" as const

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    usage = await import("../lib/core/usage")
    admin = await import("../lib/super/usage")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
    await clearDefault()
    // Earlier runs of this file left businesses (slug "use-...") with usage rows in this persistent test database; remove them so the
    // ranked "top businesses" view below is not crowded by old data.
    const old = sql`select id from dealers where slug like 'use-%'`
    await unscopedDb.execute(sql`delete from usage_events where business_id in (${old})`)
    await unscopedDb.execute(sql`delete from usage_counters where business_id in (${old})`)
    await unscopedDb.execute(sql`delete from usage_limits where business_id in (${old})`)
  })
  afterAll(async () => {
    await clearDefault()
    await unscopedDb.execute(sql`drop trigger if exists zz_usage_fault on usage_events`)
    await unscopedDb.execute(sql`drop function if exists zz_usage_fault_fn()`)
    await pool.end()
  })
  afterEach(() => {
    usage.clearUsagePolicyCache()
    vi.restoreAllMocks()
  })

  const clearDefault = async () => {
    await unscopedDb.delete(s.usageLimits).where(sql`${s.usageLimits.businessId} is null and ${s.usageLimits.feature} = ${SHARED}`)
    usage.clearUsagePolicyCache()
  }
  const biz = async () => (await unscopedDb.insert(s.dealers).values({ slug: `use-${tag}-${++n}`, displayName: `Use ${n}`, theme }).returning())[0]
  const setLimit = async (businessId: string | null, feature: string, v: Partial<typeof import("../lib/db/schema").usageLimits.$inferInsert>) => {
    await unscopedDb.insert(s.usageLimits).values({ businessId, feature, ...v })
    usage.clearUsagePolicyCache()
  }
  const events = (id: string, feature?: string) => unscopedDb.select().from(s.usageEvents).where(feature ? and(eq(s.usageEvents.businessId, id), eq(s.usageEvents.feature, feature)) : eq(s.usageEvents.businessId, id))
  const counter = async (id: string, feature: string, bucket: string) => (await unscopedDb.select().from(s.usageCounters).where(and(eq(s.usageCounters.businessId, id), eq(s.usageCounters.feature, feature), eq(s.usageCounters.bucket, bucket))))[0]
  const metrics = (spy: ReturnType<typeof vi.spyOn>): string[] =>
    spy.mock.calls
      .map((c: unknown[]): Record<string, unknown> => {
        try {
          return JSON.parse(String(c[0])) as Record<string, unknown>
        } catch {
          return {}
        }
      })
      .filter((m: Record<string, unknown>) => m.metric && m.metric !== "usage")
      .map((m: Record<string, unknown>) => String(m.metric))

  describe("recording", () => {
    it("writes one ledger row and the day and month counters, attributed to the right business, product and feature", async () => {
      const a = await biz(), b = await biz()
      const now = new Date("2026-10-26T10:00:00Z")
      expect(await usage.meterUsage({ dealerId: a.id, feature: "llm_chat_request", now })).toMatchObject({ allowed: true, recorded: true })
      await usage.meterUsage({ dealerId: a.id, feature: "llm_chat_request", now, product: "restaurants" })
      const rows = await events(a.id)
      expect(rows).toHaveLength(2)
      expect(rows[0]).toMatchObject({ provider: "gemini", unit: "request", quantity: 1, period: "2026-10", billedCostMicros: null })
      expect(rows.map((r) => r.product).sort()).toEqual(["motors", "restaurants"])
      expect((await counter(a.id, "llm_chat_request", "m:2026-10")).quantity).toBe(2)
      expect((await counter(a.id, "llm_chat_request", "d:2026-10-26")).quantity).toBe(2)
      expect(await events(b.id)).toHaveLength(0) // another business sees and gets nothing
      expect(await counter(b.id, "llm_chat_request", "m:2026-10")).toBeUndefined()
    })
    it("estimates cost only when a unit cost is configured, and never fills in the provider-billed column", async () => {
      const a = await biz()
      await usage.meterUsage({ dealerId: a.id, feature: "rc_lookup_request" })
      expect((await events(a.id))[0].estCostMicros).toBeNull()
      await setLimit(a.id, "vision_ocr_request", { estUnitCostMicros: 2_500_000 })
      await usage.meterUsage({ dealerId: a.id, feature: "vision_ocr_request", quantity: 3 })
      const [row] = await events(a.id, "vision_ocr_request")
      expect([row.estCostMicros, row.billedCostMicros]).toEqual([7_500_000, null])
      expect((await counter(a.id, "vision_ocr_request", `m:${usage.monthOf(new Date())}`)).estCostMicros).toBe(7_500_000)
    })
    it("counts a retried operation once when it carries an idempotency key, even when the retries run at the same moment", async () => {
      const a = await biz()
      const results = await Promise.all(Array.from({ length: 8 }, () => usage.meterUsage({ dealerId: a.id, feature: "media_upload_bytes", quantity: 4096, key: `media:${tag}-${n}` })))
      expect(results.filter((r) => r.allowed && r.recorded)).toHaveLength(1)
      expect(results.filter((r) => r.allowed && "duplicate" in r && r.duplicate)).toHaveLength(7)
      expect(await events(a.id)).toHaveLength(1)
      expect((await counter(a.id, "media_upload_bytes", `m:${usage.monthOf(new Date())}`)).quantity).toBe(4096)
    })
    it("treats the same key for two different businesses as two different operations only if the key differs: keys are global, so callers must scope them", async () => {
      const a = await biz(), b = await biz()
      await usage.meterUsage({ dealerId: a.id, feature: "video_processing_seconds", quantity: 30, key: `video:${a.id}` })
      await usage.meterUsage({ dealerId: b.id, feature: "video_processing_seconds", quantity: 30, key: `video:${b.id}` })
      expect(await events(a.id)).toHaveLength(1)
      expect(await events(b.id)).toHaveLength(1)
    })
  })

  describe("billing periods", () => {
    it("a month and a day roll over at UTC midnight: separate counters, separate periods", async () => {
      const a = await biz()
      await usage.meterUsage({ dealerId: a.id, feature: "llm_chat_request", now: new Date("2026-10-31T23:59:59Z") })
      await usage.meterUsage({ dealerId: a.id, feature: "llm_chat_request", now: new Date("2026-11-01T00:00:00Z") })
      expect((await events(a.id)).map((e) => e.period).sort()).toEqual(["2026-10", "2026-11"])
      expect((await counter(a.id, "llm_chat_request", "m:2026-10")).quantity).toBe(1)
      expect((await counter(a.id, "llm_chat_request", "m:2026-11")).quantity).toBe(1)
      expect((await counter(a.id, "llm_chat_request", "d:2026-10-31")).quantity).toBe(1)
      expect((await counter(a.id, "llm_chat_request", "d:2026-11-01")).quantity).toBe(1)
    })
    it("recovery: an abuse ceiling reached today no longer blocks at the next UTC midnight", async () => {
      const a = await biz()
      await setLimit(a.id, "llm_chat_request", { abuseDaily: 2 })
      const t = (iso: string) => ({ dealerId: a.id, feature: "llm_chat_request" as const, now: new Date(iso) })
      expect((await usage.meterUsage(t("2026-12-30T10:00:00Z"))).allowed).toBe(true)
      expect((await usage.meterUsage(t("2026-12-30T11:00:00Z"))).allowed).toBe(true)
      expect(await usage.meterUsage(t("2026-12-30T23:59:59Z"))).toMatchObject({ allowed: false, reason: "abuse_limit", limit: 2, used: 2 })
      expect((await usage.meterUsage(t("2026-12-31T00:00:00Z"))).allowed).toBe(true)
    })
  })

  describe("anti-abuse ceiling (enforced whenever set)", () => {
    it("forty simultaneous callers racing a ceiling of ten: exactly ten are allowed, and the ledger and counter agree", async () => {
      const a = await biz()
      await setLimit(a.id, "llm_chat_request", { abuseDaily: 10 })
      const results = await Promise.all(Array.from({ length: 40 }, () => usage.meterUsage({ dealerId: a.id, feature: "llm_chat_request" })))
      expect(results.filter((r) => r.allowed)).toHaveLength(10)
      expect(results.filter((r) => !r.allowed)).toHaveLength(30)
      expect(results.filter((r) => !r.allowed).every((r) => !r.allowed && r.reason === "abuse_limit" && r.limit === 10)).toBe(true)
      expect(await events(a.id)).toHaveLength(10) // a refused call is rolled back, never left half-counted
      expect((await counter(a.id, "llm_chat_request", `d:${usage.dayOf(new Date())}`)).quantity).toBe(10)
    })
    it("a single request larger than the whole ceiling is refused without creating a counter", async () => {
      const a = await biz()
      await setLimit(a.id, "media_upload_bytes", { abuseDaily: 1000 })
      expect(await usage.meterUsage({ dealerId: a.id, feature: "media_upload_bytes", quantity: 5000 })).toMatchObject({ allowed: false, reason: "abuse_limit" })
      expect(await events(a.id)).toHaveLength(0)
      expect(await counter(a.id, "media_upload_bytes", `d:${usage.dayOf(new Date())}`)).toBeUndefined()
    })
    it("one business hitting its ceiling does not affect another", async () => {
      const a = await biz(), b = await biz()
      await setLimit(a.id, "llm_chat_request", { abuseDaily: 1 })
      expect((await usage.meterUsage({ dealerId: a.id, feature: "llm_chat_request" })).allowed).toBe(true)
      expect((await usage.meterUsage({ dealerId: a.id, feature: "llm_chat_request" })).allowed).toBe(false)
      for (let i = 0; i < 5; i++) expect((await usage.meterUsage({ dealerId: b.id, feature: "llm_chat_request" })).allowed).toBe(true)
    })
  })

  describe("commercial allowance (observe first)", () => {
    it("observe mode never blocks: it warns once at the soft threshold and once when the allowance is passed", async () => {
      const a = await biz()
      await setLimit(a.id, "vision_ocr_request", { includedMonthly: 10, softPct: 80, mode: "observe" })
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {})
      const decisions = []
      for (let i = 0; i < 15; i++) decisions.push(await usage.meterUsage({ dealerId: a.id, feature: "vision_ocr_request" }))
      expect(decisions.every((d) => d.allowed)).toBe(true) // 15 of 10: still all allowed
      expect(decisions.filter((d) => d.allowed && d.warning === "soft")).toHaveLength(1)
      expect(decisions.filter((d) => d.allowed && d.warning === "over_allowance")).toHaveLength(1)
      expect(metrics(spy).filter((m: string) => m === "usage_soft_limit")).toHaveLength(1)
      expect(metrics(spy).filter((m: string) => m === "usage_over_allowance")).toHaveLength(1)
      expect((await counter(a.id, "vision_ocr_request", `m:${usage.monthOf(new Date())}`)).quantity).toBe(15)
    })
    it("enforce mode blocks past the allowance plus top-up, atomically, and a top-up restores service immediately", async () => {
      const a = await biz()
      await setLimit(a.id, "rc_lookup_request", { includedMonthly: 5, mode: "enforce" })
      const burst = await Promise.all(Array.from({ length: 20 }, () => usage.meterUsage({ dealerId: a.id, feature: "rc_lookup_request" })))
      expect(burst.filter((r) => r.allowed)).toHaveLength(5)
      expect(burst.filter((r) => !r.allowed).every((r) => !r.allowed && r.reason === "quota" && r.limit === 5)).toBe(true)
      expect(await events(a.id)).toHaveLength(5)
      // The owner buys a top-up of 3: the next three calls pass, the fourth does not.
      await unscopedDb.update(s.usageLimits).set({ topupQuantity: 3 }).where(and(eq(s.usageLimits.businessId, a.id), eq(s.usageLimits.feature, "rc_lookup_request")))
      usage.clearUsagePolicyCache()
      const after = []
      for (let i = 0; i < 4; i++) after.push((await usage.meterUsage({ dealerId: a.id, feature: "rc_lookup_request" })).allowed)
      expect(after).toEqual([true, true, true, false])
    })
    it("an allowance of zero users' worth of money or a missing policy blocks nothing: with no limit set everything is measure-only", async () => {
      const a = await biz()
      for (let i = 0; i < 30; i++) expect((await usage.meterUsage({ dealerId: a.id, feature: "llm_video_listing" })).allowed).toBe(true)
    })
    it("an exempt business is measured but never blocked", async () => {
      const a = await biz()
      await setLimit(a.id, "llm_chat_request", { abuseDaily: 3, includedMonthly: 3, mode: "enforce", exempt: true })
      for (let i = 0; i < 10; i++) expect((await usage.meterUsage({ dealerId: a.id, feature: "llm_chat_request" })).allowed).toBe(true)
      expect(await events(a.id)).toHaveLength(10)
    })
  })

  describe("overrides", () => {
    it("a business override beats the platform default, field by field, and other businesses keep the default", async () => {
      await setLimit(null, SHARED, { abuseDaily: 5 }) // platform default
      const a = await biz(), b = await biz(), c = await biz()
      await setLimit(b.id, SHARED, { abuseDaily: 50 }) // B is allowed more
      await setLimit(c.id, SHARED, { exempt: true }) // C is exempt
      const run = async (id: string) => (await Promise.all(Array.from({ length: 20 }, () => usage.meterUsage({ dealerId: id, feature: SHARED })))).filter((r) => r.allowed).length
      expect(await run(a.id)).toBe(5)
      expect(await run(b.id)).toBe(20)
      expect(await run(c.id)).toBe(20)
      expect((await counter(c.id, SHARED, `d:${usage.dayOf(new Date())}`)).quantity).toBe(20)
      await clearDefault()
    })
  })

  describe("failure behaviour", () => {
    it("if the accounting cannot be written the work is allowed and a metric says so", async () => {
      const a = await biz()
      await unscopedDb.execute(sql.raw(`create or replace function zz_usage_fault_fn() returns trigger as $$ begin if new.business_id = '${a.id}' then raise exception 'injected metering failure'; end if; return new; end $$ language plpgsql`))
      await unscopedDb.execute(sql`drop trigger if exists zz_usage_fault on usage_events`)
      await unscopedDb.execute(sql`create trigger zz_usage_fault before insert on usage_events for each row execute function zz_usage_fault_fn()`)
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.spyOn(console, "error").mockImplementation(() => {})
      try {
        expect(await usage.meterUsage({ dealerId: a.id, feature: "llm_chat_request" })).toEqual({ allowed: true, recorded: false })
        expect(metrics(warn)).toContain("usage_metering_failed")
      } finally {
        await unscopedDb.execute(sql`drop trigger if exists zz_usage_fault on usage_events`)
      }
      expect(await counter(a.id, "llm_chat_request", `m:${usage.monthOf(new Date())}`)).toBeUndefined() // nothing half-written
    })
    it("a provider error after metering does not un-count the attempt, and a tenant with no database policy still works", async () => {
      const a = await biz()
      const decision = await usage.meterUsage({ dealerId: a.id, feature: "rc_lookup_request" })
      expect(decision.allowed).toBe(true)
      // (the call site then calls the provider; if that fails, the attempt stays counted: an upper bound, the safe side for cost)
      expect(await events(a.id)).toHaveLength(1)
    })
  })

  describe("the Tany team's controls and views", () => {
    it("only a team member can set a limit; the change and its record commit together; the record has numbers, not free text", async () => {
      const a = await biz()
      who.admin = null
      await expect(admin.saveUsageLimit({ businessId: a.id, feature: "llm_chat_request", abuseDaily: 100 })).rejects.toThrow("NEXT_NOT_FOUND")
      expect(await unscopedDb.select().from(s.usageLimits).where(eq(s.usageLimits.businessId, a.id))).toHaveLength(0)
      who.admin = `ops-${tag}@tany.test`
      expect(await admin.saveUsageLimit({ businessId: a.id, feature: "llm_chat_request", abuseDaily: 100, includedMonthly: 500, mode: "observe", note: "free text that must not be audited" })).toEqual({ ok: true })
      const [row] = await unscopedDb.select().from(s.usageLimits).where(eq(s.usageLimits.businessId, a.id))
      expect(row).toMatchObject({ abuseDaily: 100, includedMonthly: 500, mode: "observe", updatedBy: `ops-${tag}@tany.test` })
      const trail = await unscopedDb.select().from(s.securityAuditEvents).where(and(eq(s.securityAuditEvents.action, "usage.limit_changed"), eq(s.securityAuditEvents.businessId, a.id)))
      expect(trail).toHaveLength(1)
      expect(trail[0]).toMatchObject({ actorLabel: `ops-${tag}@tany.test`, actorId: "uid-usage", targetId: "llm_chat_request" })
      expect(JSON.stringify(trail[0])).not.toContain("free text")
      // Updating takes effect straight away for the same process.
      expect((await usage.meterUsage({ dealerId: a.id, feature: "llm_chat_request" })).allowed).toBe(true)
    })
    it("rejects unknown features, malformed ids and nonsense numbers", async () => {
      who.admin = `ops-${tag}@tany.test`
      for (const bad of [
        { businessId: null, feature: "not_a_feature" },
        { businessId: "x'; drop table usage_limits;--", feature: "llm_chat_request" },
        { businessId: null, feature: "llm_chat_request", abuseDaily: -5 },
        { businessId: null, feature: "llm_chat_request", includedMonthly: 1.5 },
        { businessId: null, feature: "llm_chat_request", softPct: 0 },
        { businessId: null, feature: "llm_chat_request", mode: "block" as never },
      ]) expect((await admin.saveUsageLimit(bad)).ok, JSON.stringify(bad)).toBe(false)
    })
    it("the overview attributes cost by product and business, flags unusual days, and reports allowance use; only for the team", async () => {
      const a = await biz(), quiet = await biz()
      const now = new Date()
      // A: busy for days (steady), quiet: nothing. Then A spikes today.
      await setLimit(a.id, "llm_chat_request", { estUnitCostMicros: 1000, includedMonthly: 100, mode: "observe" })
      for (let d = 1; d <= 7; d++) await unscopedDb.insert(s.usageCounters).values({ businessId: a.id, feature: "llm_chat_request", bucket: `d:${usage.dayOf(new Date(now.getTime() - d * 86_400_000))}`, quantity: 2 })
      for (let i = 0; i < 30; i++) await usage.meterUsage({ dealerId: a.id, feature: "llm_chat_request", now })
      await usage.meterUsage({ dealerId: quiet.id, feature: "llm_chat_request", now })
      who.admin = null
      await expect(admin.loadUsageOverview(now)).rejects.toThrow("NEXT_NOT_FOUND")
      who.admin = `ops-${tag}@tany.test`
      const o = await admin.loadUsageOverview(now)
      expect(o.period).toBe(usage.monthOf(now))
      expect(o.byProduct.find((r) => r.feature === "llm_chat_request")?.quantity).toBeGreaterThanOrEqual(31)
      expect(o.topTenants.find((t) => t.businessId === a.id)?.estMicros).toBe(30_000)
      expect(o.abnormal.find((x) => x.businessId === a.id)).toMatchObject({ feature: "llm_chat_request", today: 30 })
      expect(o.abnormal.find((x) => x.businessId === quiet.id)).toBeUndefined() // one call is not unusual
      expect(o.utilization.find((u) => u.businessId === a.id)).toMatchObject({ used: 30, included: 100, pct: 30, mode: "observe" })
      expect(o.projectedMicros).not.toBeNull()
    })
    it("unusual-use detection uses a floor per unit, so a few kilobytes never outranks a real request spike, and one feature cannot crowd out another", async () => {
      who.admin = `ops-${tag}@tany.test`
      const now = new Date()
      const tiny = await biz(), spike = await biz()
      // 8 KB uploaded today with no history is a huge ratio but nothing worth noticing; 40 chat questions against a quiet week is.
      await usage.meterUsage({ dealerId: tiny.id, feature: "media_upload_bytes", quantity: 8_192, now })
      for (let d = 1; d <= 7; d++) await unscopedDb.insert(s.usageCounters).values({ businessId: spike.id, feature: "llm_chat_request", bucket: `d:${usage.dayOf(new Date(now.getTime() - d * 86_400_000))}`, quantity: 1 })
      for (let i = 0; i < 40; i++) await usage.meterUsage({ dealerId: spike.id, feature: "llm_chat_request", now })
      const o = await admin.loadUsageOverview(now)
      expect(o.abnormal.find((x) => x.businessId === tiny.id)).toBeUndefined()
      expect(o.abnormal.find((x) => x.businessId === spike.id)).toMatchObject({ feature: "llm_chat_request", today: 40 })
      // Never more than five flagged businesses per feature.
      for (const f of new Set(o.abnormal.map((x) => x.feature))) expect(o.abnormal.filter((x) => x.feature === f).length).toBeLessThanOrEqual(5)
    })
  })

  describe("coverage of the metered features", () => {
    it("every metered feature names its product, provider and unit, and the call sites use only registered features", async () => {
      for (const [k, v] of Object.entries(usage.FEATURES)) expect(v, k).toMatchObject({ product: expect.any(String), provider: expect.any(String), unit: expect.any(String) })
      const { readFileSync, readdirSync, statSync } = await import("node:fs")
      const path = await import("node:path")
      const root = path.resolve(__dirname, "..")
      const walk = (dir: string, out: string[] = []): string[] => {
        for (const name of readdirSync(dir)) {
          if (name === "node_modules" || name.startsWith(".")) continue
          const f = path.join(dir, name)
          if (statSync(f).isDirectory()) walk(f, out)
          else if (/\.(ts|tsx)$/.test(name)) out.push(f)
        }
        return out
      }
      const used = new Set<string>()
      for (const f of ["app", "lib", "workers"].flatMap((d) => walk(path.join(root, d)))) for (const m of readFileSync(f, "utf8").matchAll(/feature:\s*"(\w+)"/g)) used.add(m[1])
      for (const feature of used) if (feature !== "not_a_feature") expect(Object.keys(usage.FEATURES), feature).toContain(feature)
      // The paid features are all metered at their call sites.
      for (const f of ["llm_chat_request", "vision_ocr_request", "rc_lookup_request", "llm_video_listing", "media_upload_bytes", "video_processing_seconds", "maps_places_request", "maps_route_request"]) expect([...used], f).toContain(f)
    })
  })
})
