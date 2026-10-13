import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { orders, deliveryPartners } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { readFix } from "@/lib/restaurant/live-location"
import { roadRoute } from "@/lib/restaurant/route"
import { readServiceArea, distanceKm } from "@/lib/restaurant/service-area"
import { etaMinutes, isFresh } from "@/lib/restaurant/tracking"
import { allow } from "@/lib/rate-limit"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { TENANT_HEADER } from "@/lib/tenant/host"

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } })

// What a guest's order page polls: where the rider is, how far, and roughly when. The 6-character order code is
// the guest's key, the same one that opens their order page. Only that one order is ever answered.
export async function GET(req: Request) {
  const slug = req.headers.get(TENANT_HEADER)
  const dealer = slug ? await getDealerBySlug(slug) : null
  if (!dealer || dealer.industry !== "restaurants" || dealer.suspended) return json({ ok: false }, 404)

  const code = new URL(req.url).searchParams.get("code")?.toUpperCase() ?? ""
  if (!/^[A-Z0-9]{6}$/.test(code)) return json({ ok: false }, 400)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown"
  // A page polls about 15 times a minute; this leaves room for a few open tabs but stops guessing at codes.
  if (!allow(`order-loc:${ip}:${code}`, 60, 60_000)) return json({ ok: false, error: "slow_down" }, 429)

  const db = scopedDb(dealer.id)
  const [order] = await db.orders.select(eq(orders.code, code), { limit: 1 })
  if (!order || order.fulfilment !== "delivery") return json({ ok: false }, 404)

  const rider = order.partnerId ? (await db.deliveryPartners.select(eq(deliveryPartners.id, order.partnerId), { limit: 1 }))[0] : null
  // The rider's position is shown only while the order is on its way, and never after it is delivered or cancelled.
  const onTheWay = order.status === "out_for_delivery"
  const fix = onTheWay ? await readFix(dealer.id, order.id) : null
  const destination = order.latitude !== null && order.longitude !== null ? { lat: order.latitude, lng: order.longitude } : null
  const km = fix && destination ? distanceKm(fix, destination) : null
  const area = readServiceArea(dealer.serviceArea)
  const restaurant = area ? { lat: area.lat, lng: area.lng } : null
  // Until the rider shares a position, show the planned road from the restaurant to the guest instead of an empty map.
  const origin = fix ?? (onTheWay ? restaurant : null)
  const road = origin && destination ? await roadRoute(`g:${order.id}`, origin, destination) : null
  return json({
    ok: true,
    status: order.status,
    rider: rider ? { name: rider.name, phone: rider.phone } : null,
    location: fix ? { lat: fix.lat, lng: fix.lng, heading: fix.heading, at: fix.at, fresh: isFresh(fix) } : null,
    destination,
    restaurant: onTheWay ? restaurant : null,
    planned: onTheWay && !fix,
    route: road?.points ?? null,
    distanceKm: road ? road.km : km === null ? null : Math.round(km * 10) / 10,
    etaMinutes: road ? road.minutes : km === null ? null : etaMinutes(km),
    serverTime: Date.now(),
  })
}
