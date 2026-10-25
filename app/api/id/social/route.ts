import { NextResponse } from "next/server"
import { z } from "zod"

import { verifyFirebaseIdToken } from "@/lib/auth/firebase"
import { isSocialProvider, issueLink, phoneForIdentity } from "@/lib/cabs/identity"
import { clientIp } from "@/lib/core/guards"
import { resolveLoginHost } from "@/lib/core/login/host"
import { sameOrigin } from "@/lib/core/login/origin"
import { issueTicket, safeNext } from "@/lib/core/login/ticket"
import { rateLimit } from "@/lib/core/rate-limit"
import { scopedDb } from "@/lib/db/scoped"
import { getRootDomain, protocolFor } from "@/lib/env"

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } })

const body = z.object({ idToken: z.string().min(20).max(4096), host: z.string().min(3).max(253), state: z.string().min(16).max(64), next: z.string().max(300).optional() })

/**
 * Central login for Google, Facebook and email + password. The browser sends the Firebase proof; we check it, and then either
 *  - this sign-in is already tied to a verified phone at THIS business: answer with the one-minute ticket, exactly as the phone
 *    login does, or
 *  - it is new here: answer `needs_phone` with a short-lived signed link, and the page asks for a mobile number and a code. The
 *    ticket route ties the two together once the phone is proved.
 * Nothing here creates a customer: a customer exists only once a phone has been verified.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, error: "origin" }, 403)
  const ip = clientIp(req.headers)
  if (!(await rateLimit(`id-social:ip:${ip}`, 30, 10 * 60_000, { failClosed: true }))) return json({ ok: false, error: "slow_down" }, 429)
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, error: "bad_request" }, 400)

  const target = await resolveLoginHost(parsed.data.host, "cabs")
  if (!target) return json({ ok: false, error: "unknown_site" }, 404)
  const who = await verifyFirebaseIdToken(parsed.data.idToken)
  // An email sign-in only counts once the address is confirmed; Google and Facebook vouch for themselves.
  if (!who || !isSocialProvider(who.provider) || (who.provider === "password" && !who.emailVerified)) return json({ ok: false, error: "invalid_proof" }, 401)

  const next = safeNext(parsed.data.next)
  const phone = await phoneForIdentity(scopedDb(target.dealerId), who.uid)
  if (phone) {
    const ticket = await issueTicket({ phone, host: target.host, state: parsed.data.state, next })
    const scheme = protocolFor(getRootDomain() ?? "localhost")
    return json({ ok: true, url: `${scheme}://${target.host}/api/t/auth/callback?ticket=${encodeURIComponent(ticket)}` })
  }
  const link = await issueLink({ uid: who.uid, provider: who.provider, did: target.dealerId, aud: target.host, st: parsed.data.state })
  return json({ ok: true, needsPhone: true, link })
}
