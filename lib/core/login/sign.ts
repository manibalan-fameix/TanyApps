// Small signed tokens for the customer login. Pure Web Crypto (HMAC-SHA256), so the same code runs in Node, the app Worker and tests.
// A token is `<base64url json>.<base64url signature>`. Each kind of token is signed with its own key, derived from AUTH_SECRET with a
// label, so a login ticket can never be accepted as a session cookie or the other way round.

const enc = new TextEncoder()
const dec = new TextDecoder()

const b64 = (bytes: ArrayBuffer | Uint8Array) => {
  let s = ""
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))

export type TokenKind = "login-ticket" | "customer-session" | "place"

/** The signing secret. Never a well-known value in production. */
export function authSecret(env: Record<string, string | undefined> = process.env): string {
  const s = env.AUTH_SECRET?.trim()
  if (s) return s
  if (env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set")
  return "development-only-auth-secret"
}

async function keyFor(kind: TokenKind, secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const derived = await crypto.subtle.sign("HMAC", base, enc.encode(`tany:${kind}:v1`))
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, [usage])
}

export async function signToken(kind: TokenKind, claims: Record<string, unknown>, secret: string = authSecret()): Promise<string> {
  const payload = b64(enc.encode(JSON.stringify(claims)))
  const sig = await crypto.subtle.sign("HMAC", await keyFor(kind, secret, "sign"), enc.encode(payload))
  return `${payload}.${b64(sig)}`
}

/** The claims of a genuine token of this kind, or null. Expiry (`exp`, seconds) is checked here; everything else by the caller. */
export async function verifyToken<T extends { exp: number }>(kind: TokenKind, token: string | null | undefined, now = Date.now(), secret: string = authSecret()): Promise<T | null> {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  try {
    const ok = await crypto.subtle.verify("HMAC", await keyFor(kind, secret, "verify"), unb64(parts[1]), enc.encode(parts[0]))
    if (!ok) return null
    const claims = JSON.parse(dec.decode(unb64(parts[0]))) as T
    return typeof claims.exp === "number" && claims.exp * 1000 > now ? claims : null
  } catch {
    return null
  }
}

/** 128 random bits, base64url. */
export const randomToken = (): string => b64(crypto.getRandomValues(new Uint8Array(16)))
