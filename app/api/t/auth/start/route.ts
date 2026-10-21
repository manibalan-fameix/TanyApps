import { NextResponse } from "next/server"

import { tenantFrom } from "@/lib/core/guards"
import { cookieOptions, stateCookieName } from "@/lib/core/login/customer-session"
import { randomToken } from "@/lib/core/login/sign"
import { safeNext } from "@/lib/core/login/ticket"
import { adminUrl } from "@/lib/env"

/**
 * A business's site sends a signed-out customer here. We remember a random value in a cookie that only THIS site can read, and
 * send the browser to the central login carrying the same value. It must come back inside the signed ticket, which proves the
 * person who finishes the login is the browser that started it.
 */
export async function GET(req: Request) {
  const ctx = await tenantFrom(req.headers, "cabs")
  if (!ctx) return new NextResponse("Not found", { status: 404 })
  const url = new URL(req.url)
  const host = (req.headers.get("host") ?? "").toLowerCase()
  const state = randomToken()
  const target = new URL(adminUrl("/id"))
  target.searchParams.set("host", host)
  target.searchParams.set("state", state)
  target.searchParams.set("next", safeNext(url.searchParams.get("next")))
  const lang = url.searchParams.get("lang")
  if (lang === "ta" || lang === "en") target.searchParams.set("lang", lang)
  const res = NextResponse.redirect(target, 303)
  res.cookies.set(stateCookieName(), state, cookieOptions(600))
  res.headers.set("Cache-Control", "no-store")
  return res
}
