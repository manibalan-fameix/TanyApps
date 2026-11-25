import { sql } from "drizzle-orm"
import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { customers } from "./cabs.ts"
import { dealers } from "./dealers.ts"
import { menuItems } from "./menu.ts"

/** A photo or video a customer attached to a review. The url is a file in the shop's own storage (lib/restaurant/review-media.ts). */
export type ReviewMediaItem = { type: "image" | "video"; url: string }

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

/**
 * A customer's monthly grocery list: the items they chose, delivered on the same day every month. One per customer per business.
 * The shop's subscriber offer is applied to each month's order when it is created. Pay on delivery, so nothing is charged here.
 */
export const monthlyPlans = pgTable(
  "monthly_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    /** Who receives the delivery. The customer's phone itself stays on the customer row, encrypted. */
    name: text("name").notNull(),
    /** Day of the month, 1 to 28 so every month has it. */
    deliveryDay: integer("delivery_day").notNull(),
    address: text("address").notNull(),
    pincode: text("pincode").notNull().default(""),
    note: text("note").notNull().default(""),
    /** active | paused | cancelled */
    status: text("status").notNull().default("active"),
    /** The month (YYYY-MM, India time) whose order has already been created. Never the same month twice. */
    lastCycle: text("last_cycle"),
    /** Why the last attempt to create an order failed (an item sold out, say). Cleared on success. */
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("monthly_plans_dealer_customer_unique").on(t.dealerId, t.customerId), index("monthly_plans_dealer_status_idx").on(t.dealerId, t.status)],
)

export const monthlyPlanItems = pgTable(
  "monthly_plan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").notNull().references(() => monthlyPlans.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => menuItems.id, { onDelete: "cascade" }),
    portion: text("portion"),
    qty: integer("qty").notNull(),
  },
  (t) => [index("monthly_plan_items_plan_idx").on(t.planId)],
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
    /** The guest's number, encrypted under this restaurant's own key (lib/restaurant/order-phone.ts). Rows written before that may still hold the plain number until the re-key script runs. */
    customerPhone: text("customer_phone").notNull(),
    /** Keyed hash of the number, to find a guest's orders without decrypting everything. Null on rows written before it existed. */
    customerPhoneHash: text("customer_phone_hash"),
    /** delivery | pickup | dine_in */
    fulfilment: text("fulfilment").notNull(),
    address: text("address"),
    note: text("note").notNull().default(""),
    lines: jsonb("lines").$type<OrderLine[]>().notNull(),
    subtotal: integer("subtotal").notNull(),
    discount: integer("discount").notNull().default(0),
    deliveryFee: integer("delivery_fee").notNull().default(0),
    /** GST charged on the items, in whole rupees. Part of `total`. */
    gst: integer("gst").notNull().default(0),
    /** Whole rupees the guest added for the delivery partner. Part of `total`; zero for pickup and dine-in. */
    tip: integer("tip").notNull().default(0),
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
    /** Razorpay's refund for this order, once created, and its own status for it: pending | processed | failed. Null until a refund exists. */
    refundId: text("refund_id"),
    refundStatus: text("refund_status"),
    /** The last reason a refund attempt did not complete. Short and free of secrets. */
    refundError: text("refund_error"),
    /** Automatic refund attempts that did not complete. The recovery job stops at a limit and leaves the rest to a person. */
    refundAttempts: integer("refund_attempts").notNull().default(0),
    /** Set once a cancelled order has put its stock back, so it never happens twice. */
    stockReleased: boolean("stock_released").notNull().default(false),
    /** Set when a monthly plan created this order, with the month it is for. The pair is unique, so a month is never ordered twice. */
    monthlyPlanId: uuid("monthly_plan_id").references(() => monthlyPlans.id, { onDelete: "set null" }),
    monthlyCycle: text("monthly_cycle"),
    /** new | confirmed | preparing | ready | out_for_delivery | completed | cancelled */
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_dealer_created_idx").on(t.dealerId, t.createdAt), index("orders_dealer_phone_idx").on(t.dealerId, t.customerPhone), index("orders_dealer_phone_hash_idx").on(t.dealerId, t.customerPhoneHash), unique("orders_monthly_cycle_unique").on(t.monthlyPlanId, t.monthlyCycle)],
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
    /** Set on a review of the shop itself (not of one order): the signed-in customer who wrote it, one per customer. */
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment").notNull().default(""),
    /** Up to 5 photos and 1 video the customer attached. Shown with the review once the owner approves it. */
    media: jsonb("media").$type<ReviewMediaItem[]>().notNull().default([]),
    /** pending | approved | hidden */
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reviews_dealer_idx").on(t.dealerId, t.status), uniqueIndex("reviews_one_shop_review_per_customer_uq").on(t.dealerId, t.customerId).where(sql`${t.orderId} is null and ${t.customerId} is not null`)],
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

/** A guest's request for a table. The restaurant confirms or declines it by phone. */
export const tableBookings = pgTable(
  "table_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    guests: integer("guests").notNull(),
    /** The day and time the guest wants, as the restaurant's own clock reads them: YYYY-MM-DD and HH:MM. */
    bookingDate: text("booking_date").notNull(),
    bookingTime: text("booking_time").notNull(),
    note: text("note").notNull().default(""),
    /** new | confirmed | declined */
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("table_bookings_dealer_idx").on(t.dealerId, t.status)],
)

export const banners = pgTable(
  "banners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    /** Text on the banner's button. Empty means no button. */
    buttonLabel: text("button_label").notNull().default(""),
    /** Where a tap goes: a page on the restaurant's own site ("/menu", "/category/x") or an https link. Empty means it goes nowhere. */
    linkUrl: text("link_url").notNull().default(""),
    /** Background look, one of lib/restaurant/banners.ts BANNER_TONES. */
    tone: text("tone").notNull().default("soft"),
    imageUrl: text("image_url"),
    /** The big offer text in the dark panel on the right of the banner ("FLAT 20% OFF*"). Empty means the picture, if any, fills that side. */
    promoText: text("promo_text").notNull().default(""),
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
