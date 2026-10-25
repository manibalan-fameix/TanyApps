import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { bookingStatus, carStatus, leadSource, leadStatus, mediaAngle, mediaKind, mediaStatus, priceEventType } from "./enums.ts"
import { dealers } from "./dealers.ts"
import { variants } from "./variants.ts"
import type { MarketplaceDetails } from "../../cars/marketplace.ts"
import type { VoiceDraft } from "../../voice/draft.ts"

export const cars = pgTable(
  "cars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id),
    // Nullable: a draft exists before the dealer picks a variant match.
    variantId: uuid("variant_id").references(() => variants.id),
    /** AES-256-GCM ciphertext (lib/crypto). Never store or log plaintext. */
    regNumber: text("reg_number"),
    regPrefix: text("reg_prefix"),
    // Nullable: a draft exists before RC lookup fills it. Publishing requires it.
    year: integer("year"),
    kmDriven: integer("km_driven"),
    ownerCount: integer("owner_count"),
    fuel: text("fuel"),
    transmission: text("transmission"),
    colour: text("colour"),
    askingPrice: integer("asking_price"),
    status: carStatus("status").notNull().default("draft"),
    shortCode: text("short_code").notNull().unique(),
    slug: text("slug").notNull(),
    rcVerifiedAt: timestamp("rc_verified_at", { withTimezone: true }),
    insuranceValidTill: date("insurance_valid_till"),
    hypothecationCleared: boolean("hypothecation_cleared"),
    listedAt: timestamp("listed_at", { withTimezone: true }),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    soldPrice: integer("sold_price"),
    /** Instagram caption generated at publish (includes the short link). */
    caption: text("caption"),
    /** Marketplace listing content: inspection, EMI, specs, features, plans and booking details. */
    marketplaceDetails: jsonb("marketplace_details").$type<MarketplaceDetails>(),
    /** "Add by voice" progress, kept while the car is still a draft. */
    voiceDraft: jsonb("voice_draft").$type<VoiceDraft>(),
  },
  (t) => [
    index("cars_dealer_idx").on(t.dealerId),
    index("cars_dealer_status_idx").on(t.dealerId, t.status),
    unique("cars_dealer_slug_uq").on(t.dealerId, t.slug),
  ],
)

export const carMedia = pgTable(
  "car_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carId: uuid("car_id").notNull().references(() => cars.id, { onDelete: "cascade" }),
    kind: mediaKind("kind").notNull(),
    angle: mediaAngle("angle"),
    r2Key: text("r2_key").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationSec: integer("duration_sec"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: mediaStatus("status").notNull().default("pending"),
    /** Video only: which required angles the AI saw, and which are still missing. */
    analysis: jsonb("analysis").$type<{ seen: string[]; missing: string[]; analysedAt: string }>(),
  },
  (t) => [
    index("car_media_car_idx").on(t.carId, t.sortOrder),
    // One row per upload attempt key, so retried requests reuse the slot instead of duplicating it.
    unique("car_media_r2key_uq").on(t.r2Key),
  ],
)

export const rcLookups = pgTable(
  "rc_lookups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carId: uuid("car_id").notNull().references(() => cars.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    /** Encrypted JSON string. Cache only: never re-call within 30 days. */
    rawResponse: text("raw_response").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rc_lookups_car_idx").on(t.carId, t.fetchedAt)],
)

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id),
    carId: uuid("car_id").notNull().references(() => cars.id),
    name: text("name").notNull(),
    /** Encrypted. */
    phone: text("phone").notNull(),
    source: leadSource("source").notNull(),
    preferredAt: timestamp("preferred_at", { withTimezone: true }),
    status: leadStatus("status").notNull().default("new"),
    utm: jsonb("utm").$type<Record<string, string>>(),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("leads_dealer_idx").on(t.dealerId),
    index("leads_dealer_status_idx").on(t.dealerId, t.status),
    index("leads_car_idx").on(t.carId),
  ],
)

export const carViews = pgTable(
  "car_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carId: uuid("car_id").notNull().references(() => cars.id, { onDelete: "cascade" }),
    sessionHash: text("session_hash").notNull(),
    referrer: text("referrer"),
    dwellMs: integer("dwell_ms"),
    maxScrollPct: integer("max_scroll_pct"),
    videoPlayed: boolean("video_played").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("car_views_car_idx").on(t.carId, t.createdAt)],
)

export const rcTransfers = pgTable(
  "rc_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carId: uuid("car_id").notNull().references(() => cars.id).unique(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    /** 1 Documents collected, 2 Form 29/30 signed, 3 Submitted to RTO, 4 Approved, 5 New RC delivered. */
    stage: integer("stage").notNull().default(1),
    stageUpdatedAt: timestamp("stage_updated_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    buyerTrackingToken: text("buyer_tracking_token").notNull().unique(),
  },
)

/** A buyer's paid booking token, transferred straight to the dealer's Razorpay linked account. */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id),
    carId: uuid("car_id").notNull().references(() => cars.id),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    buyerName: text("buyer_name").notNull(),
    /** Encrypted, like leads.phone. */
    buyerPhone: text("buyer_phone").notNull(),
    /** Whole rupees, matching askingPrice/soldPrice. */
    amount: integer("amount").notNull(),
    razorpayOrderId: text("razorpay_order_id").notNull().unique(),
    razorpayPaymentId: text("razorpay_payment_id"),
    /**
     * created -> paid, or created -> refund_pending when the payment cannot be honoured (the car was taken first). A refund that
     * is owed or still travelling sits in refund_pending; refunded means Razorpay reports it processed.
     */
    status: bookingStatus("status").notNull().default("created"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    /** Why a refund is owed: car_unavailable | booking_closed | dealer. */
    refundReason: text("refund_reason"),
    /** When the refund became owed. Set in the same statement that leaves paid, before Razorpay is called. */
    refundRequestedAt: timestamp("refund_requested_at", { withTimezone: true }),
    /** Razorpay's refund, once created. */
    refundId: text("refund_id"),
    /** Razorpay's own status for that refund: pending | processed | failed. Null while the refund is owed but not yet created. */
    refundStatus: text("refund_status"),
    /** The last reason a refund attempt did not complete. Short and free of secrets. */
    refundError: text("refund_error"),
  },
  (t) => [
    index("bookings_dealer_idx").on(t.dealerId),
    index("bookings_car_idx").on(t.carId),
    // The database's last word: one car can never have two paid bookings, whatever the application does.
    uniqueIndex("bookings_one_paid_per_car_uq").on(t.carId).where(sql`${t.status} = 'paid'`),
  ],
)

// Append-only (enforced by a trigger in the migration). The future valuation dataset.
// No cascade: a car with price history can be archived but never hard-deleted.
export const priceEvents = pgTable(
  "price_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carId: uuid("car_id").notNull().references(() => cars.id),
    event: priceEventType("event").notNull(),
    price: integer("price").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("price_events_car_idx").on(t.carId, t.at)],
)
