import { clientIp, tenantFrom } from "@/lib/core/guards"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"

import { orders } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { TICKET_TTL_S, signTicket } from "@/lib/restaurant/ws-ticket"
import { TOKEN_RE, hashRiderToken, sharingAllowed } from "@/lib/restaurant/tracking"
import { orderByRiderToken } from "@/lib/restaurant/trip"
import { allow } from "@/lib/rate-limit"

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } })

const secret = () => process.env.TRACKER_SECRET?.trim() ?? ""
const socketUrl = () => process.env.TRACKER_WS_URL?.trim() ?? ""

// Hands a phone a short-lived ticket for the live-location WebSocket, after checking it may have one: a rider needs
// their private link's token, a guest needs their order code. Without TRACKER_WS_URL and TRACKER_SECRET (local
// development) it answers `live: false` and the pages keep using plain HTTP polling.
async function dealerFor(req: Request) {
  return (await tenantFrom(req.headers, "restaurants"))?.dealer ?? null
}

/** Rider: POST { token }. */
export async function POST(req: Request) {
  const dealer = await dealerFor(req)
  if (!dealer) return json({ ok: false }, 404)
  const parsed = z.object({ token: z.string().regex(TOKEN_RE) }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json({ ok: false }, 400)
  if (!secret() || !socketUrl()) return json({ ok: true, live: false })
  if (!allow(`ws-ticket:${(await hashRiderToken(parsed.data.token)).slice(0, 16)}`, 20, 60_000)) return json({ ok: false, error: "slow_down" }, 429)
  const order = await orderByRiderToken(dealer.id, parsed.data.token)
  if (!order) return json({ ok: false, error: "link_closed" }, 404)
  if (!sharingAllowed(order.status)) return json({ ok: false, error: "not_in_progress" }, 409)
  const ticket = await signTicket(secret(), { k: `${dealer.id}:${order.id}`, r: "rider", e: Math.floor(Date.now() / 1000) + TICKET_TTL_S })
  return json({ ok: true, live: true, url: socketUrl(), ticket })
}

/** Guest: GET ?code=ABC123. Only while the order is on its way. */
export async function GET(req: Request) {
  const dealer = await dealerFor(req)
  if (!dealer) return json({ ok: false }, 404)
  const code = new URL(req.url).searchParams.get("code")?.toUpperCase() ?? ""
  if (!/^[A-Z0-9]{6}$/.test(code)) return json({ ok: false }, 400)
  if (!secret() || !socketUrl()) return json({ ok: true, live: false })
  const ip = clientIp(req.headers)
  if (!allow(`ws-ticket:${ip}:${code}`, 20, 60_000)) return json({ ok: false, error: "slow_down" }, 429)
  const [order] = await scopedDb(dealer.id).orders.select(eq(orders.code, code), { limit: 1 })
  if (!order || order.fulfilment !== "delivery" || order.status !== "out_for_delivery") return json({ ok: true, live: false })
  const ticket = await signTicket(secret(), { k: `${dealer.id}:${order.id}`, r: "guest", e: Math.floor(Date.now() / 1000) + TICKET_TTL_S })
  return json({ ok: true, live: true, url: socketUrl(), ticket })
}
