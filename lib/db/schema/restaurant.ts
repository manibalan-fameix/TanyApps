import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"

import { dealers } from "./dealers.ts"
import { menuItems } from "./menu.ts"

export type OrderLine = { itemId: string; name: string; portion: string | null; price: number; qty: number }

export const deliveryPartners = pgTable(
  "delivery_partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    /** Short sign-in id the rider uses on the delivery page, like DP001. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    vehicleNumber: text("vehicle_number").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    /** scrypt hash of the rider's 4 to 6 digit PIN. Null until the owner sets one. */
    pinHash: text("pin_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("delivery_partners_dealer_code_unique").on(t.dealerId, t.code)],
)

export const deliveryZones = pgTable(
  "delivery_zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    pincodes: jsonb("pincodes").$type<string[]>().notNull().default([]),
    /** Whole rupees. Replaces the default delivery fee for addresses in this zone. */
    fee: integer("fee").notNull().default(0),
    /** Replaces the default minimum order for this zone. Null uses the default. */
    minOrder: integer("min_order"),
    etaMinutes: integer("eta_minutes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("delivery_zones_dealer_idx").on(t.dealerId)],
)

export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => menuItems.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    quantityAfter: integer("quantity_after").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stock_adjustments_dealer_idx").on(t.dealerId, t.createdAt)],
)

/** A guest order. Lines are a snapshot, so later menu edits never rewrite history. Amounts are whole rupees. */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    /** Short, unguessable code the guest uses to follow the order. */
    code: text("code").notNull().unique(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    /** delivery | pickup | dine_in */
    fulfilment: text("fulfilment").notNull(),
    address: text("address"),
    note: text("note").notNull().default(""),
    lines: jsonb("lines").$type<OrderLine[]>().notNull(),
    subtotal: integer("subtotal").notNull(),
    discount: integer("discount").notNull().default(0),
    deliveryFee: integer("delivery_fee").notNull().default(0),
    total: integer("total").notNull(),
    couponCode: text("coupon_code"),
    /** Delivery address pincode and the zone it matched, kept so reports survive later zone edits. */
    pincode: text("pincode"),
    /** Where the guest shared their live location when ordering delivery. Used to find the door, never shown publicly. */
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    zoneName: text("zone_name"),
    partnerId: uuid("partner_id").references(() => deliveryPartners.id, { onDelete: "set null" }),
    /** SHA-256 of the private link sent to the rider for this delivery. The link itself is never stored. */
    riderTokenHash: text("rider_token_hash").unique(),
    /** The same link, encrypted, so "send again" shows the link the rider already has instead of breaking it. */
    riderTokenEnc: text("rider_token_enc"),
    riderAssignedAt: timestamp("rider_assigned_at", { withTimezone: true }),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    /** cod (pay on delivery or pickup) | online */
    paymentMethod: text("payment_method").notNull().default("cod"),
    /** pending | paid | refunded */
    paymentStatus: text("payment_status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** Razorpay order and payment for online payments. The order id is how a webhook finds its order. */
    razorpayOrderId: text("razorpay_order_id").unique(),
    razorpayPaymentId: text("razorpay_payment_id"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    /** Set once a cancelled order has put its stock back, so it never happens twice. */
    stockReleased: boolean("stock_released").notNull().default(false),
    /** new | confirmed | preparing | ready | out_for_delivery | completed | cancelled */
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_dealer_created_idx").on(t.dealerId, t.createdAt), index("orders_dealer_phone_idx").on(t.dealerId, t.customerPhone)],
)

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    /** percent | flat */
    kind: text("kind").notNull(),
    value: integer("value").notNull(),
    minOrder: integer("min_order").notNull().default(0),
    /** Cap for percent coupons. */
    maxDiscount: integer("max_discount"),
    isActive: boolean("is_active").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usedCount: integer("used_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("coupons_dealer_code_unique").on(t.dealerId, t.code)],
)

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment").notNull().default(""),
    /** pending | approved | hidden */
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reviews_dealer_idx").on(t.dealerId, t.status)],
)

export const enquiries = pgTable(
  "enquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    message: text("message").notNull(),
    /** new | handled */
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("enquiries_dealer_idx").on(t.dealerId, t.status)],
)

export const banners = pgTable(
  "banners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    imageUrl: text("image_url"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("banners_dealer_idx").on(t.dealerId)],
)

/**
 * The latest position a rider shared for an order. Used when Cloudflare's live-tracking object is not available
 * (local development); in production the same data lives in a Durable Object. One row per order, overwritten.
 */
export const orderLocations = pgTable(
  "order_locations",
  {
    orderId: uuid("order_id").primaryKey().references(() => orders.id, { onDelete: "cascade" }),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    accuracy: doublePrecision("accuracy"),
    heading: doublePrecision("heading"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_locations_dealer_idx").on(t.dealerId)],
)
