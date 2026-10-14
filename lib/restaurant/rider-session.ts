import { createHmac, timingSafeEqual } from "crypto"

export const RIDER_COOKIE = "tany-rider"
export const RIDER_SESSION_SECONDS = 12 * 60 * 60

export type RiderSession = { partnerId: string; dealerId: string; exp: number }

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.ENCRYPTION_KEY
  if (s) return s
  // Never sign a rider session with a well-known key in production.
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set")
  return "development-rider-session"
}

const mac = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url")

/** A signed, expiring token for a rider who has entered their PIN. It names the rider and the restaurant it is valid for. */
export function signRiderSession(s: Omit<RiderSession, "exp">, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...s, exp: Math.floor(now / 1000) + RIDER_SESSION_SECONDS })).toString("base64url")
  return `${body}.${mac(body)}`
}

/** Returns the session only for an untampered, unexpired token. Anything else is null. */
export function readRiderSession(token: string | undefined, now = Date.now()): RiderSession | null {
  if (!token) return null
  const dot = token.lastIndexOf(".")
  if (dot < 1) return null
  const body = token.slice(0, dot)
  const given = token.slice(dot + 1)
  const expected = mac(body)
  try {
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<RiderSession>
    if (typeof s.partnerId !== "string" || typeof s.dealerId !== "string" || typeof s.exp !== "number") return null
    return s.exp * 1000 > now ? (s as RiderSession) : null
  } catch {
    return null
  }
}

/** What a rider may do with an order they are carrying. */
export function riderNext(status: string): "out_for_delivery" | "completed" | null {
  if (["confirmed", "preparing", "ready"].includes(status)) return "out_for_delivery"
  if (status === "out_for_delivery") return "completed"
  return null
}
