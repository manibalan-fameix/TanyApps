import { eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"

import { tenantFrom } from "@/lib/core/guards"
import { cookieOptions, sessionCookieName } from "@/lib/core/login/customer-session"
import { customerFromToken } from "@/lib/core/login/customer"
import { sameOrigin } from "@/lib/core/login/origin"
import { customers } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"

/**
 * Sign out. `{ "everywhere": true }` also bumps the customer's session version, which ends every session on every device at once
 * (each one is checked against the version on use).
 */
export async function POST(req: Request) {
  const ctx = await tenantFrom(req.headers, "cabs")
  if (!ctx) return new NextResponse("Not found", { status: 404 })
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 })
  const body = (await req.json().catch(() => null)) as { everywhere?: boolean } | null
  if (body?.everywhere === true) {
    const name = sessionCookieName()
    const token = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1)
    const c = await customerFromToken(ctx.dealer.id, token)
    if (c) await scopedDb(ctx.dealer.id).customers.update({ sessionVersion: sql`${customers.sessionVersion} + 1` as unknown as number }, eq(customers.id, c.id))
  }
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
  res.cookies.set(sessionCookieName(), "", { ...cookieOptions(0), maxAge: 0 })
  return res
}
