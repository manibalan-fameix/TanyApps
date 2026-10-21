import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from "jose"
import { beforeAll, describe, expect, it } from "vitest"

import { verifyFirebaseIdToken } from "../lib/auth/firebase"

const PROJECT = "tany-test"
let privateKey: CryptoKey
let keys: ReturnType<typeof createLocalJWKSet>

beforeAll(async () => {
  const pair = await generateKeyPair("RS256")
  privateKey = pair.privateKey
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), alg: "RS256", kid: "k1" }] })
})

const token = (claims: Record<string, unknown> = {}, opts: { iss?: string; aud?: string; exp?: string; key?: CryptoKey } = {}) =>
  new SignJWT({ firebase: { sign_in_provider: "google.com" }, email: "Dealer@Example.com", email_verified: true, name: "Dealer", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setSubject("uid-1")
    .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`)
    .setAudience(opts.aud ?? PROJECT)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(opts.key ?? privateKey)

describe("verifyFirebaseIdToken", () => {
  it("accepts a valid token and lowercases the email", async () => {
    const id = await verifyFirebaseIdToken(await token(), PROJECT, keys)
    expect(id).toMatchObject({ uid: "uid-1", email: "dealer@example.com", emailVerified: true, provider: "google.com" })
  })
  it("reads phone sign-ins", async () => {
    const id = await verifyFirebaseIdToken(
      await token({ email: undefined, email_verified: undefined, phone_number: "+919876543210", firebase: { sign_in_provider: "phone" } }),
      PROJECT,
      keys,
    )
    expect(id).toMatchObject({ phone: "+919876543210", email: null, provider: "phone" })
  })
  it("rejects wrong audience, wrong issuer, expired tokens, foreign keys and junk", async () => {
    const other = (await generateKeyPair("RS256")).privateKey
    for (const t of [
      await token({}, { aud: "someone-else" }),
      await token({}, { iss: "https://securetoken.google.com/someone-else" }),
      await token({}, { exp: "-1h" }),
      await token({}, { key: other }),
      "not-a-jwt",
      "",
    ]) {
      expect(await verifyFirebaseIdToken(t, PROJECT, keys)).toBeNull()
    }
  })
  it("returns null when the project is not configured", async () => {
    expect(await verifyFirebaseIdToken(await token(), undefined, keys)).toBeNull()
  })
})
