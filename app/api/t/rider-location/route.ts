import { NextResponse } from "next/server"
import { z } from "zod"

import { roadRoute } from "@/lib/restaurant/route"
import { saveFix } from "@/lib/restaurant/live-location"
import { TOKEN_RE, fixInputSchema, hashRiderToken, sharingAllowed, toFix } from "@/lib/restaurant/tracking"
import { orderByRiderToken } from "@/lib/restaurant/trip"
import { allow } from "@/lib/rate-limit"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { TENANT_HEADER } from "@/lib/tenant/host"

const body = z.object({ token: z.string().regex(TOKEN_RE) }).and(fixInputSchema)
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } })

// A rider's phone posts its position here every few seconds while the delivery link is open. The private link
// itself is the credential, and it only ever reaches the one order it was made for.
export async function POST(req: Request) {
  const slug = req.headers.get(TENANT_HEADER)
  const dealer = slug ? await getDealerBySlug(slug) : null
  if (!dealer || dealer.industry !== "restaurants" || dealer.suspended) return json({ ok: false }, 404)

  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json({ ok: false, error: "invalid" }, 400)
  // Per link, so one rider cannot flood the store: a phone sends about 15 a minute, this allows 40.
  if (!allow(`rider-loc:${(await hashRiderToken(parsed.data.token)).slice(0, 16)}`, 40, 60_000)) return json({ ok: false, error: "slow_down" }, 429)

  const order = await orderByRiderToken(dealer.id, parsed.data.token)
  if (!order) return json({ ok: false, error: "link_closed" }, 404)
  if (!sharingAllowed(order.status)) return json({ ok: false, error: "not_in_progress", status: order.status }, 409)
  const fix = toFix(parsed.data)
  if (!fix) return json({ ok: false, error: "bad_position" }, 422)

  await saveFix(dealer.id, order.id, fix)
  // Send the road route back so the rider's own map can draw it without a second call.
  const road = order.latitude !== null && order.longitude !== null ? await roadRoute(dealer.id, order.id, fix, { lat: order.latitude, lng: order.longitude }) : null
  return json({ ok: true, status: order.status, route: road?.points ?? null, km: road?.km ?? null, minutes: road?.minutes ?? null })
}
