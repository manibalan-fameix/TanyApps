"use server"

import { eq } from "drizzle-orm"
import { headers } from "next/headers"

import { orders } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { dropFix } from "@/lib/restaurant/live-location"
import { hashRiderToken } from "@/lib/restaurant/tracking"
import { orderByRiderToken } from "@/lib/restaurant/trip"
import { allow } from "@/lib/rate-limit"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { TENANT_HEADER } from "@/lib/tenant/host"

type Result = { ok: true; status: string } | { ok: false; error: string }

/**
 * The rider's two taps, through their private delivery link: "I have picked it up" and "Delivered". The link proves
 * which order this is, so there is no sign-in. A rider can only move their own order forward, one step at a time.
 */
export async function tripAct(token: string, kind: "pickup" | "delivered", collectedCash: boolean): Promise<Result> {
  const slug = (await headers()).get(TENANT_HEADER)
  const dealer = slug ? await getDealerBySlug(slug) : null
  if (!dealer || dealer.industry !== "restaurants" || dealer.suspended) return { ok: false, error: "This link is not available." }
  if (!allow(`trip-act:${(await hashRiderToken(token)).slice(0, 16)}`, 20, 10 * 60_000)) return { ok: false, error: "Too many taps. Wait a moment." }

  const order = await orderByRiderToken(dealer.id, token)
  if (!order) return { ok: false, error: "This delivery link is no longer active." }
  const db = scopedDb(dealer.id)

  if (kind === "pickup") {
    if (order.status === "out_for_delivery") return { ok: true, status: order.status }
    if (order.status === "new") return { ok: false, error: "The restaurant has not confirmed this order yet." }
    if (!["confirmed", "preparing", "ready"].includes(order.status)) return { ok: false, error: "This order cannot be picked up now." }
    await db.orders.update({ status: "out_for_delivery", pickedUpAt: new Date(), updatedAt: new Date() }, eq(orders.id, order.id))
    return { ok: true, status: "out_for_delivery" }
  }

  if (order.status === "completed") return { ok: true, status: "completed" }
  if (order.status !== "out_for_delivery") return { ok: false, error: "Mark the order as picked up first." }
  const takeCash = collectedCash && order.paymentMethod === "cod" && order.paymentStatus !== "paid"
  await db.orders.update(
    { status: "completed", deliveredAt: new Date(), updatedAt: new Date(), ...(takeCash ? { paymentStatus: "paid", paidAt: new Date() } : {}) },
    eq(orders.id, order.id),
  )
  // The trip is over: stop showing where the rider is.
  await dropFix(dealer.id, order.id)
  return { ok: true, status: "completed" }
}
