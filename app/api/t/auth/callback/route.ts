import { NextResponse } from "next/server"

import { tenantFrom } from "@/lib/core/guards"
import { SESSION_SECONDS, cookieOptions, issueSession, sessionCookieName, stateCookieName } from "@/lib/core/login/customer-session"
import { checkTicket } from "@/lib/core/login/ticket"
import { rateLimit } from "@/lib/core/rate-limit"
import { scopedDb } from "@/lib/db/scoped"
import { upsertCustomer } from "@/lib/cabs/trips"
import { isLang } from "@/lib/cabs/lang"
import { getRootDomain, protocolFor } from "@/lib/env"

// Redirects are built from the Host header: behind a proxy or dev server `req.url` can carry a different origin.
const siteOrigin = (req: Request) => `${protocolFor(getRootDomain() ?? "localhost")}://${(req.headers.get("host") ?? "").toLowerCase()}`

const fail = (req: Request, reason: string) => {
  const res = NextResponse.redirect(new URL(`/?login=${reason}`, siteOrigin(req)), 303)
  res.headers.set("Cache-Control", "no-store")
  return res
}

const readCookie = (req: Request, name: string) =>
  (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? null

/** The ticket arrives here. Four checks, then the session cookie: signature and age, this host, this browser, first use. */
export async function GET(req: Request) {
  const ctx = await tenantFrom(req.headers, "cabs")
  if (!ctx) return new NextResponse("Not found", { status: 404 })
  const host = (req.headers.get("host") ?? "").toLowerCase()

  const checked = await checkTicket(new URL(req.url).searchParams.get("ticket"), { host, state: readCookie(req, stateCookieName()) })
  if (!checked.ok) return fail(req, checked.reason)
  const { ticket } = checked
  // Single use: a replayed link finds the key already taken. Fail closed if the limiter is unreachable.
  if (!(await rateLimit(`login-ticket:${ticket.jti}`, 1, 120_000, { failClosed: true }))) return fail(req, "used")

  const lang = readCookie(req, "tany_lang")
  const customer = await upsertCustomer(scopedDb(ctx.dealer.id), ticket.sub, { verified: true, language: isLang(lang) ? lang : "en", now: new Date() })
  const session = await issueSession({ cid: customer.id, did: ctx.dealer.id, v: customer.sessionVersion })
  const res = NextResponse.redirect(new URL(ticket.next, siteOrigin(req)), 303)
  res.cookies.set(sessionCookieName(), session, cookieOptions(SESSION_SECONDS))
  res.cookies.set(stateCookieName(), "", { ...cookieOptions(0), maxAge: 0 })
  res.headers.set("Cache-Control", "no-store")
  return res
}
