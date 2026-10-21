import { NextResponse } from "next/server"

import { tenantFrom } from "@/lib/core/guards"
import { readSession, sessionCookieName } from "@/lib/core/login/customer-session"

export async function GET(req: Request) {
  const ctx = await tenantFrom(req.headers, "cabs")
  if (!ctx) return new NextResponse("Not found", { status: 404 })
  const name = sessionCookieName()
  const raw = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1)
  const s = await readSession(raw, ctx.dealer.id)
  return NextResponse.json(s ? { signedIn: true, customerId: s.cid } : { signedIn: false }, { headers: { "Cache-Control": "no-store" } })
}
