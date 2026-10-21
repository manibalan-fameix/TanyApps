import { z } from "zod"

import { type StatusGraph, defineStatusGraph } from "../core/status-graph"
import type { OrderLine } from "../db/schema/restaurant.ts"
import { type ZoneRow, findZone, PINCODE_RE } from "./delivery"
import { validCoords } from "./location"
import { type Fulfilment, FULFILMENTS, type OrderSettings, PAYMENT_METHODS } from "./settings"
import { unitsByItem } from "./stock"

export const ORDER_STATUSES = ["pending_payment", "new", "confirmed", "preparing", "ready", "out_for_delivery", "completed", "cancelled"] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  new: "New",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  completed: "Completed",
  cancelled: "Cancelled",
}

/** What the guest reads on their tracking page. */
export const STATUS_MESSAGE: Record<OrderStatus, string> = {
  pending_payment: "Complete your payment to place this order. Unpaid orders are released after 20 minutes.",
  new: "We have received your order and will confirm it shortly.",
  confirmed: "Your order is confirmed.",
  preparing: "We are preparing your food.",
  ready: "Your order is ready.",
  out_for_delivery: "Your order is on the way.",
  completed: "Order completed. Thank you!",
  cancelled: "This order was cancelled.",
}

/** The steps shown in order, per fulfilment. Pickup and dine-in skip "out for delivery". */
export function timelineFor(fulfilment: Fulfilment): OrderStatus[] {
  return fulfilment === "delivery"
    ? ["new", "confirmed", "preparing", "out_for_delivery", "completed"]
    : ["new", "confirmed", "preparing", "ready", "completed"]
}

/**
 * The order lifecycle for one kind of fulfilment: each step moves to the next one on its timeline, any unfinished order
 * can be cancelled, and an unpaid online order (`pending_payment`) can only be dropped until payment arrives.
 */
export function orderGraph(fulfilment: Fulfilment): StatusGraph<OrderStatus> {
  const line = timelineFor(fulfilment)
  // Any unfinished order can be cancelled, including a status that is not a step on this fulfilment's timeline.
  const transitions = Object.fromEntries(ORDER_STATUSES.map((s) => [s, ["cancelled"] as OrderStatus[]])) as Record<OrderStatus, OrderStatus[]>
  transitions.completed = []
  transitions.cancelled = []
  line.forEach((status, i) => {
    if (status !== "completed") transitions[status] = [line[i + 1], "cancelled"]
  })
  return defineStatusGraph(transitions)
}

/** Statuses an order may move to next. Cancelling is allowed until it is done. */
export function nextStatuses(status: OrderStatus, fulfilment: Fulfilment): OrderStatus[] {
  return [...orderGraph(fulfilment).next(status)]
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
/** Six unambiguous characters (no 0/O/1/I), about a billion combinations. */
export function newOrderCode(random: (n: number) => number = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[random(CODE_ALPHABET.length)]).join("")
}

// ---------- checkout input ----------

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\+91|91|0)?[6-9][0-9]{9}$/, "Enter a valid 10-digit mobile number."))
  .transform((v) => `+91${v.slice(-10)}`)

export const checkoutSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(60),
  phone,
  fulfilment: z.enum(FULFILMENTS),
  paymentMethod: z.enum(PAYMENT_METHODS).default("cod"),
  address: z.string().trim().max(300).default(""),
  pincode: z.string().trim().max(6).default(""),
  /** Live location from the guest's phone, for delivery. Optional; ignored unless it is a real point in India. */
  latitude: z.number().nullable().default(null),
  longitude: z.number().nullable().default(null),
  note: z.string().trim().max(300).default(""),
  couponCode: z.string().trim().toUpperCase().max(30).default(""),
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        portion: z.string().max(30).nullable().default(null),
        qty: z.number().int().min(1).max(20),
      }),
    )
    .min(1, "Your cart is empty.")
    .max(40),
})
export type CheckoutInput = z.infer<typeof checkoutSchema>

// ---------- pricing (always computed on the server from stored prices) ----------

export type PricedItem = {
  id: string
  name: string
  price: number
  portions: { label: string; price: number }[]
  isAvailable: boolean
  /** Units left, or null when stock is not tracked. */
  stock?: number | null
}

export type CouponRow = {
  code: string
  kind: string
  value: number
  minOrder: number
  maxDiscount: number | null
  isActive: boolean
  expiresAt: Date | null
}

export type PriceResult =
  | { ok: true; lines: OrderLine[]; subtotal: number; discount: number; deliveryFee: number; total: number; pincode: string | null; zoneName: string | null; etaMinutes: number | null }
  | { ok: false; error: string; field?: string }

/** Discount a coupon gives on a subtotal, or an error for the guest. */
export function couponDiscount(coupon: CouponRow | null, subtotal: number, now = new Date()): { discount: number } | { error: string } {
  if (!coupon || !coupon.isActive) return { error: "That coupon code is not valid." }
  if (coupon.expiresAt && coupon.expiresAt.getTime() < now.getTime()) return { error: "That coupon has expired." }
  if (subtotal < coupon.minOrder) return { error: `Add ₹${coupon.minOrder - subtotal} more to use this coupon.` }
  const raw = coupon.kind === "percent" ? Math.floor((subtotal * coupon.value) / 100) : coupon.value
  const capped = coupon.kind === "percent" && coupon.maxDiscount != null ? Math.min(raw, coupon.maxDiscount) : raw
  return { discount: Math.max(0, Math.min(capped, subtotal)) }
}

export function priceOrder(
  input: Pick<CheckoutInput, "lines" | "fulfilment" | "address"> & { pincode?: string },
  items: PricedItem[],
  settings: OrderSettings,
  coupon: CouponRow | null,
  couponRequested: boolean,
  now = new Date(),
  zones: ZoneRow[] = [],
  zonesRequired = true,
): PriceResult {
  if (!settings.acceptingOrders) return { ok: false, error: "We are not taking orders right now." }
  const enabled = input.fulfilment === "delivery" ? settings.delivery : input.fulfilment === "pickup" ? settings.pickup : settings.dineIn
  if (!enabled) return { ok: false, error: "That option is not available. Choose another.", field: "fulfilment" }
  if (input.fulfilment === "delivery" && input.address.length < 6) return { ok: false, error: "Enter your delivery address.", field: "address" }

  // With delivery zones set up, a delivery address must be inside one; the zone then sets the fee and minimum.
  // When the restaurant limits delivery by distance instead (`zonesRequired` false), a matching zone still sets the
  // charge, but an address outside every zone is allowed: the distance check decides who can order.
  let zone: ZoneRow | null = null
  const pincode = (input.pincode ?? "").trim()
  if (input.fulfilment === "delivery" && zones.some((z) => z.isActive)) {
    if (zonesRequired) {
      if (!PINCODE_RE.test(pincode)) return { ok: false, error: "Enter your 6-digit pincode.", field: "pincode" }
      zone = findZone(zones, pincode)
      if (!zone) return { ok: false, error: "Sorry, we do not deliver to that pincode yet. Try pickup or call us.", field: "pincode" }
    } else if (PINCODE_RE.test(pincode)) {
      zone = findZone(zones, pincode)
    }
  }

  const byId = new Map(items.map((i) => [i.id, i]))
  for (const [id, units] of unitsByItem(input.lines)) {
    const item = byId.get(id)
    if (item && item.stock != null && units > item.stock)
      return { ok: false, error: item.stock <= 0 ? `${item.name} is sold out right now.` : `Only ${item.stock} left of ${item.name}.` }
  }
  const lines: OrderLine[] = []
  for (const l of input.lines) {
    const item = byId.get(l.itemId)
    if (!item) return { ok: false, error: "A dish in your cart is no longer on the menu." }
    if (!item.isAvailable) return { ok: false, error: `${item.name} is sold out right now.` }
    let price = item.price
    if (item.portions.length > 0) {
      const portion = item.portions.find((p) => p.label === l.portion)
      if (!portion) return { ok: false, error: `Choose a portion for ${item.name}.` }
      price = portion.price
    }
    lines.push({ itemId: item.id, name: item.name, portion: l.portion, price, qty: l.qty })
  }

  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0)
  const minOrder = zone?.minOrder ?? settings.minOrder
  if (subtotal < minOrder) return { ok: false, error: `The minimum order${zone ? ` for ${zone.name}` : ""} is ₹${minOrder}.` }

  let discount = 0
  if (couponRequested) {
    const c = couponDiscount(coupon, subtotal, now)
    if ("error" in c) return { ok: false, error: c.error, field: "couponCode" }
    discount = c.discount
  }
  const free = settings.freeDeliveryAbove !== null && subtotal - discount >= settings.freeDeliveryAbove
  const deliveryFee = input.fulfilment === "delivery" && !free ? (zone ? zone.fee : settings.deliveryFee) : 0
  return {
    ok: true,
    lines,
    subtotal,
    discount,
    deliveryFee,
    total: subtotal - discount + deliveryFee,
    pincode: input.fulfilment === "delivery" && pincode ? pincode : null,
    zoneName: zone?.name ?? null,
    etaMinutes: zone?.etaMinutes ?? null,
  }
}

/** How long an unpaid online order holds its stock before it is released. */
export const PAYMENT_WINDOW_MINUTES = 20

/** The coordinates to keep on an order: only for delivery, and only when they are a real point in India. */
export function coordsToStore(fulfilment: string, lat: number | null, lng: number | null): { latitude: number | null; longitude: number | null } {
  if (fulfilment !== "delivery" || lat === null || lng === null || !validCoords(lat, lng)) return { latitude: null, longitude: null }
  return { latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lng * 1e6) / 1e6 }
}
