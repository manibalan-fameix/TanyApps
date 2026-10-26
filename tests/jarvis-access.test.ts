// Jarvis: Cloudflare Access JWT verification and the shared rate limit. Tokens are signed locally; the key set is served from a stubbed
// fetch. This proves the Worker's own checks. It does NOT prove that Access is configured in the Cloudflare dashboard: that is an owner
// action with its own verification steps (docs/release/operational-security.md).
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import worker from "../workers/jarvis/index.mjs"
import { accessState, overSharedLimit, verifyAccess } from "../workers/jarvis/access.mjs"

const TEAM = "tany.cloudflareaccess.com"
const AUD = "app-audience-tag"
const PASS = "correct-horse-battery"
let priv: CryptoKey
let jwks: ReturnType<typeof createLocalJWKSet>
let jwksJson: { keys: unknown[] }

beforeAll(async () => {
  const pair = await generateKeyPair("RS256")
  priv = pair.privateKey
  const jwk = { ...(await exportJWK(pair.publicKey)), alg: "RS256", kid: "k1" }
  jwksJson = { keys: [jwk] }
  jwks = createLocalJWKSet(jwksJson as never)
})
afterEach(() => vi.unstubAllGlobals())

const token = (over: { aud?: string; iss?: string; exp?: string; email?: string | null; key?: CryptoKey } = {}) =>
  new SignJWT({ ...(over.email === null ? {} : { email: over.email ?? "ops@tany.test" }) })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setSubject("access-user-1")
    .setIssuer(over.iss ?? `https://${TEAM}`)
    .setAudience(over.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(over.exp ?? "1h")
    .sign(over.key ?? priv)
const req = (jwt?: string) => new Request("https://x/api/warm", { method: "POST", headers: jwt ? { "cf-access-jwt-assertion": jwt } : {} })
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD }

describe("verifyAccess", () => {
  it("returns the verified email for a genuine token", async () => {
    expect(await verifyAccess(req(await token()), env, jwks)).toBe("ops@tany.test")
  })
  it("falls back to the subject when the token has no email (a service token)", async () => {
    expect(await verifyAccess(req(await token({ email: null })), env, jwks)).toBe("access-user-1")
  })
  it("refuses a missing, malformed, expired, wrong-audience, wrong-issuer or wrongly signed token", async () => {
    const other = (await generateKeyPair("RS256")).privateKey
    for (const bad of [undefined, "not.a.jwt", await token({ exp: "-1m" }), await token({ aud: "someone-else" }), await token({ iss: "https://evil.cloudflareaccess.com" }), await token({ key: other })]) {
      expect(await verifyAccess(req(bad), env, jwks), String(bad).slice(0, 20)).toBeNull()
    }
  })
  it("refuses an unsigned token", async () => {
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ iss: `https://${TEAM}`, aud: AUD, email: "x@y.test", exp: 9_999_999_999 })).toString("base64url")}.`
    expect(await verifyAccess(req(none), env, jwks)).toBeNull()
  })
})

describe("accessState", () => {
  it("is on only when both settings exist; one alone is a misconfiguration, never silently off", () => {
    expect(accessState({})).toBe("off")
    expect(accessState(env)).toBe("on")
    expect(accessState({ ACCESS_TEAM_DOMAIN: TEAM })).toBe("misconfigured")
    expect(accessState({ ACCESS_AUD: AUD })).toBe("misconfigured")
  })
})

describe("the Worker with Access configured", () => {
  const base = { JARVIS_PASSPHRASE: PASS, JARVIS_TOKEN: "ghp_fake", ASSETS: { fetch: async () => new Response("page") }, ...env }
  const call = (jwt: string | undefined, pass = PASS, e: Record<string, unknown> = base) =>
    worker.fetch(new Request("https://jarvis.test/api/warm", { method: "POST", headers: { authorization: `Bearer ${pass}`, "cf-connecting-ip": `198.51.100.${Math.floor(Math.random() * 250)}`, ...(jwt ? { "cf-access-jwt-assertion": jwt } : {}) } }), e, { waitUntil() {} })
  const serveKeys = () => vi.stubGlobal("fetch", vi.fn(async (u: string) => (String(u).includes("/cdn-cgi/access/certs") ? new Response(JSON.stringify(jwksJson), { headers: { "content-type": "application/json" } }) : new Response("{}", { status: 404 }))))

  it("refuses a request without Access's token even when the passphrase is right (a bypass of Access does not reach the passphrase)", async () => {
    serveKeys()
    expect((await call(undefined)).status).toBe(401)
    expect((await call("forged.token.value")).status).toBe(401)
  })
  it("still needs the passphrase when the Access token is valid", async () => {
    serveKeys()
    expect((await call(await token(), "wrong-passphrase")).status).toBe(401)
    expect((await call(await token())).status).toBe(204)
  })
  it("a half-configured Access fails closed with a clear error rather than disabling the check", async () => {
    const res = await call(await token(), PASS, { ...base, ACCESS_AUD: "" })
    expect(res.status).toBe(503)
  })
  it("Slack's own events path is not behind Access (it is called by Slack and protected by Slack's signature)", async () => {
    const secret = "slack-signing-secret"
    const body = JSON.stringify({ type: "url_verification", challenge: "abc123" })
    const ts = String(Math.floor(Date.now() / 1000))
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    const sig = "v0=" + Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${body}`))).toString("hex")
    const res = await worker.fetch(new Request("https://jarvis.test/api/slack/events", { method: "POST", headers: { "x-slack-request-timestamp": ts, "x-slack-signature": sig }, body }), { ...base, SLACK_SIGNING_SECRET: secret }, { waitUntil() {} })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ challenge: "abc123" })
  })
  it("without Access configured, behaviour is unchanged (passphrase only)", async () => {
    const plain = { JARVIS_PASSPHRASE: PASS, ASSETS: base.ASSETS }
    expect((await call(undefined, PASS, plain)).status).toBe(204)
  })
})

describe("the shared rate limit", () => {
  const limiter = (answers: (boolean | Error)[]) => {
    const hits: string[] = []
    return {
      hits,
      ns: { idFromName: (n: string) => n, get: (id: string) => ({ hit: async () => { hits.push(id); const a = answers.shift() ?? true; if (a instanceof Error) throw a; return a } }) },
    }
  }
  it("says 'over' when the shared limiter refuses, and 'no opinion' when it is unbound or down", async () => {
    expect(await overSharedLimit({}, "k", 60, 60_000)).toBe(false)
    const refusing = limiter([false])
    expect(await overSharedLimit({ RATE_LIMITER: refusing.ns }, "k", 60, 60_000)).toBe(true)
    expect(await overSharedLimit({ RATE_LIMITER: limiter([new Error("down")]).ns }, "k", 60, 60_000)).toBe(false)
  })
  it("the Worker answers 429 before comparing the passphrase when the shared limit is exceeded, and counts every attempt", async () => {
    const lim = limiter([true, false])
    const e = { JARVIS_PASSPHRASE: PASS, ASSETS: { fetch: async () => new Response("page") }, RATE_LIMITER: lim.ns }
    const go = (pass: string) => worker.fetch(new Request("https://jarvis.test/api/warm", { method: "POST", headers: { authorization: `Bearer ${pass}`, "cf-connecting-ip": "203.0.113.50" } }), e, { waitUntil() {} })
    expect((await go("wrong")).status).toBe(401) // first attempt counted, allowed, wrong passphrase
    expect((await go(PASS)).status).toBe(429) // limiter refuses the second, even with the right passphrase
    expect(lim.hits).toEqual(["jarvis:203.0.113.50", "jarvis:203.0.113.50"])
  })
})
