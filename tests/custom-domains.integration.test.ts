// Live test: a business's own domain from claim to main address, with Cloudflare and DNS faked at fetch. Runs only against a DISPOSABLE migrated database.
import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { DEFAULT_THEME } from "../lib/theme/tokens"
import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()

describe.skipIf(!url)("custom domains (live database)", () => {
  let d: typeof import("../lib/tenant/domains")
  let lookup: typeof import("../lib/tenant/lookup")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  const tag = randomBytes(3).toString("hex")
  const hostname = `www.shop-${tag}.com`
  const actor = `owner-${tag}`
  let a: { id: string; slug: string }
  let b: { id: string; slug: string }

  // The fake outside world.
  const dns = { txt: [] as string[], cname: [] as string[] }
  const cf = { status: "pending", ssl: "pending_validation", exists: true, down: false, created: 0, deleted: 0 }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    vi.stubEnv("CUSTOM_DOMAIN_TARGET", "customers.tany.in")
    vi.stubEnv("CUSTOM_DOMAIN_API_TOKEN", "test")
    vi.stubEnv("CLOUDFLARE_ZONE_ID", "zone")
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const u = new URL(input)
      if (u.hostname === "cloudflare-dns.com") {
        const txt = u.searchParams.get("type") === "TXT"
        return Response.json({ Answer: (txt ? dns.txt : dns.cname).map((data) => ({ type: txt ? 16 : 5, data: txt ? `"${data}"` : `${data}.` })) })
      }
      if (cf.down) return Response.json({ success: false }, { status: 500 })
      if (init?.method === "POST") {
        cf.created++
        cf.exists = true
        return Response.json({ success: true, result: { id: `cf-${tag}`, hostname, status: cf.status } })
      }
      if (init?.method === "DELETE") {
        cf.deleted++
        return Response.json({ success: true })
      }
      if (!cf.exists) return Response.json({ success: false }, { status: 404 })
      return Response.json({ success: true, result: { id: `cf-${tag}`, hostname, status: cf.status, ssl: { status: cf.ssl } } })
    })
    d = await import("../lib/tenant/domains")
    lookup = await import("../lib/tenant/lookup")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
    const rows = await unscopedDb
      .insert(s.dealers)
      .values(["a", "b"].map((n) => ({ slug: `dom-${n}-${tag}`, displayName: n, city: "Chennai", industry: "retail" as const, plan: "pro", theme: DEFAULT_THEME })))
      .returning()
    ;[a, b] = rows
  })
  // No row cleanup: the audit log is append-only and refers to the businesses, and this database is disposable. Names are unique per run.
  afterAll(async () => {
    await pool.end()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const stage = async () => (await import("../lib/domains/hostname")).domainStage((await d.getDomain(a.id))!)
  const served = async () => {
    lookup.forgetDomain(a.slug, hostname)
    return { custom: await lookup.resolveCustomDomain(hostname), primary: await lookup.resolvePrimaryHost(a.slug) }
  }

  it("holds one domain per business and one business per domain", async () => {
    expect(await d.addDomain(a, hostname, actor)).toEqual({ ok: true })
    expect((await d.addDomain(a, `shop.shop-${tag}.com`, actor)).ok).toBe(false)
    expect((await d.addDomain(b, hostname, actor)).ok).toBe(false)
  })

  const myRecord = async () => `${(await d.getDomain(a.id))!.verificationToken}.customers.tany.in`

  it("does not tell Cloudflare or serve anything until a record proves ownership", async () => {
    // Pointing at us is not proof: this is what a record left behind by an earlier owner looks like.
    for (const left of ["customers.tany.in", "0000.customers.tany.in"]) {
      dns.cname = [left]
      const res = await d.checkDomain(a)
      expect(res.ok === false && res.error).toContain(await myRecord())
    }
    await d.sweepDomains()
    expect(cf.created).toBe(0)
    expect(await stage()).toBe("pending_dns")
    expect(await served()).toEqual({ custom: null, primary: null })
    expect((await d.makePrimary(a, actor)).ok).toBe(false)
  })

  it("connects from the one CNAME record without the owner pressing anything, and without redirecting yet", async () => {
    dns.cname = [await myRecord()]
    await d.sweepDomains()
    expect(cf.created).toBe(1)
    expect(await stage()).toBe("securing")
    cf.status = "active"
    cf.ssl = "active"
    expect(await d.sweepDomains()).toMatchObject({ failed: 0 })
    expect(await stage()).toBe("ready")
    expect(await served()).toEqual({ custom: a.slug, primary: null })
  })

  it("becomes the main address only on the owner's confirmation", async () => {
    expect(await d.makePrimary(a, actor)).toEqual({ ok: true })
    expect(await served()).toEqual({ custom: a.slug, primary: hostname })
    expect(await d.siteUrl(a.slug, "/menu")).toBe(`https://${hostname}/menu`)
  })

  it("changes nothing when Cloudflare cannot be reached", async () => {
    cf.down = true
    // Other businesses still waiting for their record need only DNS, so just this registered domain is certain to fail.
    expect((await d.sweepDomains()).failed).toBeGreaterThanOrEqual(1)
    expect(await stage()).toBe("live")
    cf.down = false
  })

  it("falls back to the default address while the domain is broken, and returns by itself", async () => {
    cf.status = "moved"
    await d.sweepDomains()
    expect(await stage()).toBe("interrupted")
    expect(await served()).toEqual({ custom: null, primary: null })
    expect(await d.siteUrl(a.slug)).toContain(`${a.slug}.`)
    cf.status = "active"
    await d.sweepDomains()
    expect(await served()).toEqual({ custom: a.slug, primary: hostname })
  })

  it("stops serving it when the plan no longer includes a domain", async () => {
    const { eq } = await import("drizzle-orm")
    await unscopedDb.update(s.dealers).set({ plan: "growth" }).where(eq(s.dealers.id, a.id))
    expect(await served()).toEqual({ custom: null, primary: null })
    await unscopedDb.update(s.dealers).set({ plan: "pro" }).where(eq(s.dealers.id, a.id))
  })

  it("keeps the record if Cloudflare cannot remove it, and frees the name once it can", async () => {
    cf.down = true
    expect((await d.removeDomain(a, actor)).ok).toBe(false)
    expect(await d.getDomain(a.id)).not.toBeNull()
    cf.down = false
    expect(await d.removeDomain(a, actor)).toEqual({ ok: true })
    expect(cf.deleted).toBe(1)
    expect(await served()).toEqual({ custom: null, primary: null })
  })

  it("accepts the TXT record where a provider hides the CNAME", async () => {
    await d.addDomain(a, hostname, actor)
    dns.cname = []
    dns.txt = [`tany-verify=${(await d.getDomain(a.id))!.verificationToken}`]
    expect((await d.checkDomain(a)).ok).toBe(true)
    expect(await d.removeDomain(a, actor)).toEqual({ ok: true })
  })

  it("lets another business take over a claim only once it has been abandoned", async () => {
    await d.addDomain(a, hostname, actor)
    expect((await d.addDomain(b, hostname, actor)).ok).toBe(false)
    expect(await d.addDomain(b, hostname, actor, new Date(Date.now() + 73 * 3_600_000))).toEqual({ ok: true })
    expect(await d.getDomain(a.id)).toBeNull()
  })
})
