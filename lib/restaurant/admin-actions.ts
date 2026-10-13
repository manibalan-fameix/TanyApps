"use server"

import { and, asc, desc, eq, gt, inArray, ne } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getDealerContext } from "@/lib/auth/context"
import { banners, coupons, deliveryPartners, deliveryZones, enquiries, menuItems, orders, reviews } from "@/lib/db/schema"
import { hashPassword } from "@/lib/auth/password"
import { nextPartnerCode, parsePincodes, partnerSchema, pinSchema, zoneSchema } from "@/lib/restaurant/delivery"
import { adjustQuantity } from "@/lib/restaurant/stock"
import { refundOrder } from "@/lib/restaurant/payments"
import { releaseOrderStock } from "@/lib/restaurant/stock-server"
import { scopedDb } from "@/lib/db/scoped"
import { ORDER_STATUSES, type OrderStatus, nextStatuses } from "@/lib/restaurant/orders"
import { type Fulfilment, orderSettingsSchema } from "@/lib/restaurant/settings"
import { profileSchema } from "@/lib/restaurant/profile"
import { type Place, reverseGeocode, searchPlaces } from "@/lib/restaurant/geocode"
import { validCoords } from "@/lib/restaurant/location"
import { allow } from "@/lib/rate-limit"
import { dropFix, readFixes, storeKind } from "@/lib/restaurant/live-location"
import { customerMessage, etaMinutes, isFresh, riderMessage, shareOnWhatsApp } from "@/lib/restaurant/tracking"
import { forgetRiderLink, issueRiderToken } from "@/lib/restaurant/trip"
import { roadRoute } from "@/lib/restaurant/route"
import { distanceKm, readServiceArea, serviceAreaSchema } from "@/lib/restaurant/service-area"
import { shareUrl } from "@/lib/env"
import { dealers } from "@/lib/db/schema"
import { isOwnImage } from "@/lib/restaurant/images"
import { getStorage } from "@/lib/storage"
import { unscopedDb } from "@/lib/db/client"

type Result = { ok: true } | { ok: false; error: string }
const uuid = z.string().uuid()
const denied: Result = { ok: false, error: "Please sign in again." }
const ownerOnly: Result = { ok: false, error: "Only the owner can change this." }

/** The signed-in restaurant. The dealer id comes from the session, never from the request. */
async function session() {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || !ctx.dealerInDb || ctx.dealer.industry !== "restaurants") return null
  return { dealer: ctx.dealer, owner: ctx.role === "owner" }
}

function refresh(...paths: string[]) {
  for (const p of paths) revalidatePath(p)
  revalidatePath("/dashboard")
}

// ---------- orders ----------

export async function setOrderStatus(id: string, status: string): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!uuid.safeParse(id).success || !(ORDER_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Order not found." }
  const db = scopedDb(s.dealer.id)
  const [order] = await db.orders.select(eq(orders.id, id), { limit: 1 })
  if (!order) return { ok: false, error: "Order not found." }
  if (!nextStatuses(order.status as OrderStatus, order.fulfilment as Fulfilment).includes(status as OrderStatus))
    return { ok: false, error: "That change is not allowed for this order." }
  if (status === "out_for_delivery" && order.fulfilment === "delivery" && !order.partnerId)
    return { ok: false, error: "Assign a delivery partner before sending this order out." }
  // Cancelling an order the guest already paid for online sends the money back first. If that fails, nothing changes.
  if (status === "cancelled" && order.paymentMethod === "online" && order.paymentStatus === "paid") {
    const refunded = await refundOrder(s.dealer.id, order)
    if (!refunded.ok) return refunded
  }
  await db.orders.update(
    {
      status,
      updatedAt: new Date(),
      ...(status === "out_for_delivery" && !order.pickedUpAt ? { pickedUpAt: new Date() } : {}),
      ...(status === "completed" ? { deliveredAt: new Date() } : {}),
    },
    eq(orders.id, id),
  )
  // A finished or cancelled trip no longer shows where the rider is.
  if (status === "completed" || status === "cancelled") await dropFix(s.dealer.id, id)
  // A cancelled order gives its stock back, once.
  if (status === "cancelled" && !order.stockReleased) {
    await releaseOrderStock(s.dealer.id, order.code, "cancelled")
    await db.orders.update({ stockReleased: true }, eq(orders.id, id))
  }
  refresh("/orders", `/orders/${id}`, "/inventory", "/live-deliveries")
  return { ok: true }
}

/** Gives a delivery order to a rider (or takes it back with null). The rider must belong to this restaurant. */
export async function assignPartner(orderId: string, partnerId: string | null): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!uuid.safeParse(orderId).success || (partnerId !== null && !uuid.safeParse(partnerId).success)) return { ok: false, error: "Order not found." }
  const db = scopedDb(s.dealer.id)
  const [order] = await db.orders.select(eq(orders.id, orderId), { limit: 1 })
  if (!order) return { ok: false, error: "Order not found." }
  if (order.fulfilment !== "delivery") return { ok: false, error: "Only delivery orders need a rider." }
  if (["completed", "cancelled"].includes(order.status)) return { ok: false, error: "This order is already closed." }
  if (partnerId) {
    const [p] = await db.deliveryPartners.select(eq(deliveryPartners.id, partnerId), { limit: 1 })
    if (!p || !p.isActive) return { ok: false, error: "Choose an active delivery partner." }
  }
  // A different rider (or none) means the previous rider's link must stop working.
  if (order.partnerId !== partnerId) {
    await forgetRiderLink(s.dealer.id, orderId)
    await dropFix(s.dealer.id, orderId)
  }
  await db.orders.update({ partnerId, updatedAt: new Date() }, eq(orders.id, orderId))
  if (partnerId) {
    const [fresh] = await db.orders.select(eq(orders.id, orderId), { limit: 1 })
    await issueRiderToken(s.dealer.id, fresh)
  }
  refresh("/orders", `/orders/${orderId}`, "/delivery-partners", "/live-deliveries")
  return { ok: true }
}

export type ShareLinks = {
  riderName: string
  riderPhone: string
  riderUrl: string
  trackUrl: string
  customerPhone: string
  /** WhatsApp opens with the message ready to send. */
  riderWhatsApp: string
  customerWhatsApp: string
}

/** The two messages for an assigned delivery: the rider's private link, and the customer's live tracking link. */
export async function getShareLinks(orderId: string): Promise<{ ok: true; links: ShareLinks } | { ok: false; error: string }> {
  const s = await session()
  if (!s) return { ok: false, error: "Please sign in again." }
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "Order not found." }
  const db = scopedDb(s.dealer.id)
  const [order] = await db.orders.select(eq(orders.id, orderId), { limit: 1 })
  if (!order) return { ok: false, error: "Order not found." }
  if (!order.partnerId) return { ok: false, error: "Assign a delivery partner first." }
  const [rider] = await db.deliveryPartners.select(eq(deliveryPartners.id, order.partnerId), { limit: 1 })
  if (!rider) return { ok: false, error: "That delivery partner no longer exists." }
  const token = await issueRiderToken(s.dealer.id, order)
  const riderUrl = shareUrl(s.dealer.slug, `/delivery/t/${token}`)
  const trackUrl = shareUrl(s.dealer.slug, `/o/${order.code}`)
  const area = readServiceArea(s.dealer.serviceArea)
  const km = area && order.latitude !== null && order.longitude !== null ? distanceKm(area, { lat: order.latitude, lng: order.longitude }) : null
  return {
    ok: true,
    links: {
      riderName: rider.name,
      riderPhone: rider.phone,
      riderUrl,
      trackUrl,
      customerPhone: order.customerPhone,
      riderWhatsApp: shareOnWhatsApp(rider.phone, riderMessage({ restaurant: s.dealer.displayName, riderName: rider.name.split(" ")[0], code: order.code, address: [order.address, order.pincode].filter(Boolean).join(" "), link: riderUrl })),
      customerWhatsApp: shareOnWhatsApp(order.customerPhone, customerMessage({ restaurant: s.dealer.displayName, customerName: order.customerName.split(" ")[0], code: order.code, riderName: rider.name, riderPhone: rider.phone, trackUrl, etaKm: km })),
    },
  }
}

export type LiveDelivery = {
  id: string
  code: string
  customer: string
  address: string
  status: string
  rider: { name: string; phone: string } | null
  destination: { lat: number; lng: number } | null
  fix: { lat: number; lng: number; heading: number | null; at: number; fresh: boolean } | null
  route: [number, number][] | null
  distanceKm: number | null
  etaMinutes: number | null
  placedAt: string
}

/** Everything the Live Deliveries map shows: each active delivery with its rider and latest position. */
export async function fetchLiveDeliveries(): Promise<
  | { ok: true; restaurant: { name: string; lat: number; lng: number } | null; store: "cloudflare" | "database"; deliveries: LiveDelivery[]; serverTime: number }
  | { ok: false }
> {
  const s = await session()
  if (!s) return { ok: false }
  const db = scopedDb(s.dealer.id)
  const active = await db.orders.select(inArray(orders.status, ["confirmed", "preparing", "ready", "out_for_delivery"]), { orderBy: [asc(orders.createdAt)] })
  const delivery = active.filter((o) => o.fulfilment === "delivery")
  const [partners, fixes, kind] = await Promise.all([db.deliveryPartners.select(), readFixes(s.dealer.id, delivery.map((o) => o.id)), storeKind()])
  const rider = new Map(partners.map((p) => [p.id, p]))
  const area = readServiceArea(s.dealer.serviceArea)
  return {
    ok: true,
    restaurant: area ? { name: s.dealer.displayName, lat: area.lat, lng: area.lng } : null,
    store: kind,
    serverTime: Date.now(),
    deliveries: await Promise.all(delivery.map(async (o) => {
      const fix = fixes.get(o.id) ?? null
      const destination = o.latitude !== null && o.longitude !== null ? { lat: o.latitude, lng: o.longitude } : null
      const km = fix && destination ? distanceKm(fix, destination) : null
      const p = o.partnerId ? rider.get(o.partnerId) : null
      const road = fix && destination && o.status === "out_for_delivery" ? await roadRoute(`g:${o.id}`, fix, destination) : null
      return {
        id: o.id,
        code: o.code,
        customer: o.customerName,
        address: [o.address, o.pincode].filter(Boolean).join(" · "),
        status: o.status,
        rider: p ? { name: p.name, phone: p.phone } : null,
        destination,
        fix: fix ? { lat: fix.lat, lng: fix.lng, heading: fix.heading, at: fix.at, fresh: isFresh(fix) } : null,
        route: road?.points ?? null,
        distanceKm: road ? road.km : km === null ? null : Math.round(km * 10) / 10,
        etaMinutes: road ? road.minutes : km === null ? null : etaMinutes(km),
        placedAt: o.createdAt.toISOString(),
      }
    })),
  }
}

/** Cash taken at the door or counter. Online payments will set this automatically once they exist. */
export async function setPaymentStatus(orderId: string, status: "paid" | "pending"): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!uuid.safeParse(orderId).success || !["paid", "pending"].includes(status)) return { ok: false, error: "Order not found." }
  const db = scopedDb(s.dealer.id)
  const [order] = await db.orders.select(eq(orders.id, orderId), { limit: 1 })
  if (!order) return { ok: false, error: "Order not found." }
  if (order.status === "cancelled") return { ok: false, error: "This order was cancelled." }
  if (order.paymentMethod === "online") return { ok: false, error: "Online payments are marked paid automatically." }
  await db.orders.update({ paymentStatus: status, paidAt: status === "paid" ? new Date() : null }, eq(orders.id, orderId))
  refresh("/payments", `/orders/${orderId}`)
  return { ok: true }
}

// ---------- inventory ----------

/** Restock (+) or deduct (-) a tracked dish. Every change is written to the audit trail with its reason. */
export async function adjustStock(itemId: string, delta: number, reason: string): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!uuid.safeParse(itemId).success) return { ok: false, error: "Dish not found." }
  const why = reason.trim().slice(0, 80) || (delta > 0 ? "Restock" : "Deduction")
  const db = scopedDb(s.dealer.id)
  const [item] = await db.menuItems.select(eq(menuItems.id, itemId), { limit: 1 })
  if (!item) return { ok: false, error: "Dish not found." }
  if (item.stockQuantity === null) return { ok: false, error: "Start tracking stock for this dish first." }
  const next = adjustQuantity(item.stockQuantity, delta)
  if (!next.ok) return next
  // Conditional on the count we read, so a guest ordering at the same moment is never overwritten.
  const rows = await db.menuItems
    .update({ stockQuantity: next.quantity, isAvailable: next.quantity > 0 }, and(eq(menuItems.id, itemId), eq(menuItems.stockQuantity, item.stockQuantity))!)
    .returning({ id: menuItems.id })
  if (rows.length === 0) return { ok: false, error: "Stock changed while you were editing. Try again." }
  await db.stockAdjustments.insert({ itemId, delta, quantityAfter: next.quantity, reason: why })
  refresh("/inventory", "/menu", "/")
  return { ok: true }
}

/** Start tracking a dish with an opening count, or stop tracking it (null). */
export async function setStockTracking(itemId: string, quantity: number | null): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!uuid.safeParse(itemId).success) return { ok: false, error: "Dish not found." }
  if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0 || quantity > 100_000)) return { ok: false, error: "Enter a whole number of 0 or more." }
  const db = scopedDb(s.dealer.id)
  const [item] = await db.menuItems.select(eq(menuItems.id, itemId), { limit: 1 })
  if (!item) return { ok: false, error: "Dish not found." }
  await db.menuItems.update(quantity === null ? { stockQuantity: null } : { stockQuantity: quantity, isAvailable: quantity > 0 }, eq(menuItems.id, itemId))
  await db.stockAdjustments.insert({ itemId, delta: quantity === null ? 0 : quantity - (item.stockQuantity ?? 0), quantityAfter: quantity ?? 0, reason: quantity === null ? "Stopped tracking" : "Started tracking" })
  refresh("/inventory", "/menu", "/")
  return { ok: true }
}

// ---------- delivery zones (owner) ----------

export async function saveZone(id: string | null, input: { name: string; pincodes: string; fee: number; minOrder: number | null; etaMinutes: number | null }): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  const { pincodes, invalid } = parsePincodes(input.pincodes)
  if (invalid.length) return { ok: false, error: `These are not valid pincodes: ${invalid.slice(0, 3).join(", ")}.` }
  const parsed = zoneSchema.safeParse({ name: input.name, pincodes, fee: input.fee, minOrder: input.minOrder, etaMinutes: input.etaMinutes })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const db = scopedDb(s.dealer.id)
  if (id) {
    if (!uuid.safeParse(id).success) return { ok: false, error: "Zone not found." }
    await db.deliveryZones.update(parsed.data, eq(deliveryZones.id, id))
  } else {
    await db.deliveryZones.insert(parsed.data)
  }
  refresh("/delivery-zones", "/checkout")
  return { ok: true }
}

export async function setZoneActive(id: string, isActive: boolean): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  if (!uuid.safeParse(id).success) return { ok: false, error: "Zone not found." }
  await scopedDb(s.dealer.id).deliveryZones.update({ isActive }, eq(deliveryZones.id, id))
  refresh("/delivery-zones", "/checkout")
  return { ok: true }
}

export async function deleteZone(id: string): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  if (!uuid.safeParse(id).success) return { ok: false, error: "Zone not found." }
  await scopedDb(s.dealer.id).deliveryZones.delete(eq(deliveryZones.id, id))
  refresh("/delivery-zones", "/checkout")
  return { ok: true }
}

// ---------- delivery partners (owner) ----------

export async function createPartner(input: unknown, pin: string): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  const parsed = partnerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  if (pin !== "" && !pinSchema.safeParse(pin).success) return { ok: false, error: "The PIN must be 4 to 6 digits." }
  const db = scopedDb(s.dealer.id)
  const codes = (await db.deliveryPartners.select()).map((p) => p.code)
  await db.deliveryPartners.insert({ ...parsed.data, code: nextPartnerCode(codes), pinHash: pin ? await hashPassword(pin) : null })
  refresh("/delivery-partners")
  return { ok: true }
}

export async function setPartnerActive(id: string, isActive: boolean): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  if (!uuid.safeParse(id).success) return { ok: false, error: "Partner not found." }
  await scopedDb(s.dealer.id).deliveryPartners.update({ isActive }, eq(deliveryPartners.id, id))
  refresh("/delivery-partners")
  return { ok: true }
}

export async function setPartnerPin(id: string, pin: string): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  if (!uuid.safeParse(id).success) return { ok: false, error: "Partner not found." }
  const parsed = pinSchema.safeParse(pin)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  await scopedDb(s.dealer.id).deliveryPartners.update({ pinHash: await hashPassword(parsed.data) }, eq(deliveryPartners.id, id))
  refresh("/delivery-partners")
  return { ok: true }
}

export async function deletePartner(id: string): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  if (!uuid.safeParse(id).success) return { ok: false, error: "Partner not found." }
  await scopedDb(s.dealer.id).deliveryPartners.delete(eq(deliveryPartners.id, id))
  refresh("/delivery-partners", "/orders")
  return { ok: true }
}

// ---------- coupons (owner) ----------

const couponSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, "Use 3 to 20 letters or numbers."),
    kind: z.enum(["percent", "flat"]),
    value: z.number().int().min(1, "Enter a discount."),
    minOrder: z.number().int().min(0).default(0),
    maxDiscount: z.number().int().min(1).nullable().default(null),
    expiresAt: z.string().nullable().default(null),
  })
  .refine((c) => c.kind !== "percent" || c.value <= 100, { message: "A percentage cannot be more than 100.", path: ["value"] })

export async function createCoupon(input: unknown): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  const parsed = couponSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const c = parsed.data
  const expires = c.expiresAt ? new Date(`${c.expiresAt}T23:59:59+05:30`) : null
  if (expires && Number.isNaN(expires.getTime())) return { ok: false, error: "Enter a valid expiry date." }
  const db = scopedDb(s.dealer.id)
  if ((await db.coupons.count(eq(coupons.code, c.code))) > 0) return { ok: false, error: "You already have a coupon with that code." }
  await db.coupons.insert({ code: c.code, kind: c.kind, value: c.value, minOrder: c.minOrder, maxDiscount: c.kind === "percent" ? c.maxDiscount : null, expiresAt: expires })
  refresh("/coupons")
  return { ok: true }
}

export async function setCouponActive(id: string, isActive: boolean): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  if (!uuid.safeParse(id).success) return { ok: false, error: "Coupon not found." }
  await scopedDb(s.dealer.id).coupons.update({ isActive }, eq(coupons.id, id))
  refresh("/coupons")
  return { ok: true }
}

export async function deleteCoupon(id: string): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  if (!uuid.safeParse(id).success) return { ok: false, error: "Coupon not found." }
  await scopedDb(s.dealer.id).coupons.delete(eq(coupons.id, id))
  refresh("/coupons")
  return { ok: true }
}

// ---------- banners (owner) ----------

const bannerSchema = z.object({
  title: z.string().trim().min(2, "Enter a title.").max(60),
  subtitle: z.string().trim().max(100).default(""),
  imageUrl: z.string().trim().max(500).default(""),
})

export async function createBanner(input: unknown): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  const parsed = bannerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  if (!isOwnImage(getStorage(), s.dealer.id, parsed.data.imageUrl)) return { ok: false, error: "Upload the image again." }
  const db = scopedDb(s.dealer.id)
  await db.banners.insert({ ...parsed.data, imageUrl: parsed.data.imageUrl || null, sortOrder: await db.banners.count() })
  refresh("/banners", "/")
  return { ok: true }
}

export async function setBannerActive(id: string, isActive: boolean): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  if (!uuid.safeParse(id).success) return { ok: false, error: "Banner not found." }
  await scopedDb(s.dealer.id).banners.update({ isActive }, eq(banners.id, id))
  refresh("/banners")
  return { ok: true }
}

export async function deleteBanner(id: string): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  if (!uuid.safeParse(id).success) return { ok: false, error: "Banner not found." }
  await scopedDb(s.dealer.id).banners.delete(eq(banners.id, id))
  refresh("/banners")
  return { ok: true }
}

// ---------- reviews and enquiries ----------

export async function setReviewStatus(id: string, status: "approved" | "hidden"): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!uuid.safeParse(id).success || !["approved", "hidden"].includes(status)) return { ok: false, error: "Review not found." }
  await scopedDb(s.dealer.id).reviews.update({ status }, eq(reviews.id, id))
  refresh("/reviews")
  return { ok: true }
}

export async function setEnquiryHandled(id: string, handled: boolean): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!uuid.safeParse(id).success) return { ok: false, error: "Message not found." }
  await scopedDb(s.dealer.id).enquiries.update({ status: handled ? "handled" : "new" }, eq(enquiries.id, id))
  refresh("/enquiries")
  return { ok: true }
}

// ---------- ordering settings (owner) ----------

export async function saveOrderSettings(input: unknown): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  const parsed = orderSettingsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  // The dealers table is the tenant root: it is updated by the id taken from the session, never from the request.
  await unscopedDb.update(dealers).set({ orderSettings: parsed.data }).where(eq(dealers.id, s.dealer.id))
  refresh("/settings/ordering", "/")
  return { ok: true }
}

// ---------- storefront profile (owner) ----------

export async function saveProfile(input: unknown): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  await unscopedDb.update(dealers).set({ profile: parsed.data }).where(eq(dealers.id, s.dealer.id))
  refresh("/settings/storefront", "/", "/about", "/contact")
  return { ok: true }
}

// ---------- notifications ----------

export type OrderAlert = { id: string; code: string; customerName: string; itemCount: number; total: number; fulfilment: string; createdAt: string }

/** The newest orders, or only those after `since`, for the new-order alert. Read-only and cheap enough to poll. */
export async function fetchOrderAlerts(since: string | null): Promise<{ ok: true; alerts: OrderAlert[] } | { ok: false }> {
  const s = await session()
  if (!s) return { ok: false }
  const after = since ? new Date(since) : null
  // An unpaid online order is announced when it is paid, not when it is started.
  const placed = ne(orders.status, "pending_payment")
  const rows = await scopedDb(s.dealer.id).orders.select(after && !Number.isNaN(after.getTime()) ? and(gt(orders.createdAt, after), placed) : placed, { orderBy: [desc(orders.createdAt)], limit: 20 })
  return {
    ok: true,
    alerts: rows.map((o) => ({ id: o.id, code: o.code, customerName: o.customerName, itemCount: o.lines.reduce((n, l) => n + l.qty, 0), total: o.total, fulfilment: o.fulfilment, createdAt: o.createdAt.toISOString() })),
  }
}

// ---------- location and service radius (owner) ----------

/** Places that match what the owner typed, to pick the restaurant's spot from. */
export async function findPlaces(query: string): Promise<{ ok: true; places: Place[] } | { ok: false; error: string }> {
  const s = await session()
  if (!s) return { ok: false, error: "Please sign in again." }
  if (!allow(`places:${s.dealer.id}`, 30, 10 * 60_000)) return { ok: false, error: "Too many searches. Try again in a few minutes." }
  return { ok: true, places: await searchPlaces(query) }
}

/** A readable address for a point, used after the owner taps "Use my current location". */
export async function describeSpot(lat: number, lng: number): Promise<{ ok: true; address: string } | { ok: false; error: string }> {
  const s = await session()
  if (!s) return { ok: false, error: "Please sign in again." }
  if (!validCoords(lat, lng)) return { ok: false, error: "That location is outside India." }
  if (!allow(`spot:${s.dealer.id}`, 30, 10 * 60_000)) return { ok: false, error: "Too many tries. Try again in a few minutes." }
  const found = await reverseGeocode(lat, lng)
  return { ok: true, address: found?.address ?? "" }
}

export async function saveServiceArea(input: unknown): Promise<Result> {
  const s = await session()
  if (!s) return denied
  if (!s.owner) return ownerOnly
  const parsed = serviceAreaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Choose the restaurant's location, and a radius between 0.5 and 100 km." }
  if (!validCoords(parsed.data.lat, parsed.data.lng)) return { ok: false, error: "The location must be in India." }
  // The dealers table is the tenant root: it is updated by the id taken from the session, never from the request.
  await unscopedDb.update(dealers).set({ serviceArea: parsed.data }).where(eq(dealers.id, s.dealer.id))
  refresh("/settings/location", "/", "/about", "/checkout")
  return { ok: true }
}
