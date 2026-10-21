import { NextResponse } from "next/server"

import { tenantFrom } from "@/lib/core/guards"
import { SESSION_SECONDS, cookieOptions, issueSession, sessionCookieName, stateCookieName } from "@/lib/core/login/customer-session"
import { checkTicket } from "@/lib/core/login/ticket"
import { rateLimit } from "@/lib/core/rate-limit"
import { getRootDomain, protocolFor } from "@/lib/env"

const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("")

// Redirects are built from the Host header: behind a proxy or dev server `req.url` can carry a different origin.
const siteOrigin = (req: Request) => `${protocolFor(getRootDomain() ?? "localhost")}://${(req.headers.get("host") ?? "").toLowerCase()}`

const fail = (req: Request, reason: string) => {
  const res = NextResponse.redirect(new URL(`/?login=${reason}`, siteOrigin(req)), 303)
  res.headers.set("Cache-Control", "no-store")
  return res
}

/** The ticket arrives here. Four checks, then the session cookie: signature and age, this host, this browser, first use. */
export async function GET(req: Request) {
  const ctx = await tenantFrom(req.headers, "cabs")
  if (!ctx) return new NextResponse("Not found", { status: 404 })
  const host = (req.headers.get("host") ?? "").toLowerCase()
  const cookies = req.headers.get("cookie") ?? ""
  const readCookie = (name: string) => cookies.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? null

  const checked = await checkTicket(new URL(req.url).searchParams.get("ticket"), { host, state: readCookie(stateCookieName()) })
  if (!checked.ok) return fail(req, checked.reason)
  const { ticket } = checked
  // Single use: a replayed link finds the key already taken. Fail closed if the limiter is unreachable.
  if (!(await rateLimit(`login-ticket:${ticket.jti}`, 1, 120_000, { failClosed: true }))) return fail(req, "used")

  // Spike: the customer record arrives in Step 2. Until then the id is a stable hash of (business, phone), and the phone is never stored here.
  const cid = (await sha(`${ctx.dealer.id}:${ticket.sub}`)).slice(0, 32)
  const session = await issueSession({ cid, did: ctx.dealer.id, v: 1 })
  const res = NextResponse.redirect(new URL(ticket.next, siteOrigin(req)), 303)
  res.cookies.set(sessionCookieName(), session, cookieOptions(SESSION_SECONDS))
  res.cookies.set(stateCookieName(), "", { ...cookieOptions(0), maxAge: 0 })
  res.headers.set("Cache-Control", "no-store")
  return res
}
