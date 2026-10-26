// The whole identity chain for the Tany team area, with real signed tokens: Firebase ID token -> verification -> sign-in claims ->
// JWT -> session -> guard. Keys are generated locally; nothing leaves the machine.
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { verifyFirebaseIdToken } from "../lib/auth/firebase"
import { applySignInClaims, exposeClaims, identityMaySignIn, withVerifiedClaims } from "../lib/auth/session-claims"

const PROJECT = "tany-test"
const TEAM = "founder@tany.test"
let privateKey: CryptoKey
let keys: ReturnType<typeof createLocalJWKSet>
let session: unknown = null

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`)
  },
  notFound: () => {
    throw new Error("notFound")
  },
}))
vi.mock("../lib/auth", () => ({ auth: async () => session }))

beforeAll(async () => {
  const pair = await generateKeyPair("RS256")
  privateKey = pair.privateKey
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: "RS256", kid: "k1" }] })
})
beforeEach(() => {
  session = null
  process.env.SUPER_ADMIN_EMAILS = TEAM
  delete process.env.SUPER_ADMIN_UIDS
})

const token = (claims: Record<string, unknown> = {}, over: { uid?: string; aud?: string; exp?: string; key?: CryptoKey } = {}) =>
  new SignJWT({ firebase: { sign_in_provider: "google.com" }, email: TEAM, email_verified: true, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setSubject(over.uid ?? "uid-founder")
    .setIssuer(`https://securetoken.google.com/${PROJECT}`)
    .setAudience(over.aud ?? PROJECT)
    .setIssuedAt()
    .setExpirationTime(over.exp ?? "1h")
    .sign(over.key ?? privateKey)

/** What the app does at sign-in: verify, decide whether to allow, add claims, store in the JWT, expose on the session. */
async function signInWith(idToken: string, rowEmail: string | null = null) {
  const identity = await verifyFirebaseIdToken(idToken, PROJECT, keys)
  if (!identity || !identityMaySignIn(identity)) return null
  const row = { id: "user-1", name: "X", email: rowEmail, image: null } // the users row: its email is whatever was written to it
  const jwt = applySignInClaims({ sub: "user-1" }, withVerifiedClaims(row, identity))
  return exposeClaims({ user: { id: "user-1", email: rowEmail } }, jwt)
}
async function guard() {
  vi.resetModules()
  return import("../lib/super/guard")
}

describe("a genuine team member", () => {
  it("passes the guard with a verified team email", async () => {
    session = await signInWith(await token())
    expect(session).not.toBeNull()
    expect((await (await guard()).requireSuperAdmin()).email).toBe(TEAM)
  })
  it("passes with the matching uid when a uid list is set, and not with another", async () => {
    session = await signInWith(await token())
    process.env.SUPER_ADMIN_UIDS = "uid-founder"
    await expect((await guard()).requireSuperAdmin()).resolves.toEqual({ email: TEAM })
    process.env.SUPER_ADMIN_UIDS = "someone-else"
    await expect((await guard()).requireSuperAdmin()).rejects.toThrow("notFound")
  })
})

describe("only a verified Firebase identity reaches the guard", () => {
  it("a team email that Firebase has NOT verified carries no claim", async () => {
    session = await signInWith(await token({ email_verified: false }))
    await expect((await guard()).requireSuperAdmin()).rejects.toThrow("redirect:/super/login")
  })
  it("a phone sign-in is refused even when the users row carries a team email", async () => {
    session = await signInWith(await token({ email: undefined, email_verified: undefined, phone_number: "+919876543210", firebase: { sign_in_provider: "phone" } }), TEAM)
    await expect((await guard()).requireSuperAdmin()).rejects.toThrow("redirect:/super/login")
  })
  it("a verified non-team Google account whose users row carries a team email is refused", async () => {
    session = await signInWith(await token({ email: "dealer@shop.test" }, { uid: "uid-dealer" }), TEAM)
    await expect((await guard()).requireSuperAdmin()).rejects.toThrow("notFound")
  })
  it("a teammate password session (no Firebase identity) has null claims and is refused", async () => {
    const jwt = applySignInClaims({ sub: "user-2" }, { id: "user-2", email: TEAM }) // what the teammate provider returns: no claims
    session = exposeClaims({ user: { id: "user-2", email: TEAM } }, jwt)
    await expect((await guard()).requireSuperAdmin()).rejects.toThrow("redirect:/super/login")
  })
  it("a session object that already holds a claim cannot keep it: the token is the only source", () => {
    const forged = { user: {}, verifiedEmail: TEAM, verifiedUid: "uid-founder" }
    expect(exposeClaims(forged, { sub: "u" })).toMatchObject({ verifiedEmail: null, verifiedUid: null })
    expect(exposeClaims({ user: {} }, { verifiedEmail: 123, verifiedUid: {} })).toMatchObject({ verifiedEmail: null, verifiedUid: null })
  })
  it("a later request cannot add claims: with no sign-in user the token is left unchanged", () => {
    expect(applySignInClaims({ sub: "u" }, undefined)).toEqual({ sub: "u" })
    expect(applySignInClaims({ sub: "u", verifiedEmail: null }, null)).toEqual({ sub: "u", verifiedEmail: null })
  })
  it("a session from before the claims existed is refused", async () => {
    session = { user: { email: TEAM } }
    await expect((await guard()).requireSuperAdmin()).rejects.toThrow("redirect:/super/login")
  })
})

describe("Firebase token validation feeding sign-in", () => {
  it("rejects wrong audience, wrong signing key, expired and garbage tokens, so no session can start", async () => {
    const other = (await generateKeyPair("RS256")).privateKey
    expect(await signInWith(await token({}, { aud: "another-project" }))).toBeNull()
    expect(await signInWith(await token({}, { key: other }))).toBeNull()
    expect(await signInWith(await token({}, { exp: "-1m" }))).toBeNull()
    expect(await signInWith("not.a.jwt")).toBeNull()
  })
  it("an email+password account must be verified before it gets any session", async () => {
    expect(await signInWith(await token({ email_verified: false, firebase: { sign_in_provider: "password" } }))).toBeNull()
    expect(await signInWith(await token({ email_verified: true, firebase: { sign_in_provider: "password" } }))).not.toBeNull()
  })
})
