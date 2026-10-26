// Cloudflare Access sits in front of Jarvis (a dashboard policy). Access adds a signed JWT to every request it lets through. Checking it
// HERE means a request that reaches the Worker some other way (the raw workers.dev address, a mis-edited policy) is refused too, so the
// passphrase is never the only gate. Verification only: this file configures nothing in Cloudflare.
import { createRemoteJWKSet, jwtVerify } from "jose"

const remote = new Map()

/** Both settings present means Access is expected. One without the other is a mistake that must not quietly turn the check off. */
export function accessState(env) {
  const team = String(env.ACCESS_TEAM_DOMAIN ?? "").trim()
  const aud = String(env.ACCESS_AUD ?? "").trim()
  if (team && aud) return "on"
  if (team || aud) return "misconfigured"
  return "off"
}

/**
 * The verified identity (email, or subject) from the Access JWT on this request, or null. `keys` is injectable so the check is tested
 * with locally signed tokens; in the Worker it is Cloudflare's published key set for the team domain, cached by jose.
 */
export async function verifyAccess(request, env, keys) {
  const token = request.headers.get("cf-access-jwt-assertion")
  if (!token) return null
  const issuer = `https://${String(env.ACCESS_TEAM_DOMAIN).trim()}`
  let jwks = keys
  if (!jwks) {
    if (!remote.has(issuer)) remote.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)))
    jwks = remote.get(issuer)
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: String(env.ACCESS_AUD).trim(), algorithms: ["RS256"] })
    return typeof payload.email === "string" && payload.email ? payload.email : typeof payload.sub === "string" && payload.sub ? payload.sub : null
  } catch {
    return null
  }
}

/**
 * One shared, cross-isolate rate limit using the same Durable Object the app uses (binding RATE_LIMITER, class RateLimiter in the
 * tracker Worker), when it is bound. True means "over the limit". Unbound or unreachable means "no opinion" (false): the in-isolate
 * limits still apply.
 */
export async function overSharedLimit(env, key, limit, windowMs) {
  if (!env.RATE_LIMITER) return false
  try {
    const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(key))
    return !(await stub.hit(limit, windowMs))
  } catch {
    return false
  }
}
