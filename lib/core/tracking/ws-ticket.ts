// Short-lived tickets that let a phone open the live-location WebSocket. The app (which can check the database) signs
// one after confirming the rider link or the guest's order code; the tracker Worker (which has no database) only
// checks the signature. Pure Web Crypto with no imports, so the same file runs in Node, the app Worker and the tracker.

export type TicketRole = "rider" | "guest"
export type TicketClaims = {
  /** The channel: `<dealerId>:<orderId>`, the same name as the order's Durable Object. */
  k: string
  r: TicketRole
  /** Expiry, in seconds since 1970. */
  e: number
}

export const TICKET_TTL_S = 600

const enc = new TextEncoder()
const b64 = (bytes: ArrayBuffer | Uint8Array) => {
  let s = ""
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))

const hmacKey = (secret: string, usage: "sign" | "verify") => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage])

export async function signTicket(secret: string, claims: TicketClaims): Promise<string> {
  const payload = b64(enc.encode(JSON.stringify(claims)))
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(payload))
  return `${payload}.${b64(sig)}`
}

/** The claims when the signature is genuine and the ticket has not expired; otherwise null. */
export async function verifyTicket(secret: string, ticket: string | null | undefined, nowMs = Date.now()): Promise<TicketClaims | null> {
  if (!secret || !ticket) return null
  const [payload, sig, extra] = ticket.split(".")
  if (!payload || !sig || extra !== undefined) return null
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), unb64(sig), enc.encode(payload))
    if (!ok) return null
    const claims = JSON.parse(new TextDecoder().decode(unb64(payload))) as TicketClaims
    if (typeof claims.k !== "string" || (claims.r !== "rider" && claims.r !== "guest") || typeof claims.e !== "number") return null
    return claims.e * 1000 > nowMs ? claims : null
  } catch {
    return null
  }
}
