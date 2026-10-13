"use server"

import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { z } from "zod"

import { razorpayCredentials } from "@/lib/billing/razorpay"
import { billingState } from "@/lib/billing/state"
import { coupons, deliveryZones, menuItems, orders, reviews } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { allow } from "@/lib/rate-limit"
import { createFoodOrder, verifyBookingPaymentSignature } from "@/lib/route/razorpay"
import { applyOrderPayment, expireUnpaidOrders, onlinePaymentsAvailable, payoutAccountFor } from "@/lib/restaurant/payments"
import { checkoutSchema, coordsToStore, couponDiscount, newOrderCode, priceOrder } from "@/lib/restaurant/orders"
import { paymentOptions, readOrderSettings } from "@/lib/restaurant/settings"
import { findZone } from "@/lib/restaurant/delivery"
import { type Place, pincodeCentre, reverseGeocode, searchPlaces } from "@/lib/restaurant/geocode"
import { validCoords } from "@/lib/restaurant/location"
import { checkRadius, formatKm, readServiceArea } from "@/lib/restaurant/service-area"
import { logReserved, releaseOrderStock, releaseStock, reserveStock } from "@/lib/restaurant/stock-server"
import { type DealerProfile, getDealerBySlug } from "@/lib/tenant/dealer"
import { TENANT_HEADER } from "@/lib/tenant/host"

type Fail = { ok: false; error: string; field?: string }

async function context() {
  const h = await headers()
  const slug = h.get(TENANT_HEADER)
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
  const dealer = slug ? await getDealerBySlug(slug) : null
  if (!dealer || dealer.industry !== "restaurants" || dealer.suspended) return null
  return { dealer, ip }
}

const unavailable: Fail = { ok: false, error: "This restaurant is not taking requests right now." }

/** Re-checks a coupon against the guest's current subtotal so the checkout can show the saving. */
export async function previewCoupon(code: string, subtotal: number): Promise<{ ok: true; discount: number } | Fail> {
  const ctx = await context()
  if (!ctx) return unavailable
  if (!allow(`coupon:${ctx.dealer.id}:${ctx.ip}`, 30, 10 * 60_000)) return { ok: false, error: "Too many tries. Please wait a moment." }
  const clean = code.trim().toUpperCase()
  if (!clean || !Number.isFinite(subtotal) || subtotal < 0) return { ok: false, error: "Enter a coupon code." }
  const [row] = await scopedDb(ctx.dealer.id).coupons.select(eq(coupons.code, clean), { limit: 1 })
  const result = couponDiscount(row ?? null, Math.floor(subtotal))
  return "error" in result ? { ok: false, error: result.error } : { ok: true, discount: result.discount }
}

export type DeliveryQuote = { zoneName: string; fee: number; minOrder: number | null; etaMinutes: number | null }

/** What delivering to a pincode would cost, so the checkout can show it before the order is placed. */
export async function previewDelivery(pincode: string, lat: number | null = null, lng: number | null = null): Promise<{ ok: true; quote: DeliveryQuote | null } | Fail> {
  const ctx = await context()
  if (!ctx) return unavailable
  if (!allow(`quote:${ctx.dealer.id}:${ctx.ip}`, 60, 10 * 60_000)) return { ok: false, error: "Too many tries. Please wait a moment." }
  const check = await areaCheck(ctx.dealer, pincode.trim(), lat !== null && lng !== null && validCoords(lat, lng) ? { lat, lng } : null)
  if (!check.deliverable) return { ok: false, error: notDeliverable(check), field: "pincode" }
  if (!check.zonesEnabled || check.zone === null || check.fee === null) return { ok: true, quote: null }
  return { ok: true, quote: { zoneName: check.zone, fee: check.fee, minOrder: check.minOrder, etaMinutes: check.etaMinutes } }
}

export type PaymentCheckout = { orderId: string; keyId: string; amount: number; name: string; description: string }

function checkoutFor(dealerName: string, code: string, orderId: string, amount: number): PaymentCheckout | null {
  const creds = razorpayCredentials()
  return creds ? { orderId, keyId: creds.keyId, amount, name: dealerName, description: `Order ${code}` } : null
}

export async function placeOrder(input: unknown): Promise<{ ok: true; code: string; checkout: PaymentCheckout | null } | Fail> {
  const ctx = await context()
  if (!ctx) return unavailable
  const { dealer, ip } = ctx
  if (!billingState(dealer).hasAccess) return unavailable
  if (!allow(`order:${dealer.id}:${ip}`, 8, 10 * 60_000)) return { ok: false, error: "Too many orders from this device. Please wait a few minutes." }

  const parsed = checkoutSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") }
  }
  const data = parsed.data
  const db = scopedDb(dealer.id)
  const settings = readOrderSettings(dealer.orderSettings)
  if (!paymentOptions(settings, onlinePaymentsAvailable(dealer)).includes(data.paymentMethod))
    return { ok: false, error: "That way of paying is not available. Choose another.", field: "paymentMethod" }

  // Unpaid online orders from earlier visitors give their stock back before this one looks for it.
  await expireUnpaidOrders(dealer.id)

  const ids = [...new Set(data.lines.map((l) => l.itemId))]
  const [items, couponRows, zoneRows] = await Promise.all([
    db.menuItems.select(inArray(menuItems.id, ids)),
    data.couponCode ? db.coupons.select(eq(coupons.code, data.couponCode), { limit: 1 }) : Promise.resolve([]),
    db.deliveryZones.select(eq(deliveryZones.isActive, true), { orderBy: [asc(deliveryZones.createdAt)] }),
  ])
  const priced = priceOrder(
    data,
    items.map((i) => ({ id: i.id, name: i.name, price: i.price, portions: i.portions, isAvailable: i.isAvailable, stock: i.stockQuantity })),
    settings,
    couponRows[0] ?? null,
    Boolean(data.couponCode),
    new Date(),
    zoneRows.map((z) => ({ id: z.id, name: z.name, pincodes: z.pincodes, fee: z.fee, minOrder: z.minOrder, etaMinutes: z.etaMinutes, isActive: z.isActive })),
    readServiceArea(dealer.serviceArea)?.radiusKm == null,
  )
  if (!priced.ok) return { ok: false, error: priced.error, field: priced.field }
  // The delivery destination is the address the guest typed. Their live location only counts when it is that same
  // place (it falls in the pincode they entered), otherwise someone far away could borrow a nearby phone location.
  const here = await trustedPoint(data)
  // The service radius is checked here too, so it cannot be skipped by calling this action directly.
  if (data.fulfilment === "delivery") {
    const where = await areaCheck(dealer, priced.pincode ?? data.pincode, here)
    if (where.reason === "radius") return { ok: false, error: notDeliverable(where), field: "pincode" }
  }
  // A fully discounted order has nothing to charge, so it is settled at the counter like any other.
  const online = data.paymentMethod === "online" && priced.total >= 1

  // Take the stock first. It is the step that can lose a race, and it is put back if the order cannot be saved.
  const taken = await reserveStock(dealer.id, priced.lines)
  if (!taken.ok) return { ok: false, error: taken.error }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newOrderCode()
    try {
      await db.orders.insert({
        code,
        customerName: data.name,
        customerPhone: data.phone,
        fulfilment: data.fulfilment,
        address: data.fulfilment === "delivery" ? data.address : null,
        note: data.note,
        lines: priced.lines,
        subtotal: priced.subtotal,
        discount: priced.discount,
        deliveryFee: priced.deliveryFee,
        total: priced.total,
        couponCode: priced.discount > 0 ? data.couponCode : null,
        pincode: priced.pincode,
        zoneName: priced.zoneName,
        ...coordsToStore(data.fulfilment, here?.lat ?? null, here?.lng ?? null),
        paymentMethod: online ? "online" : "cod",
        // An online order is not on the kitchen's list until the payment is confirmed.
        status: online ? "pending_payment" : "new",
      })
    } catch (e) {
      const pg = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code
      if (pg === "23505") continue
      console.error("order insert failed")
      await releaseStock(dealer.id, taken.reserved, null)
      return { ok: false, error: "Something went wrong. Please try again." }
    }

    await logReserved(dealer.id, taken.reserved, `Order ${code}`)
    if (priced.discount > 0)
      await db.coupons.update({ usedCount: sql`${coupons.usedCount} + 1` as unknown as number }, eq(coupons.code, data.couponCode))
    if (!online) return { ok: true, code, checkout: null }

    try {
      const rz = await createFoodOrder({ amount: priced.total, receipt: code, linkedAccountId: payoutAccountFor(dealer), notes: { dealer_id: dealer.id, order_code: code } })
      const checkout = rz ? checkoutFor(dealer.displayName, code, rz.orderId, priced.total) : null
      if (!rz || !checkout) throw new Error("payments unavailable")
      await db.orders.update({ razorpayOrderId: rz.orderId }, eq(orders.code, code))
      return { ok: true, code, checkout }
    } catch (error) {
      console.error(`razorpay order failed: ${error instanceof Error ? error.message : "unknown"}`)
      await db.orders.update({ status: "cancelled", stockReleased: true }, eq(orders.code, code))
      await releaseOrderStock(dealer.id, code, "payment could not start")
      return { ok: false, error: "We could not start the payment. Please try again, or choose pay on delivery." }
    }
  }
  await releaseStock(dealer.id, taken.reserved, null)
  return { ok: false, error: "Something went wrong. Please try again." }
}

/** Called after Razorpay Checkout succeeds. The signature proves this order was really paid. */
export async function confirmOrderPayment(input: { orderId: string; paymentId: string; signature: string }): Promise<{ ok: true; code: string } | Fail> {
  const ctx = await context()
  if (!ctx) return unavailable
  if (!allow(`confirm:${ctx.ip}`, 30, 10 * 60_000)) return { ok: false, error: "Too many tries. Please wait a moment." }
  if (!(await verifyBookingPaymentSignature(input))) return { ok: false, error: "We could not verify that payment." }
  try {
    const r = await applyOrderPayment(input.orderId, input.paymentId)
    if (!r.found || !r.code) return { ok: false, error: "We could not find that order." }
    if (r.refunded) return { ok: false, error: "This order expired before your payment arrived, so it has been refunded." }
    return { ok: true, code: r.code }
  } catch (error) {
    console.error(`confirm order payment failed: ${error instanceof Error ? error.message : "unknown"}`)
    return { ok: false, error: "We are still confirming your payment. Check your order page in a minute." }
  }
}

/** Reopens payment for an order that is still waiting, so a closed popup or a failed attempt can be retried. */
export async function getPaymentCheckout(code: string): Promise<{ ok: true; checkout: PaymentCheckout } | Fail> {
  const ctx = await context()
  if (!ctx) return unavailable
  if (!allow(`paynow:${ctx.ip}`, 20, 10 * 60_000)) return { ok: false, error: "Too many tries. Please wait a moment." }
  if (!/^[A-Za-z0-9]{6}$/.test(code)) return { ok: false, error: "Order not found." }
  await expireUnpaidOrders(ctx.dealer.id)
  const [order] = await scopedDb(ctx.dealer.id).orders.select(eq(orders.code, code.toUpperCase()), { limit: 1 })
  if (!order || order.status !== "pending_payment" || !order.razorpayOrderId) return { ok: false, error: "This order is not waiting for payment." }
  const checkout = checkoutFor(ctx.dealer.displayName, order.code, order.razorpayOrderId, order.total)
  return checkout ? { ok: true, checkout } : unavailable
}

/** A guest drops their own unpaid order, which frees the stock it was holding. */
export async function cancelPendingOrder(code: string): Promise<{ ok: true } | Fail> {
  const ctx = await context()
  if (!ctx) return unavailable
  if (!allow(`cancel-pending:${ctx.ip}`, 20, 10 * 60_000)) return { ok: false, error: "Too many tries. Please wait a moment." }
  if (!/^[A-Za-z0-9]{6}$/.test(code)) return { ok: false, error: "Order not found." }
  const db = scopedDb(ctx.dealer.id)
  const rows = await db.orders
    .update({ status: "cancelled", stockReleased: true, updatedAt: new Date() }, and(eq(orders.code, code.toUpperCase()), eq(orders.status, "pending_payment"))!)
    .returning({ code: orders.code })
  if (rows.length === 0) return { ok: false, error: "This order can no longer be cancelled here." }
  await releaseOrderStock(ctx.dealer.id, rows[0].code, "cancelled by guest")
  return { ok: true }
}

const enquirySchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(60),
  phone: z.string().trim().regex(/^[0-9+\s-]{10,15}$/, "Enter a valid phone number."),
  message: z.string().trim().min(5, "Write a short message.").max(600),
})

export async function sendEnquiry(input: unknown): Promise<{ ok: true } | Fail> {
  const ctx = await context()
  if (!ctx) return unavailable
  if (!allow(`enquiry:${ctx.dealer.id}:${ctx.ip}`, 5, 60 * 60_000)) return { ok: false, error: "Too many messages. Please try again later." }
  const parsed = enquirySchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue.message, field: String(issue.path[0]) }
  }
  await scopedDb(ctx.dealer.id).enquiries.insert(parsed.data)
  return { ok: true }
}

const reviewSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).default(""),
})

/** Only the holder of a completed order's code can review, once per order. Reviews wait for the owner's approval. */
export async function submitReview(input: unknown): Promise<{ ok: true } | Fail> {
  const ctx = await context()
  if (!ctx) return unavailable
  if (!allow(`review:${ctx.dealer.id}:${ctx.ip}`, 10, 60 * 60_000)) return { ok: false, error: "Too many tries. Please try again later." }
  const parsed = reviewSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Choose a rating from 1 to 5." }
  const db = scopedDb(ctx.dealer.id)
  const [order] = await db.orders.select(eq(orders.code, parsed.data.code), { limit: 1 })
  if (!order || order.status !== "completed") return { ok: false, error: "You can review once your order is completed." }
  const existing = await db.reviews.count(eq(reviews.orderId, order.id))
  if (existing > 0) return { ok: false, error: "You have already reviewed this order." }
  await db.reviews.insert({
    orderId: order.id,
    name: order.customerName.split(" ")[0],
    rating: parsed.data.rating,
    comment: parsed.data.comment,
  })
  return { ok: true }
}


// ---------- the guest's location ----------

export type AreaCheck = {
  /** Delivery zones are set up, so only pincodes inside one are served. */
  zonesEnabled: boolean
  deliverable: boolean
  zone: string | null
  fee: number | null
  etaMinutes: number | null
  minOrder: number | null
  /** Set when the restaurant limits delivery to a distance. `distanceKm` is null if it could not be worked out. */
  radius: { km: number; distanceKm: number | null; within: boolean } | null
  /** Why delivery is not possible here, if it is not. */
  reason: "zone" | "radius" | null
}

type Point = { lat: number; lng: number }

/**
 * Whether this restaurant delivers to a pincode (and a live point, when the guest shared one): inside a delivery
 * zone if zones are set up, and within the service radius if one is set. With only a pincode the distance is
 * estimated from the pincode's centre. If that cannot be found, the radius is not held against the guest.
 */
async function areaCheck(dealer: DealerProfile, pincode: string, point: Point | null): Promise<AreaCheck> {
  const zones = await scopedDb(dealer.id).deliveryZones.select(eq(deliveryZones.isActive, true), { orderBy: [asc(deliveryZones.createdAt)] })
  const zone = zones.length ? findZone(zones, pincode) : null
  const area = readServiceArea(dealer.serviceArea)
  // With a distance limit, the distance decides who can order and zones only set the charge. Without one, zones decide.
  const zoneOk = area?.radiusKm != null || zones.length === 0 || zone !== null

  let radius: AreaCheck["radius"] = null
  if (area && area.radiusKm !== null) {
    const where = point ?? (pincode ? await pincodeCentre(pincode) : null)
    const rc = checkRadius(area, where)
    radius = { km: area.radiusKm, distanceKm: rc?.distanceKm ?? null, within: rc ? rc.within : true }
  }
  const radiusOk = radius ? radius.within : true
  return {
    zonesEnabled: zones.length > 0,
    deliverable: zoneOk && radiusOk,
    zone: zone?.name ?? null,
    fee: zone?.fee ?? null,
    etaMinutes: zone?.etaMinutes ?? null,
    minOrder: zone?.minOrder ?? null,
    radius,
    reason: !radiusOk ? "radius" : !zoneOk ? "zone" : null,
  }
}

/**
 * The guest's live point, but only when it agrees with the pincode they typed (or they typed none). If the pincode
 * cannot be confirmed against the point, the point is ignored and the pincode alone decides.
 */
async function trustedPoint(data: { latitude: number | null; longitude: number | null; pincode: string; fulfilment: string }): Promise<Point | null> {
  if (data.fulfilment !== "delivery" || data.latitude === null || data.longitude === null || !validCoords(data.latitude, data.longitude)) return null
  const point = { lat: data.latitude, lng: data.longitude }
  if (!data.pincode) return point
  const found = await reverseGeocode(point.lat, point.lng)
  return found && found.pincode === data.pincode ? point : null
}

/** The sentence a guest reads when delivery is not possible. */
function notDeliverable(c: AreaCheck): string {
  return c.reason === "radius" && c.radius
    ? `Sorry, that is ${c.radius.distanceKm !== null ? `${formatKm(c.radius.distanceKm)} km` : "too far"} from the restaurant and we deliver up to ${formatKm(c.radius.km)} km. Try pickup instead.`
    : "Sorry, we do not deliver to that pincode yet. Try pickup or call us."
}

export type LocateResult = ({ ok: true; pincode: string; area: string; city: string; address: string } & AreaCheck) | Fail

/** Turns a live location into an address and pincode, and says whether this restaurant delivers there. Nothing is stored. */
export async function locateGuest(lat: number, lng: number): Promise<LocateResult> {
  const ctx = await context()
  if (!ctx) return unavailable
  if (!allow(`locate:${ctx.ip}`, 40, 10 * 60_000)) return { ok: false, error: "Too many tries. Please wait a moment." }
  if (!validCoords(lat, lng)) return { ok: false, error: "We can only deliver within India." }
  const found = await reverseGeocode(lat, lng)
  if (!found) return { ok: false, error: "We could not find an address for that spot. Enter your pincode instead.", field: "geocode" }
  // The live point is used for the distance; the pincode it falls in decides the delivery zone.
  const check = await areaCheck(ctx.dealer, found.pincode, { lat, lng })
  return { ok: true, pincode: found.pincode, area: found.area, city: found.city || ctx.dealer.city, address: found.address, ...check }
}

/** Finds places in India for the guest's address search on the location map. */
export async function searchGuestPlaces(query: string): Promise<{ ok: true; places: Place[] } | Fail> {
  const ctx = await context()
  if (!ctx) return unavailable
  if (!allow(`place-search:${ctx.ip}`, 40, 10 * 60_000)) return { ok: false, error: "Too many searches. Please wait a moment." }
  return { ok: true, places: await searchPlaces(String(query).slice(0, 120)) }
}

/** The same answer for a pincode the guest typed instead. */
export async function checkPincode(pincode: string): Promise<LocateResult> {
  const ctx = await context()
  if (!ctx) return unavailable
  if (!allow(`pincode:${ctx.ip}`, 60, 10 * 60_000)) return { ok: false, error: "Too many tries. Please wait a moment." }
  const clean = pincode.trim()
  if (!/^[1-9]\d{5}$/.test(clean)) return { ok: false, error: "Enter a 6-digit pincode.", field: "pincode" }
  const check = await areaCheck(ctx.dealer, clean, null)
  return { ok: true, pincode: clean, area: check.zone ?? "", city: ctx.dealer.city, address: "", ...check }
}
