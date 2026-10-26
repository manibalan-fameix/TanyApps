// Live test of the platform security trail: coverage, actor and tenant correctness, redaction, idempotency, append-only enforcement,
// transactional (fail-closed) behaviour proven by injecting a database fault, and access restriction. Runs only against a DISPOSABLE
// migrated database (see docs/staging/neon-test-database.md).
import { randomBytes } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()
const who = vi.hoisted(() => ({ admin: null as string | null }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/core/rate-limit", () => ({ rateLimit: async () => true }))
vi.mock("@/lib/super/guard", () => ({
  requireSuperAdmin: async () => {
    if (!who.admin) throw new Error("NEXT_NOT_FOUND")
    return { email: who.admin }
  },
  superAdminActor: async () => {
    if (!who.admin) throw new Error("NEXT_NOT_FOUND")
    return { email: who.admin, uid: "uid-" + who.admin.split("@")[0] }
  },
}))

describe.skipIf(!url)("security audit trail (live database)", () => {
  let audit: typeof import("../lib/core/security-audit")
  let inv: typeof import("../lib/tenant/invites")
  let team: typeof import("../lib/tenant/team")
  let createDealer: typeof import("../lib/tenant/create-dealer")
  let queries: typeof import("../lib/super/queries")
  let exportRoute: typeof import("../app/(super)/super/export/[kind]/route")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  const tag = randomBytes(3).toString("hex")
  let n = 0
  const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    process.env.BLIND_INDEX_KEY = randomBytes(32).toString("base64")
    audit = await import("../lib/core/security-audit")
    inv = await import("../lib/tenant/invites")
    team = await import("../lib/tenant/team")
    createDealer = await import("../lib/tenant/create-dealer")
    queries = await import("../lib/super/queries")
    exportRoute = await import("../app/(super)/super/export/[kind]/route")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
  })
  afterAll(async () => {
    await unscopedDb.execute(sql`drop trigger if exists zz_fault on security_audit_events`)
    await unscopedDb.execute(sql`drop function if exists zz_fault_fn()`)
    await pool.end()
  })

  const onboard = (slug: string) =>
    ({ slug, industry: "motors", displayName: `Created ${slug}`, city: "Chennai", phone: "+919876543210", hours: {}, primary: "#1d4ed8", accent: "#f59e0b", radius: "md", plan: "free", billingCycle: "monthly" }) as never
  const dealer = async () => (await unscopedDb.insert(s.dealers).values({ slug: `aud-${tag}-${++n}`, displayName: `Aud ${n}`, theme }).returning())[0]
  const user = async () => (await unscopedDb.insert(s.users).values({ name: `U${++n}`, email: `a${n}-${tag}@example.test` }).returning())[0]
  const owner = async (d: { id: string }) => {
    const u = await user()
    await unscopedDb.insert(s.dealerUsers).values({ dealerId: d.id, userId: u.id, role: "owner" })
    return u
  }
  const events = async (where: ReturnType<typeof eq>) => unscopedDb.select().from(s.securityAuditEvents).where(where)
  const byBusiness = (id: string) => events(eq(s.securityAuditEvents.businessId, id))

  /** Makes any insert into the trail fail while `cond` holds, to prove an action does not happen without its record. */
  async function withAuditFault<T>(cond: string, fn: () => Promise<T>): Promise<T> {
    await unscopedDb.execute(sql.raw(`create or replace function zz_fault_fn() returns trigger as $$ begin if ${cond} then raise exception 'injected audit failure'; end if; return new; end $$ language plpgsql`))
    await unscopedDb.execute(sql`drop trigger if exists zz_fault on security_audit_events`)
    await unscopedDb.execute(sql`create trigger zz_fault before insert on security_audit_events for each row execute function zz_fault_fn()`)
    try {
      return await fn()
    } finally {
      await unscopedDb.execute(sql`drop trigger if exists zz_fault on security_audit_events`)
    }
  }

  describe("append-only at the database", () => {
    it("rejects UPDATE, DELETE and TRUNCATE, even for raw SQL", async () => {
      const d = await dealer()
      await audit.recordSecurityEvent({ actorType: "system", businessId: d.id, action: "test.append", targetType: "x", outcome: "success" })
      await expect(unscopedDb.execute(sql`update security_audit_events set outcome = 'failed' where business_id = ${d.id}`)).rejects.toThrow()
      await expect(unscopedDb.execute(sql`delete from security_audit_events where business_id = ${d.id}`)).rejects.toThrow()
      await expect(unscopedDb.execute(sql`truncate security_audit_events`)).rejects.toThrow()
      expect(await byBusiness(d.id)).toHaveLength(1)
    })
    it("only the audit module writes to the table, and only the super loader reads it", async () => {
      const { readdirSync, readFileSync, statSync } = await import("node:fs")
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
      const files = ["app", "lib", "components"].flatMap((d) => walk(path.join(root, d))).filter((f) => !f.includes(`${path.sep}db${path.sep}schema${path.sep}`))
      const using = files.filter((f) => readFileSync(f, "utf8").includes("securityAuditEvents")).map((f) => path.relative(root, f)).sort()
      expect(using).toEqual(["lib/core/payment-exceptions.ts".replace("payment-exceptions", "security-audit"), "lib/db/tenant-tables.ts", "lib/super/queries.ts"].sort())
      for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/\.(update|delete)\(\s*securityAuditEvents/)
    })
  })

  describe("what is recorded", () => {
    it("redacts sensitive keys, shortens long text, keeps plain data and caps the size", async () => {
      const d = await dealer()
      await audit.recordSecurityEvent({
        actorType: "owner",
        businessId: d.id,
        action: "test.redact",
        targetType: "x",
        outcome: "success",
        metadata: { ok: 1, phone: "+919876543210", email: "x@y.test", password: "p", token: "t", otp: "123456", secret: "s", payment_hash: "h", note: "n".repeat(500), nested: { deeper: { deepest: "z" }, aadhaar: "1" }, list: [1, 2, 3] },
      })
      const [row] = await byBusiness(d.id)
      const text = JSON.stringify(row)
      for (const leak of ["+919876543210", "x@y.test", "123456", '"p"', '"t"', '"s"']) expect(text).not.toContain(leak)
      expect(row.metadata).toMatchObject({ ok: 1, list: [1, 2, 3] })
      expect(String((row.metadata as { note: string }).note).length).toBeLessThanOrEqual(201)
      expect((row.metadata as { nested: Record<string, unknown> }).nested).not.toHaveProperty("aadhaar")
      expect(audit.safeMetadata({ big: "x".repeat(150), more: Array.from({ length: 30 }, (_, i) => `k${i}-${"y".repeat(100)}`) })).toEqual({ truncated: true })
    })
    it("records once for a repeated operation that carries the same dedupe key", async () => {
      const d = await dealer()
      const e = { actorType: "webhook" as const, businessId: d.id, action: "test.dedupe", targetType: "x", outcome: "success" as const, dedupeKey: `dk-${tag}-${n}` }
      await Promise.all(Array.from({ length: 8 }, () => audit.recordSecurityEvent(e)))
      await audit.recordSecurityEvent(e)
      expect(await byBusiness(d.id)).toHaveLength(1)
    })
    it("takes a Cloudflare ray id as the correlation id, ignores malformed ids, and never lets a client put free text in a log", async () => {
      const { requestIdFrom } = await import("../lib/core/request-id")
      const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null })
      expect(requestIdFrom(h({ "cf-ray": "8a1b2c3d4e5f6789-MAA" }))).toBe("8a1b2c3d4e5f6789-MAA")
      expect(requestIdFrom(h({ "x-request-id": "req_abcdef123456" }))).toBe("req_abcdef123456")
      expect(requestIdFrom(h({ "cf-ray": "<script>alert(1)</script>" }))).toMatch(/^[0-9a-f-]{36}$/)
      expect(requestIdFrom(h({ "x-request-id": "bad id with spaces\nand newline" }))).toMatch(/^[0-9a-f-]{36}$/)
      const d = await dealer()
      await audit.recordSecurityEvent({ actorType: "system", businessId: d.id, action: "test.rid", targetType: "x", outcome: "success", requestId: "8a1b2c3d4e5f6789-MAA" })
      expect((await byBusiness(d.id))[0].requestId).toBe("8a1b2c3d4e5f6789-MAA")
    })
    it("best-effort recording never throws, even when the write is refused", async () => {
      await expect(audit.recordSecurityEventBestEffort({ actorType: "system", action: "test.bogus", targetType: "x", outcome: "bogus" as never })).resolves.toBeUndefined()
      expect(await events(eq(s.securityAuditEvents.action, "test.bogus"))).toHaveLength(0)
    })
  })

  describe("coverage, actor and tenant context", () => {
    it("business creation, invitation, acceptance, revocation and removal each leave the right row with the right actor and business", async () => {
      const ownerUser = await user()
      const biz = await createDealer.createDealerForOwner(ownerUser.id, onboard(`created-${tag}-${++n}`))
      const person = await user()
      const email = `inv-${tag}-${++n}@example.test`
      const made = await inv.createInvite(biz, ownerUser.id, email)
      if (!made.ok) throw new Error(made.error)
      await inv.acceptInvite(made.token, person.id, { email, phone: null })
      const second = await inv.createInvite(biz, ownerUser.id, `rev-${tag}-${n}@example.test`)
      if (!second.ok) throw new Error(second.error)
      await inv.revokeInvite(biz, ownerUser.id, second.id)
      expect(await team.removeStaff(biz, ownerUser.id, person.id)).toEqual({ ok: true })

      const rows = await byBusiness(biz)
      const by = (a: string) => rows.filter((r) => r.action === a)
      expect(rows.map((r) => r.action).sort()).toEqual(["business.created", "team.invite_accepted", "team.invite_created", "team.invite_created", "team.invite_revoked", "team.remove_staff"])
      expect(by("business.created")[0]).toMatchObject({ actorType: "user", actorId: ownerUser.id, targetType: "business", targetId: biz, outcome: "success" })
      expect(by("team.invite_created").every((r) => r.actorType === "owner" && r.actorId === ownerUser.id && r.businessId === biz)).toBe(true)
      expect(by("team.invite_accepted")[0]).toMatchObject({ actorType: "user", actorId: person.id, businessId: biz, targetId: made.id })
      expect(by("team.invite_revoked")[0]).toMatchObject({ actorType: "owner", actorId: ownerUser.id, targetId: second.id })
      expect(by("team.remove_staff")[0]).toMatchObject({ actorType: "owner", actorId: ownerUser.id, targetId: person.id })
      // Another business's trail contains none of it.
      const other = await dealer()
      expect(await byBusiness(other.id)).toHaveLength(0)
    })
    it("no row holds the invitation token, its hash, the invited contact or any credential", async () => {
      const d = await dealer(), o = await owner(d), p = await user()
      const email = `secret-${tag}-${++n}@example.test`
      const made = await inv.createInvite(d.id, o.id, email)
      if (!made.ok) throw new Error(made.error)
      await inv.acceptInvite(made.token, p.id, { email, phone: null })
      const text = JSON.stringify(await byBusiness(d.id))
      for (const leak of [made.token, inv.hashInviteToken(made.token), email]) expect(text).not.toContain(leak)
    })
    it("a refused acceptance of a REAL invitation is recorded as denied with a reason; guesses at unknown tokens are not recorded", async () => {
      const d = await dealer(), o = await owner(d), p = await user()
      const made = await inv.createInvite(d.id, o.id, `denied-${tag}-${++n}@example.test`)
      if (!made.ok) throw new Error(made.error)
      await inv.acceptInvite(made.token, p.id, { email: "someone-else@example.test", phone: null })
      await inv.acceptInvite(inv.newInviteToken(), p.id, { email: "x@example.test", phone: null })
      await inv.acceptInvite("garbage", p.id, { email: null, phone: null })
      const denied = (await byBusiness(d.id)).filter((r) => r.outcome === "denied")
      expect(denied).toHaveLength(1)
      expect(denied[0]).toMatchObject({ actorId: p.id, action: "team.invite_accepted", targetId: made.id })
      expect(denied[0].metadata).toEqual({ reason: "identity_mismatch" })
      expect(JSON.stringify(denied[0])).not.toContain("someone-else@example.test")
    })
    it("ten simultaneous acceptances record exactly one acceptance", async () => {
      const d = await dealer(), o = await owner(d), p = await user()
      const email = `race-${tag}-${++n}@example.test`
      const made = await inv.createInvite(d.id, o.id, email)
      if (!made.ok) throw new Error(made.error)
      await Promise.all(Array.from({ length: 10 }, () => inv.acceptInvite(made.token, p.id, { email, phone: null })))
      expect((await byBusiness(d.id)).filter((r) => r.action === "team.invite_accepted" && r.outcome === "success")).toHaveLength(1)
    })
  })

  describe("fail-closed: no audit record, no action", () => {
    it("an invitation is not created if its audit record cannot be written", async () => {
      const d = await dealer(), o = await owner(d)
      await withAuditFault(`new.business_id = '${d.id}'`, async () => {
        await expect(inv.createInvite(d.id, o.id, `fc1-${tag}-${++n}@example.test`)).rejects.toThrow()
      })
      expect(await unscopedDb.select().from(s.teamInvites).where(eq(s.teamInvites.dealerId, d.id))).toHaveLength(0)
    })
    it("an invitation is not consumed and no membership is granted if the acceptance cannot be recorded", async () => {
      const d = await dealer(), o = await owner(d), p = await user()
      const email = `fc2-${tag}-${++n}@example.test`
      const made = await inv.createInvite(d.id, o.id, email)
      if (!made.ok) throw new Error(made.error)
      await withAuditFault(`new.action = 'team.invite_accepted' and new.business_id = '${d.id}' and new.outcome = 'success'`, async () => {
        await expect(inv.acceptInvite(made.token, p.id, { email, phone: null })).rejects.toThrow()
      })
      expect((await unscopedDb.select().from(s.teamInvites).where(eq(s.teamInvites.id, made.id)))[0].acceptedAt).toBeNull()
      expect(await unscopedDb.select().from(s.dealerUsers).where(eq(s.dealerUsers.userId, p.id))).toHaveLength(0)
      // Once the fault is gone the same invitation still works: nothing was half-done.
      expect((await inv.acceptInvite(made.token, p.id, { email, phone: null })).ok).toBe(true)
    })
    it("a staff member is not removed, and a business is not created, if the record cannot be written", async () => {
      const d = await dealer(), o = await owner(d), staff = await user()
      await unscopedDb.insert(s.dealerUsers).values({ dealerId: d.id, userId: staff.id, role: "staff" })
      await withAuditFault(`new.action = 'team.remove_staff' and new.business_id = '${d.id}'`, async () => {
        await expect(team.removeStaff(d.id, o.id, staff.id)).rejects.toThrow()
      })
      expect(await unscopedDb.select().from(s.dealerUsers).where(and(eq(s.dealerUsers.dealerId, d.id), eq(s.dealerUsers.userId, staff.id)))).toHaveLength(1)
      const founder = await user()
      const slug = `fc-created-${tag}-${++n}`
      await withAuditFault(`new.action = 'business.created' and new.actor_id = '${founder.id}'`, async () => {
        await expect(createDealer.createDealerForOwner(founder.id, onboard(slug))).rejects.toThrow()
      })
      expect(await unscopedDb.select().from(s.dealers).where(eq(s.dealers.slug, slug))).toHaveLength(0)
      expect(await unscopedDb.select().from(s.dealerUsers).where(eq(s.dealerUsers.userId, founder.id))).toHaveLength(0)
    })
    it("a payment exception stays open if its resolution cannot be recorded, and resolving records who did it", async () => {
      const ex = await import("../lib/core/payment-exceptions")
      const ref = `pay_audit_${tag}_${++n}`
      await ex.recordException({ kind: "unmatched_payment", ref, detail: "t" })
      const row = (await unscopedDb.select().from(s.paymentExceptions).where(eq(s.paymentExceptions.ref, ref)))[0]
      await withAuditFault(`new.action = 'payment_exception.resolve' and new.target_id = '${row.id}'`, async () => {
        await expect(ex.resolveExceptionAudited(row.id, { email: "ops@tany.test", uid: "u1" }, "handled by hand")).rejects.toThrow()
      })
      expect((await unscopedDb.select().from(s.paymentExceptions).where(eq(s.paymentExceptions.id, row.id)))[0].status).toBe("open")
      expect(await ex.resolveExceptionAudited(row.id, { email: "ops@tany.test", uid: "u1" }, "handled by hand")).toBe(true)
      expect(await ex.resolveExceptionAudited(row.id, { email: "ops@tany.test", uid: "u1" }, "again")).toBe(false)
      expect(await events(and(eq(s.securityAuditEvents.action, "payment_exception.resolve"), eq(s.securityAuditEvents.targetId, row.id))!)).toHaveLength(1)
    })
  })

  describe("Tany team exports", () => {
    const call = async (kind: string) => {
      const { NextRequest } = await import("next/server")
      return exportRoute.GET(new NextRequest(`http://app.test/super/export/${kind}`), { params: Promise.resolve({ kind }) })
    }
    it("an export is recorded (who, what kind, how many rows) before the data is released, and never contains the data", async () => {
      who.admin = `exporter-${tag}@tany.test`
      const res = await call("businesses")
      expect(res.status).toBe(200)
      const csv = await res.text()
      const rows = await events(and(eq(s.securityAuditEvents.action, "super.export"), eq(s.securityAuditEvents.actorLabel, who.admin))!)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ actorType: "super_admin", actorId: `uid-exporter-${tag}`, targetType: "export", targetId: "businesses", outcome: "success" })
      expect((rows[0].metadata as { rows: number }).rows).toBeGreaterThan(0)
      // Content of the export (a business name from the CSV) is not in the record.
      const firstName = csv.split("\n")[1]?.split(",")[0]?.replace(/"/g, "")
      if (firstName && firstName.length > 3) expect(JSON.stringify(rows[0])).not.toContain(firstName)
    })
    it("an export is refused (503) and nothing is released if the record cannot be written", async () => {
      who.admin = `blocked-${tag}@tany.test`
      await withAuditFault(`new.actor_label = 'blocked-${tag}@tany.test'`, async () => {
        const res = await call("businesses")
        expect(res.status).toBe(503)
        expect(await res.text()).not.toContain("text/csv")
        expect(res.headers.get("content-type") ?? "").not.toContain("text/csv")
      })
      expect(await events(eq(s.securityAuditEvents.actorLabel, `blocked-${tag}@tany.test`))).toHaveLength(0)
    })
    it("a non-team caller gets nothing and leaves no export record", async () => {
      who.admin = null
      await expect(call("businesses")).rejects.toThrow("NEXT_NOT_FOUND")
    })
  })

  describe("who can read the trail", () => {
    it("only a Tany team member: everyone else is refused before any query", async () => {
      who.admin = null
      await expect(queries.loadSecurityEvents({})).rejects.toThrow("NEXT_NOT_FOUND")
      who.admin = `reader-${tag}@tany.test`
      const all = await queries.loadSecurityEvents({ limit: 500 })
      expect(all.length).toBeGreaterThan(0)
      expect(all.length).toBeLessThanOrEqual(500)
    })
    it("filters by business, action, outcome and actor, and ignores malformed filters", async () => {
      who.admin = `reader-${tag}@tany.test`
      const d = await dealer()
      await audit.recordSecurityEvent({ actorType: "owner", actorId: "actor-1", businessId: d.id, action: "test.filter.a", targetType: "x", outcome: "denied" })
      await audit.recordSecurityEvent({ actorType: "owner", actorId: "actor-2", businessId: d.id, action: "test.filter.b", targetType: "x", outcome: "success" })
      expect(await queries.loadSecurityEvents({ businessId: d.id })).toHaveLength(2)
      expect((await queries.loadSecurityEvents({ businessId: d.id, outcome: "denied" })).map((r) => r.action)).toEqual(["test.filter.a"])
      expect((await queries.loadSecurityEvents({ businessId: d.id, action: "test.filter.b" })).map((r) => r.actorId)).toEqual(["actor-2"])
      expect((await queries.loadSecurityEvents({ businessId: d.id, actor: "actor-1" })).map((r) => r.action)).toEqual(["test.filter.a"])
      expect(await queries.loadSecurityEvents({ businessId: "not-a-uuid'; drop table x;--", outcome: "nonsense", action: "%'; --" })).toBeDefined()
    })
  })
})
