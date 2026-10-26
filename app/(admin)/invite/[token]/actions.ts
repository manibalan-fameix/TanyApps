"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/auth/active-business"
import { clientIp } from "@/lib/core/guards"
import { rateLimit } from "@/lib/core/rate-limit"
import { acceptInvite } from "@/lib/tenant/invites"

type SessionWithClaims = { user?: { id?: string } | null; verifiedEmail?: string | null; verifiedPhone?: string | null } | null

/**
 * Accepts an invitation as the signed-in person. Who they are comes only from what Firebase verified at their sign-in (an email or an
 * OTP phone), never from the form. Every failure ends on the same page with the same message.
 */
export async function acceptInvitation(token: string): Promise<void> {
  const session = (await auth()) as SessionWithClaims
  const userId = session?.user?.id
  if (!userId) redirect(`/invite/${encodeURIComponent(token)}`)
  const ip = clientIp(await headers())
  const allowed = (await rateLimit(`invite-accept:user:${userId}`, 10, 10 * 60_000, { failClosed: true })) && (await rateLimit(`invite-accept:ip:${ip}`, 30, 10 * 60_000, { failClosed: true }))
  if (!allowed) redirect(`/invite/${encodeURIComponent(token)}?result=slow_down`)

  const result = await acceptInvite(String(token), userId, { email: session?.verifiedEmail ?? null, phone: session?.verifiedPhone ?? null })
  if (!result.ok) redirect(`/invite/${encodeURIComponent(token)}?result=invalid`)
  ;(await cookies()).set(ACTIVE_BUSINESS_COOKIE, result.dealerId, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" })
  redirect("/dashboard")
}
