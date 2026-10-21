import { NextResponse } from "next/server"

import { tenantFrom } from "@/lib/core/guards"
import { cookieOptions, sessionCookieName } from "@/lib/core/login/customer-session"
import { sameOrigin } from "@/lib/core/login/origin"

export async function POST(req: Request) {
  const ctx = await tenantFrom(req.headers, "cabs")
  if (!ctx) return new NextResponse("Not found", { status: 404 })
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 })
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
  res.cookies.set(sessionCookieName(), "", { ...cookieOptions(0), maxAge: 0 })
  return res
}
