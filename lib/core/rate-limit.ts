import { countMetric } from "./metrics"
import { slideWindow } from "./rate-window"

/**
 * The shared rate limiter. Each key is its own Durable Object (workers/tracker, class RateLimiter), so a limit holds across
 * every Worker isolate and region instead of resetting whenever an isolate is recycled.
 *
 * When the limiter cannot be reached, `failClosed` decides: sign-in and verification paths (a rider or driver PIN, an OTP,
 * a login, a teammate's password) say "no", everything else says "yes", and each failure is counted and logged.
 *
 * With no RATE_LIMITER binding (local development, unit tests) an in-memory window is used instead.
 */

export type RateLimitOptions = {
  /** Deny when the limiter is unreachable. Use for authentication paths. */
  failClosed?: boolean
  /** How long to wait for the limiter before treating it as unreachable. */
  timeoutMs?: number
}

export interface RateLimiterStub {
  hit(limit: number, windowMs: number): Promise<boolean>
}
export interface RateLimiterNamespace {
  idFromName(name: string): unknown
  get(id: unknown): RateLimiterStub
}

const DEFAULT_TIMEOUT_MS = 1500

async function limiterBinding(): Promise<RateLimiterNamespace | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    return (getCloudflareContext().env as { RATE_LIMITER?: RateLimiterNamespace }).RATE_LIMITER ?? null
  } catch {
    return null
  }
}

/** Keys can hold a phone number or an IP, and object names have a length limit, so the object is named by a hash. */
async function objectName(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Returns true if the action is allowed, and records it. */
export async function rateLimit(key: string, limit: number, windowMs: number, opts: RateLimitOptions = {}, ns?: RateLimiterNamespace | null): Promise<boolean> {
  const space = ns === undefined ? await limiterBinding() : ns
  if (!space) return memoryAllow(key, limit, windowMs)

  const mode = opts.failClosed ? "closed" : "open"
  try {
    const stub = space.get(space.idFromName(await objectName(key)))
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("rate limiter timed out")), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    })
    try {
      return await Promise.race([stub.hit(limit, windowMs), timeout])
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    countMetric("rate_limiter_unreachable", { mode, prefix: key.split(":")[0].slice(0, 30), error: error instanceof Error ? error.message.slice(0, 80) : "unknown" })
    return !opts.failClosed
  }
}

// ---------- development fallback: an in-memory window, per server instance ----------

const hits = new Map<string, number[]>()

/** The sliding window used with no binding. Exported for the tests that cover the window itself. */
export function memoryAllow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const { allowed, hits: next } = slideWindow(hits.get(key) ?? [], now, limit, windowMs)
  hits.set(key, next)
  if (hits.size > 10_000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k)
  return allowed
}

/** Test helper: forget every window. */
export function resetMemoryLimiter(): void {
  hits.clear()
}
