"use server"

import { tenantContext } from "@/lib/core/guards"
import { and, eq, inArray } from "drizzle-orm"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

import { verifyPassword } from "@/lib/auth/password"
import { deliveryPartners, orders } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { allow } from "@/lib/rate-limit"
import { RIDER_COOKIE, RIDER_SESSION_SECONDS, readRiderSession, riderNext, signRiderSession } from "@/lib/restaurant/rider-session"

type Result = { ok: true } | { ok: false; error: string }

const tenant = () => tenantContext("restaurants")

/** The signed-in rider for this restaurant, or null. A token for one restaurant never works on another. */
export async function currentRider() {
  const t = await tenant()
  if (!t) return null
  const session = readRiderSession((await cookies()).get(RIDER_COOKIE)?.value)
  if (!session || session.dealerId !== t.dealer.id) return null
  const [partner] = await scopedDb(t.dealer.id).deliveryPartners.select(eq(deliveryPartners.id, session.partnerId), { limit: 1 })
  return partner && partner.isActive ? { partner, dealer: t.dealer } : null
}

export async function riderSignIn(code: string, pin: string): Promise<Result> {
  const t = await tenant()
  const wrong = { ok: false as const, error: "Wrong ID or PIN." }
  if (!t) return wrong
  const clean = code.trim().toUpperCase()
  // Per rider id and per device, so a PIN cannot be guessed by trying them all.
  if (!allow(`rider:${t.dealer.id}:${clean}`, 8, 15 * 60_000) || !allow(`rider-ip:${t.ip}`, 30, 15 * 60_000)) return { ok: false, error: "Too many tries. Wait a few minutes and try again." }
  const [partner] = await scopedDb(t.dealer.id).deliveryPartners.select(eq(deliveryPartners.code, clean), { limit: 1 })
  // The same answer whether the id is unknown, the rider is paused, or the PIN is wrong.
  if (!partner || !partner.isActive || !partner.pinHash || !(await verifyPassword(pin, partner.pinHash))) return wrong
  ;(await cookies()).set(RIDER_COOKIE, signRiderSession({ partnerId: partner.id, dealerId: t.dealer.id }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/delivery",
    maxAge: RIDER_SESSION_SECONDS,
  })
  return { ok: true }
}

export async function riderSignOut(): Promise<void> {
  ;(await cookies()).delete({ name: RIDER_COOKIE, path: "/delivery" })
}

/** A rider moves their own order forward: picked up, then delivered. They can never touch someone else's order. */
export async function riderUpdate(orderId: string, collectedCash: boolean): Promise<Result> {
  const r = await currentRider()
  if (!r) return { ok: false, error: "Please sign in again." }
  const db = scopedDb(r.dealer.id)
  const [order] = await db.orders.select(and(eq(orders.id, orderId), eq(orders.partnerId, r.partner.id)), { limit: 1 })
  if (!order) return { ok: false, error: "That order is not assigned to you." }
  const next = riderNext(order.status)
  if (!next) return { ok: false, error: "Nothing to update on this order." }
  await db.orders.update(
    { status: next, updatedAt: new Date(), ...(next === "completed" && collectedCash && order.paymentStatus !== "paid" ? { paymentStatus: "paid", paidAt: new Date() } : {}) },
    eq(orders.id, orderId),
  )
  revalidatePath("/delivery", "layout")
  return { ok: true }
}

export async function riderOrders() {
  const r = await currentRider()
  if (!r) return null
  const rows = await scopedDb(r.dealer.id).orders.select(and(eq(orders.partnerId, r.partner.id), inArray(orders.status, ["confirmed", "preparing", "ready", "out_for_delivery"])))
  return rows.map((o) => ({ id: o.id, code: o.code, customerName: o.customerName, phone: o.customerPhone, address: o.address ?? "", pincode: o.pincode ?? "", lat: o.latitude, lng: o.longitude, note: o.note, total: o.total, paid: o.paymentStatus === "paid", status: o.status, items: o.lines.map((l) => `${l.qty}× ${l.name}${l.portion ? ` (${l.portion})` : ""}`).join(", ") }))
}
