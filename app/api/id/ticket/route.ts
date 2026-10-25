import { NextResponse } from "next/server"
import { z } from "zod"

import { linkIdentity, openLink } from "@/lib/cabs/identity"
import { upsertCustomer } from "@/lib/cabs/trips"
import { clientIp } from "@/lib/core/guards"
import { resolveLoginHost } from "@/lib/core/login/host"
import { sameOrigin } from "@/lib/core/login/origin"
import { issueTicket, safeNext } from "@/lib/core/login/ticket"
import { otpServer } from "@/lib/core/login/otp-provider"
import { rateLimit } from "@/lib/core/rate-limit"
import { scopedDb } from "@/lib/db/scoped"
import { getRootDomain, protocolFor } from "@/lib/env"

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } })

const body = z.object({ provider: z.enum(["firebase", "msg91"]).default("firebase"), idToken: z.string().min(20).max(4096), host: z.string().min(3).max(253), state: z.string().min(16).max(64), next: z.string().max(300).optional(), link: z.string().max(2000).optional() })

/**
 * Central login, last step: the browser proved a phone number to Firebase and sends the proof here, from the app host.
 * We check the proof, and hand back a one-minute ticket addressed to ONE business's site.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, error: "origin" }, 403)
  const ip = clientIp(req.headers)
  // Fail closed: if the limiter is down, nobody signs in rather than everybody signing in unthrottled.
  if (!(await rateLimit(`id-ticket:ip:${ip}`, 30, 10 * 60_000, { failClosed: true }))) return json({ ok: false, error: "slow_down" }, 429)
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, error: "bad_request" }, 400)

  const target = await resolveLoginHost(parsed.data.host, "cabs")
  if (!target) return json({ ok: false, error: "unknown_site" }, 404)
  // +91 only: the verifier returns null for any other country, so a proof for a foreign number is no proof.
  const phone = await otpServer(parsed.data.provider).verify(parsed.data.idToken)
  if (!phone) return json({ ok: false, error: "invalid_proof" }, 401)
  if (!(await rateLimit(`id-ticket:phone:${phone}`, 10, 10 * 60_000, { failClosed: true }))) return json({ ok: false, error: "slow_down" }, 429)

  // A Google, Facebook or email sign-in that has just proved its phone: remember the pair at THIS business, so next time the phone step is skipped.
  if (parsed.data.link) {
    const link = await openLink(parsed.data.link)
    if (!link || link.did !== target.dealerId || link.aud !== target.host || link.st !== parsed.data.state) return json({ ok: false, error: "invalid_link" }, 401)
    const db = scopedDb(target.dealerId)
    const customer = await upsertCustomer(db, phone, { verified: true, now: new Date() })
    await linkIdentity(db, customer.id, link.provider, link.uid)
  }

  const next = safeNext(parsed.data.next)
  const ticket = await issueTicket({ phone, host: target.host, state: parsed.data.state, next })
  const scheme = protocolFor(getRootDomain() ?? "localhost")
  return json({ ok: true, url: `${scheme}://${target.host}/api/t/auth/callback?ticket=${encodeURIComponent(ticket)}` })
}
