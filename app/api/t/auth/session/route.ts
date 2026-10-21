import { NextResponse } from "next/server"

import { tenantFrom } from "@/lib/core/guards"
import { SESSION_SECONDS, cookieOptions, issueSession, needsRenewal, readSession, sessionCookieName } from "@/lib/core/login/customer-session"
import { customerFromToken } from "@/lib/core/login/customer"
import { sameOrigin } from "@/lib/core/login/origin"

const headers = { "Cache-Control": "no-store" }
const tokenOf = (req: Request) => {
  const name = sessionCookieName()
  return (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1)
}

/** Is this browser signed in to this business? */
export async function GET(req: Request) {
  const ctx = await tenantFrom(req.headers, "cabs")
  if (!ctx) return new NextResponse("Not found", { status: 404 })
  const c = await customerFromToken(ctx.dealer.id, tokenOf(req))
  return NextResponse.json(c ? { signedIn: true, customerId: c.id } : { signedIn: false }, { headers })
}

/**
 * Keeps an active customer signed in: a session at least a day old is replaced with a fresh 30 days. At most one new cookie a
 * day, because a newer session is not yet a day old. A revoked or expired session is not renewed.
 */
export async function POST(req: Request) {
  const ctx = await tenantFrom(req.headers, "cabs")
  if (!ctx) return new NextResponse("Not found", { status: 404 })
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403, headers })
  const token = tokenOf(req)
  const s = await readSession(token, ctx.dealer.id)
  const c = s ? await customerFromToken(ctx.dealer.id, token) : null
  if (!s || !c) return NextResponse.json({ renewed: false, signedIn: false }, { headers })
  if (!needsRenewal(s)) return NextResponse.json({ renewed: false, signedIn: true }, { headers })
  const res = NextResponse.json({ renewed: true, signedIn: true }, { headers })
  res.cookies.set(sessionCookieName(), await issueSession({ cid: c.id, did: ctx.dealer.id, v: c.sessionVersion }), cookieOptions(SESSION_SECONDS))
  return res
}
