import { describe, expect, it } from "vitest"

import { issueSession, needsRenewal, readSession, SESSION_SECONDS } from "../../lib/core/login/customer-session"
import { sameOrigin } from "../../lib/core/login/origin"
import { signToken } from "../../lib/core/login/sign"
import { TICKET_TTL_SECONDS, checkTicket, issueTicket, safeNext } from "../../lib/core/login/ticket"

const S = "test-secret"
const now = Date.UTC(2026, 9, 21, 10, 0, 0)
const mk = (over: Partial<Parameters<typeof issueTicket>[0]> = {}) => issueTicket({ phone: "+919876543210", host: "Sri.tany.in", state: "s".repeat(22), next: "/book", ...over }, now, S)

describe("login ticket", () => {
  it("is accepted for its host and browser within a minute", async () => {
    const r = await checkTicket(await mk(), { host: "sri.tany.in", state: "s".repeat(22) }, now + 30_000, S)
    expect(r).toMatchObject({ ok: true, ticket: { sub: "+919876543210", next: "/book" } })
  })
  it("lives for 60 seconds", async () => {
    expect(TICKET_TTL_SECONDS).toBe(60)
    const t = await mk()
    expect((await checkTicket(t, { host: "sri.tany.in", state: "s".repeat(22) }, now + 59_000, S)).ok).toBe(true)
    expect((await checkTicket(t, { host: "sri.tany.in", state: "s".repeat(22) }, now + 61_000, S)).ok).toBe(false)
  })
  it("is refused on another business's host", async () => {
    expect(await checkTicket(await mk(), { host: "other.tany.in", state: "s".repeat(22) }, now, S)).toEqual({ ok: false, reason: "wrong_host" })
  })
  it("is refused when the browser's state differs or is missing (login CSRF)", async () => {
    expect(await checkTicket(await mk(), { host: "sri.tany.in", state: "x".repeat(22) }, now, S)).toEqual({ ok: false, reason: "wrong_state" })
    expect(await checkTicket(await mk(), { host: "sri.tany.in", state: null }, now, S)).toEqual({ ok: false, reason: "wrong_state" })
  })
  it("is refused when tampered with, signed with another secret, or garbage", async () => {
    const t = await mk()
    const [p, sig] = t.split(".")
    const forged = `${btoa(JSON.stringify({ ...JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))), sub: "+910000000000" })).replace(/=+$/, "")}.${sig}`
    for (const bad of [forged, `${p}.${sig}x`, "", "a.b.c", "nonsense", null]) {
      expect((await checkTicket(bad, { host: "sri.tany.in", state: "s".repeat(22) }, now, S)).ok).toBe(false)
    }
    expect((await checkTicket(t, { host: "sri.tany.in", state: "s".repeat(22) }, now, "other-secret")).ok).toBe(false)
  })
  it("has a unique id each time", async () => {
    const a = await checkTicket(await mk(), { host: "sri.tany.in", state: "s".repeat(22) }, now, S)
    const b = await checkTicket(await mk(), { host: "sri.tany.in", state: "s".repeat(22) }, now, S)
    expect(a.ok && b.ok && a.ticket.jti !== b.ticket.jti).toBe(true)
  })
})

describe("safeNext", () => {
  it("keeps same-site paths and drops everything else", () => {
    expect(safeNext("/book?x=1")).toBe("/book?x=1")
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined, "/a\nb", `/${"a".repeat(400)}`]) expect(safeNext(bad)).toBe("/")
  })
})

describe("customer session", () => {
  it("is readable by its own business and nobody else", async () => {
    const t = await issueSession({ cid: "c1", did: "dealer-a", v: 1 }, now, S)
    expect(await readSession(t, "dealer-a", now + 1000, S)).toMatchObject({ cid: "c1" })
    expect(await readSession(t, "dealer-b", now + 1000, S)).toBeNull()
  })
  it("expires after 30 days", async () => {
    const t = await issueSession({ cid: "c1", did: "d", v: 1 }, now, S)
    expect(SESSION_SECONDS).toBe(30 * 86_400)
    expect(await readSession(t, "d", now + (SESSION_SECONDS - 5) * 1000, S)).not.toBeNull()
    expect(await readSession(t, "d", now + (SESSION_SECONDS + 5) * 1000, S)).toBeNull()
  })
  it("is renewed at most once a day, and each renewal gives a fresh 30 days", async () => {
    const t = (await readSession(await issueSession({ cid: "c", did: "d", v: 1 }, now, S), "d", now, S))!
    expect(needsRenewal(t, now + 3_600_000)).toBe(false)
    expect(needsRenewal(t, now + 86_399_000)).toBe(false)
    expect(needsRenewal(t, now + 86_400_000)).toBe(true)
    const later = now + 10 * 86_400_000
    const renewed = (await readSession(await issueSession({ cid: t.cid, did: t.did, v: t.v }, later, S), "d", later, S))!
    expect(renewed.exp - renewed.iat).toBe(SESSION_SECONDS)
    expect(needsRenewal(renewed, later + 3_600_000)).toBe(false)
  })
  it("cannot be forged from a login ticket (separate keys per kind)", async () => {
    const asTicket = await signToken("login-ticket", { cid: "c", did: "d", v: 1, iat: 0, exp: Math.floor(now / 1000) + 100 }, S)
    expect(await readSession(asTicket, "d", now, S)).toBeNull()
  })
})

describe("sameOrigin", () => {
  const req = (h: Record<string, string>) => new Request("https://sri.tany.in/x", { headers: h })
  it("accepts the site's own origin only", () => {
    expect(sameOrigin(req({ origin: "https://sri.tany.in", host: "sri.tany.in" }))).toBe(true)
    expect(sameOrigin(req({ origin: "https://evil.com", host: "sri.tany.in" }))).toBe(false)
    expect(sameOrigin(req({ host: "sri.tany.in" }))).toBe(false)
    expect(sameOrigin(req({ origin: "not a url", host: "sri.tany.in" }))).toBe(false)
  })
})
