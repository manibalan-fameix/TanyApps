import { randomToken, signToken, verifyToken } from "./sign"

/**
 * The hand-off from the central login (app host) to a business's own site. It is a signed, single-use note saying "this browser just
 * proved it controls this phone number", addressed to ONE host and good for one minute.
 */
export const TICKET_TTL_SECONDS = 60

export type LoginTicket = {
  /** The verified phone number, E.164. */
  sub: string
  /** The one host this ticket may be redeemed on. A ticket for one business is useless on another. */
  aud: string
  /** The value the tenant put in its own cookie before sending the browser away (login CSRF). */
  st: string
  /** Where to send the browser afterwards: a path on the same host. */
  next: string
  /** Single-use id. */
  jti: string
  iat: number
  exp: number
}

/** Only a path on the same site: no scheme, no host, no protocol-relative `//`, no backslash tricks. */
export function safeNext(value: string | null | undefined): string {
  const v = (value ?? "").trim()
  if (v.length === 0 || v.length > 300) return "/"
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /[\u0000-\u001f]/.test(v)) return "/"
  return v
}

export async function issueTicket(input: { phone: string; host: string; state: string; next: string }, now = Date.now(), secret?: string): Promise<string> {
  const iat = Math.floor(now / 1000)
  const claims: LoginTicket = { sub: input.phone, aud: input.host.toLowerCase(), st: input.state, next: safeNext(input.next), jti: randomToken(), iat, exp: iat + TICKET_TTL_SECONDS }
  return signToken("login-ticket", claims, secret)
}

export type TicketCheck = { ok: true; ticket: LoginTicket } | { ok: false; reason: "invalid" | "wrong_host" | "wrong_state" }

/** Signature, expiry, the host it is for and the state it carries. Single use is the caller's job (it needs shared state). */
export async function checkTicket(token: string | null | undefined, ctx: { host: string; state: string | null | undefined }, now = Date.now(), secret?: string): Promise<TicketCheck> {
  const t = await verifyToken<LoginTicket>("login-ticket", token, now, secret)
  if (!t || typeof t.sub !== "string" || typeof t.aud !== "string" || typeof t.st !== "string" || typeof t.jti !== "string") return { ok: false, reason: "invalid" }
  if (t.aud !== ctx.host.toLowerCase()) return { ok: false, reason: "wrong_host" }
  // The state in the ticket must be the one this very browser was given, which stops someone logging a victim into the attacker's account.
  if (!ctx.state || t.st !== ctx.state) return { ok: false, reason: "wrong_state" }
  return { ok: true, ticket: { ...t, next: safeNext(t.next) } }
}
