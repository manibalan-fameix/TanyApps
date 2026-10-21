import { randomToken, signToken, verifyToken } from "./sign"

/**
 * A customer's session on ONE business's site. It lives in a cookie that belongs to that site's host alone (no Domain attribute), so
 * the browser never sends it to another business, and it also names the business inside the token.
 */
export const SESSION_DAYS = 30
export const SESSION_SECONDS = SESSION_DAYS * 86_400
/** Renew when fewer than this many seconds are left, so an active customer stays signed in without a fixed end. */
export const RENEW_BELOW_SECONDS = 7 * 86_400

export type CustomerSession = {
  /** The customer's id in that business (the customers table in Step 2). */
  cid: string
  /** The business it belongs to. */
  did: string
  iat: number
  exp: number
  /** Matches customers.session_version: bumping it signs the customer out everywhere. */
  v: number
}

export async function issueSession(input: { cid: string; did: string; v: number }, now = Date.now(), secret?: string): Promise<string> {
  const iat = Math.floor(now / 1000)
  const claims: CustomerSession = { ...input, iat, exp: iat + SESSION_SECONDS }
  return signToken("customer-session", claims, secret)
}

/** The session if it is genuine, unexpired and for this business; otherwise null. */
export async function readSession(token: string | null | undefined, dealerId: string, now = Date.now(), secret?: string): Promise<CustomerSession | null> {
  const s = await verifyToken<CustomerSession>("customer-session", token, now, secret)
  return s && typeof s.cid === "string" && s.did === dealerId && typeof s.v === "number" ? s : null
}

export const needsRenewal = (s: CustomerSession, now = Date.now()) => s.exp - Math.floor(now / 1000) < RENEW_BELOW_SECONDS

/** Cookie names. In production the `__Host-` prefix makes the browser refuse the cookie unless it is Secure, host-only and Path=/. */
export const sessionCookieName = (production = process.env.NODE_ENV === "production") => (production ? "__Host-tany_cs" : "tany_cs")
export const stateCookieName = (production = process.env.NODE_ENV === "production") => (production ? "__Host-tany_ls" : "tany_ls")

export function cookieOptions(maxAgeSeconds: number, production = process.env.NODE_ENV === "production") {
  return { httpOnly: true, secure: production, sameSite: "lax" as const, path: "/", maxAge: maxAgeSeconds }
}

export { randomToken }
