import { sql } from "drizzle-orm"
import { boolean, check, date, doublePrecision, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { dealers } from "./dealers.ts"

// TanyCabs tables. Every table here carries dealer_id and is registered in lib/db/tenant-tables.ts, except route_distances
// (a cross-tenant cache of public facts). Money is whole paise in integer columns (never rupees, never floats). Anything that
// identifies a person or a vehicle (phone, licence number, registration) is stored encrypted (`*_enc`, lib/crypto) with a keyed
// hash (`*_hash`, lib/crypto/blind-index) for lookups and uniqueness.

export const tripType = pgEnum("trip_type", ["airport", "outstation_one_way", "outstation_round", "local_hourly", "package_tour"])
export const vehicleStatus = pgEnum("vehicle_status", ["active", "maintenance", "inactive"])
export const vehicleOwnership = pgEnum("vehicle_ownership", ["own", "attached"])
export const vehicleFuel = pgEnum("vehicle_fuel", ["petrol", "diesel", "cng", "electric", "hybrid"])
export const vehicleDocType = pgEnum("vehicle_doc_type", ["rc", "insurance", "permit", "fc", "puc", "tax"])
export const driverEmployment = pgEnum("driver_employment", ["employee", "attached", "freelance"])
export const driverStatus = pgEnum("driver_status", ["available", "on_trip", "off", "inactive"])
export const driverDocType = pgEnum("driver_doc_type", ["licence", "badge", "id_proof", "police_verification", "medical"])
export const blockedResource = pgEnum("blocked_resource", ["vehicle", "driver"])
export const surchargeKind = pgEnum("surcharge_kind", ["night", "hill", "permit", "airport", "festival"])

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
const dealerId = () => uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" })

/** What a customer chooses: "Sedan", "SUV", "Tempo Traveller". The product, as opposed to a physical vehicle. */
export const vehicleClasses = pgTable(
  "vehicle_classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    name: text("name").notNull(),
    seats: integer("seats").notNull(),
    bags: integer("bags").notNull().default(0),
    ac: boolean("ac").notNull().default(true),
    description: text("description").notNull().default(""),
    /** A public photo (the class picture customers see), served from the media bucket. */
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique("vehicle_classes_dealer_name_uq").on(t.dealerId, t.name),
    check("vehicle_classes_seats_ck", sql`${t.seats} between 1 and 60`),
    check("vehicle_classes_bags_ck", sql`${t.bags} between 0 and 60`),
  ],
)

/** A physical vehicle the operator owns or has attached. */
export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    classId: uuid("class_id").notNull().references(() => vehicleClasses.id),
    /** AES-256-GCM (lib/crypto). */
    regEnc: text("reg_enc").notNull(),
    /** Keyed hash of the normalised registration number: unique per business, never shown. */
    regHash: text("reg_hash").notNull(),
    /** First letters of the registration (state and district), safe to show in lists like car plate prefixes. */
    regPrefix: text("reg_prefix").notNull().default(""),
    makeModel: text("make_model").notNull(),
    year: integer("year"),
    colour: text("colour"),
    fuel: vehicleFuel("fuel"),
    ownership: vehicleOwnership("ownership").notNull().default("own"),
    odometerKm: integer("odometer_km").notNull().default(0),
    status: vehicleStatus("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("vehicles_dealer_reg_uq").on(t.dealerId, t.regHash),
    index("vehicles_dealer_status_idx").on(t.dealerId, t.status),
    check("vehicles_odometer_ck", sql`${t.odometerKm} >= 0`),
  ],
)

/** RC, insurance, permit, fitness, pollution, tax. `file_key` points into the PRIVATE bucket: documents are never public. */
export const vehicleDocuments = pgTable(
  "vehicle_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
    type: vehicleDocType("type").notNull(),
    number: text("number"),
    validFrom: date("valid_from"),
    /** Null for a document that does not expire (an RC). */
    validTill: date("valid_till"),
    fileKey: text("file_key"),
    createdAt: createdAt(),
  },
  (t) => [index("vehicle_documents_vehicle_idx").on(t.vehicleId), index("vehicle_documents_expiry_idx").on(t.dealerId, t.validTill)],
)

/** A time a vehicle or driver cannot be given a trip: maintenance, leave. */
export const blockedPeriods = pgTable(
  "blocked_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    resourceType: blockedResource("resource_type").notNull(),
    /** The vehicle or driver id (checked by the server action, since it can point at either table). */
    resourceId: uuid("resource_id").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("blocked_periods_resource_idx").on(t.dealerId, t.resourceType, t.resourceId, t.startsAt), check("blocked_periods_range_ck", sql`${t.endsAt} > ${t.startsAt}`)],
)

export const drivers = pgTable(
  "drivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    name: text("name").notNull(),
    phoneEnc: text("phone_enc").notNull(),
    phoneHash: text("phone_hash").notNull(),
    licenceEnc: text("licence_enc"),
    licenceHash: text("licence_hash"),
    licenceValidTill: date("licence_valid_till"),
    badgeNo: text("badge_no"),
    employment: driverEmployment("employment").notNull().default("employee"),
    languages: jsonb("languages").$type<string[]>().notNull().default([]),
    status: driverStatus("status").notNull().default("available"),
    /** Set in a later phase when the driver signs in with their own phone (central OTP login). */
    userId: text("user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("drivers_dealer_phone_uq").on(t.dealerId, t.phoneHash),
    index("drivers_dealer_status_idx").on(t.dealerId, t.status),
  ],
)

export const driverDocuments = pgTable(
  "driver_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    driverId: uuid("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
    type: driverDocType("type").notNull(),
    number: text("number"),
    validTill: date("valid_till"),
    fileKey: text("file_key"),
    createdAt: createdAt(),
  },
  (t) => [index("driver_documents_driver_idx").on(t.driverId), index("driver_documents_expiry_idx").on(t.dealerId, t.validTill)],
)

/** Attendance: when a driver went on duty and off. An open row (no `ended_at`) is a driver currently on duty. */
export const driverDutyLogs = pgTable(
  "driver_duty_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    driverId: uuid("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("driver_duty_driver_idx").on(t.dealerId, t.driverId, t.startedAt)],
)

/**
 * One row of fare parameters for one vehicle class and trip type. Which columns matter depends on the trip type (see
 * lib/cabs/fare.ts); the rest stay null. An hourly package is its own row (package_hours, package_km). There are no default
 * values: a rate card holds exactly what the operator typed.
 */
export const rateCards = pgTable(
  "rate_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    vehicleClassId: uuid("vehicle_class_id").notNull().references(() => vehicleClasses.id, { onDelete: "cascade" }),
    tripType: tripType("trip_type").notNull(),
    /** A fixed starting amount (airport and local transfers). */
    basePaise: integer("base_paise"),
    perKmPaise: integer("per_km_paise"),
    /** Outstation: the least distance billed for each day of the trip. */
    minKmPerDay: integer("min_km_per_day"),
    perHourPaise: integer("per_hour_paise"),
    /** Hourly packages: what the package price covers, e.g. 8 hours and 80 km. */
    packageHours: integer("package_hours"),
    packageKm: integer("package_km"),
    extraKmPaise: integer("extra_km_paise"),
    extraHourPaise: integer("extra_hour_paise"),
    /** Driver allowance for each day of an outstation trip. */
    bataPerDayPaise: integer("bata_per_day_paise"),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("rate_cards_lookup_idx").on(t.dealerId, t.vehicleClassId, t.tripType),
    check(
      "rate_cards_money_ck",
      sql`coalesce(${t.basePaise},0) >= 0 and coalesce(${t.perKmPaise},0) >= 0 and coalesce(${t.perHourPaise},0) >= 0 and coalesce(${t.extraKmPaise},0) >= 0 and coalesce(${t.extraHourPaise},0) >= 0 and coalesce(${t.bataPerDayPaise},0) >= 0`,
    ),
    check("rate_cards_dates_ck", sql`${t.validFrom} is null or ${t.validTo} is null or ${t.validTo} >= ${t.validFrom}`),
  ],
)

export type SurchargeScope = {
  /** Two-letter state codes the surcharge applies to (permit: the state entered). Empty means any. */
  states?: string[]
  /** Free-text city or area names, matched case-insensitively against the trip's places. */
  places?: string[]
  /** Night surcharges only: "22:00" to "06:00". Falls back to the operator's night window. */
  window?: { start: string; end: string }
  /** Vehicle classes it applies to. Empty or missing means all. */
  vehicleClassIds?: string[]
  tripTypes?: (typeof tripType.enumValues)[number][]
  /** Festival surcharges: inclusive IST date ranges, "2026-11-08" to "2026-11-10". */
  dateRanges?: { from: string; to: string }[]
}

/** Extra charges: night, hill/ghat, state permit, airport entry, festival. Exactly one of a flat amount or a percentage. */
export const rateSurcharges = pgTable(
  "rate_surcharges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    kind: surchargeKind("kind").notNull(),
    label: text("label").notNull(),
    scope: jsonb("scope").$type<SurchargeScope>().notNull().default({}),
    amountPaise: integer("amount_paise"),
    /** Basis points of the fare before this surcharge: 500 is 5%. */
    bps: integer("bps"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("rate_surcharges_dealer_idx").on(t.dealerId, t.kind),
    check("rate_surcharges_one_of_ck", sql`(${t.amountPaise} is not null and ${t.bps} is null) or (${t.amountPaise} is null and ${t.bps} is not null)`),
    check("rate_surcharges_nonneg_ck", sql`coalesce(${t.amountPaise},0) >= 0 and coalesce(${t.bps},0) between 0 and 100000`),
  ],
)

export type PackageDay = { day: number; title: string; description: string }

/** A multi-day tour sold at a fixed price per vehicle class. */
export const packages = pgTable(
  "packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    days: integer("days").notNull(),
    itinerary: jsonb("itinerary").$type<PackageDay[]>().notNull().default([]),
    /** { [vehicleClassId]: price in paise }. */
    vehicleClassPrices: jsonb("vehicle_class_prices").$type<Record<string, number>>().notNull().default({}),
    imageUrls: jsonb("image_urls").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique("packages_dealer_slug_uq").on(t.dealerId, t.slug), check("packages_days_ck", sql`${t.days} between 1 and 60`)],
)

export type CancellationTier = { hoursBefore: number; feeBps: number }

/** One row per business: the rules that are the operator's to set. Nothing here has a default that changes a price. */
export const cabSettings = pgTable(
  "cab_settings",
  {
    dealerId: uuid("dealer_id").primaryKey().references(() => dealers.id, { onDelete: "cascade" }),
    /** Share of the fare taken as an advance, in basis points. Null until the operator decides. */
    advanceBps: integer("advance_bps"),
    /** Tiers like { hoursBefore: 24, feeBps: 0 }: the fee for cancelling at least that many hours before pickup. */
    cancellationPolicy: jsonb("cancellation_policy").$type<CancellationTier[]>().notNull().default([]),
    nightStart: text("night_start"),
    nightEnd: text("night_end"),
    /** GST on passenger transport, in basis points: 500 is 5%. Null until set. */
    gstRateBps: integer("gst_rate_bps"),
    sacCode: text("sac_code"),
    gstin: text("gstin"),
    /** Two-digit GST state code of the operator, which decides CGST+SGST versus IGST. */
    stateCode: text("state_code"),
    invoicePrefix: text("invoice_prefix"),
    minLeadMinutes: integer("min_lead_minutes").notNull().default(0),
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    serviceCities: jsonb("service_cities").$type<string[]>().notNull().default([]),
    /** How long a customer's request may wait for the operator, at most. The real window is shorter for a soon pickup (lib/cabs/holds.ts). */
    respondWindowMinutes: integer("respond_window_minutes").notNull().default(30),
    /** After the operator accepts a booking that needs an advance, how long the customer has to pay it. */
    unpaidHoldMinutes: integer("unpaid_hold_minutes").notNull().default(20),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("cab_settings_bps_ck", sql`coalesce(${t.advanceBps},0) between 0 and 10000 and coalesce(${t.gstRateBps},0) between 0 and 10000`),
    check("cab_settings_state_ck", sql`${t.stateCode} is null or ${t.stateCode} ~ '^[0-9]{2}$'`),
    check("cab_settings_holds_ck", sql`${t.respondWindowMinutes} between 10 and 240 and ${t.unpaidHoldMinutes} between 5 and 240`),
  ],
)

export const routeSource = pgEnum("route_source", ["google", "osrm", "manual"])

/**
 * Cache of road distances between two places. Shared across businesses (it holds public facts about places, nothing about
 * anyone), so it has no dealer_id and is listed in GLOBAL_TABLES. `fetched_at` drives expiry (see lib/core/geo/route-cache.ts).
 */
export const routeDistances = pgTable(
  "route_distances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    originPlaceId: text("origin_place_id").notNull(),
    destPlaceId: text("dest_place_id").notNull(),
    distanceM: integer("distance_m").notNull(),
    durationS: integer("duration_s").notNull(),
    /** Estimated tolls on the route in paise, when the provider reports them. Null means unknown, not free. */
    tollEstimatePaise: integer("toll_estimate_paise"),
    source: routeSource("source").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("route_distances_pair_uq").on(t.originPlaceId, t.destPlaceId, t.source), check("route_distances_pos_ck", sql`${t.distanceM} >= 0 and ${t.durationS} >= 0`)],
)


// ---------- customers and trips ----------

export const tripStatus = pgEnum("trip_status", [
  "requested", "confirmed", "assigned", "driver_en_route", "arrived", "in_trip", "completed", "closed", "rejected", "cancelled", "expired", "no_show",
])
export const tripSource = pgEnum("trip_source", ["web", "phone", "walk_in", "corporate"])
export const tripActorType = pgEnum("trip_actor_type", ["customer", "operator", "system", "driver"])

/**
 * A person who books with one business. The same phone number is a separate customer at each business (nothing is shared across
 * businesses). The phone is encrypted; `phone_hash` finds and de-duplicates it.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    /** E.164, AES-256-GCM. */
    phoneEnc: text("phone_enc").notNull(),
    phoneHash: text("phone_hash").notNull(),
    name: text("name"),
    emailEnc: text("email_enc"),
    /** When the phone was last proved by an OTP. Set at the first login: a customer row only exists for a verified phone, except walk-ins the operator types in. */
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    language: text("language").notNull().default("en"),
    /** Bumped to sign the customer out of every device at once. A session is valid only while its version matches. */
    sessionVersion: integer("session_version").notNull().default(1),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("customers_dealer_phone_uq").on(t.dealerId, t.phoneHash), check("customers_language_ck", sql`${t.language} in ('en','ta')`)],
)

/**
 * How a customer got in at one business besides their phone: a Google, Facebook or email sign-in that has already been tied to a
 * verified phone there. It makes the phone step a one-time thing at THAT business. The Firebase uid is stored only as a keyed hash,
 * and the row carries dealer_id, so the same Google account at another business is a different, unrelated identity.
 */
export const customerIdentities = pgTable(
  "customer_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    subjectHash: text("subject_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("customer_identities_dealer_subject_uq").on(t.dealerId, t.subjectHash), index("customer_identities_customer_idx").on(t.customerId), check("customer_identities_provider_ck", sql`${t.provider} in ('google.com','facebook.com','password')`)],
)

/** Saved places ("Home", "Office"). The address is encrypted. */
export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    addressEnc: text("address_enc").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    placeId: text("place_id"),
    createdAt: createdAt(),
  },
  (t) => [index("customer_addresses_customer_idx").on(t.dealerId, t.customerId)],
)

/** People to alert in an emergency (SOS, in a later phase). */
export const customerContacts = pgTable(
  "customer_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phoneEnc: text("phone_enc").notNull(),
    phoneHash: text("phone_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("customer_contacts_phone_uq").on(t.customerId, t.phoneHash)],
)

/** A place on a trip. The address is encrypted; the coordinates and place id are kept to price and dispatch. */
export type TripPlace = { placeId: string | null; addressEnc: string; lat: number | null; lng: number | null; stateCode: string | null }

/** Immutable once written: what the customer was shown and agreed to. Corrections go in the `adjusted_*` columns, never here. */
export type TripQuoteSnapshot = {
  version: 1
  at: string
  /** Everything the fare engine was given, and what it returned, so the number can be reproduced later. */
  input: Record<string, unknown>
  result: Record<string, unknown>
  /** Road distance and time as used for this quote. Kept here only, never in a shared cache. */
  distanceM: number
  durationS: number | null
  distanceSource: "google" | "osrm" | "manual" | null
}

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    /** Six characters for people to read out over the phone. Display only: it is not a secret and grants no access. */
    code: text("code").notNull(),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    tripType: tripType("trip_type").notNull(),
    status: tripStatus("status").notNull().default("requested"),
    source: tripSource("source").notNull().default("web"),
    /** Who made the booking: the customer, or the operator's team member who typed it in. */
    bookedByType: tripActorType("booked_by_type").notNull().default("customer"),
    bookedById: text("booked_by_id"),
    pickup: jsonb("pickup").$type<TripPlace>().notNull(),
    drop: jsonb("drop").$type<TripPlace | null>(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    returnAt: timestamp("return_at", { withTimezone: true }),
    pax: integer("pax").notNull(),
    bags: integer("bags").notNull().default(0),
    notesEnc: text("notes_enc"),
    vehicleClassId: uuid("vehicle_class_id").notNull().references(() => vehicleClasses.id),
    packageId: uuid("package_id").references(() => packages.id),
    quote: jsonb("quote").$type<TripQuoteSnapshot>().notNull(),
    quoteTotalPaise: integer("quote_total_paise").notNull(),
    advanceDuePaise: integer("advance_due_paise").notNull().default(0),
    advancePaidPaise: integer("advance_paid_paise").notNull().default(0),
    /** The operator's agreed price when it differs from the quote. The quote above never changes. */
    adjustedTotalPaise: integer("adjusted_total_paise"),
    adjustmentReason: text("adjustment_reason"),
    /** The deadline the booking is waiting on: for `requested`, the operator's answer; for an accepted booking with an unpaid advance, the customer's payment. */
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    /** When to nudge the operator (half-way through the window), and when it was done. */
    holdAlertAt: timestamp("hold_alert_at", { withTimezone: true }),
    holdAlertedAt: timestamp("hold_alerted_at", { withTimezone: true }),
    /** SHA-256 of a 128-bit random token for the tracking link. The token itself is never stored. */
    shareTokenHash: text("share_token_hash").notNull(),
    /**
     * A client-generated key for one submission of the booking form, so a double tap, a retry after a dropped connection or a second open
     * tab returns the request that already exists instead of creating a second one. Valid for 24 hours (see lib/cabs/idempotency.ts);
     * null for operator-made and older bookings.
     */
    idempotencyKey: text("idempotency_key"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    rejectReason: text("reject_reason"),
    cancelledReason: text("cancelled_reason"),
    cancelledByType: tripActorType("cancelled_by_type"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("trips_dealer_code_uq").on(t.dealerId, t.code),
    uniqueIndex("trips_share_token_uq").on(t.shareTokenHash),
    uniqueIndex("trips_customer_op_key_uq").on(t.dealerId, t.customerId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    index("trips_dealer_status_idx").on(t.dealerId, t.status, t.startAt),
    index("trips_customer_idx").on(t.dealerId, t.customerId, t.createdAt),
    index("trips_hold_idx").on(t.status, t.holdExpiresAt),
    // Finds requests whose half-way nudge is due, without reading every open request (the nudge is sent once, hence the filter).
    index("trips_hold_alert_idx").on(t.holdAlertAt).where(sql`${t.status} = 'requested' and ${t.holdAlertedAt} is null and ${t.holdAlertAt} is not null`),
    check("trips_code_ck", sql`${t.code} ~ '^[A-Z0-9]{6}$'`),
    check("trips_money_ck", sql`${t.quoteTotalPaise} >= 0 and ${t.advanceDuePaise} between 0 and ${t.quoteTotalPaise} and ${t.advancePaidPaise} >= 0 and coalesce(${t.adjustedTotalPaise},0) >= 0`),
    check("trips_pax_ck", sql`${t.pax} between 1 and 60 and ${t.bags} between 0 and 60`),
    check("trips_return_ck", sql`${t.returnAt} is null or ${t.returnAt} > ${t.startAt}`),
  ],
)

/** Every change to a trip, with who did it. Append-only. */
export const tripEvents = pgTable(
  "trip_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: dealerId(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    /** created, accepted, rejected, quote_adjusted, cancelled, expired, hold_alert, repeat_of ... */
    type: text("type").notNull(),
    fromStatus: tripStatus("from_status"),
    toStatus: tripStatus("to_status"),
    actorType: tripActorType("actor_type").notNull(),
    actorId: text("actor_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trip_events_trip_idx").on(t.dealerId, t.tripId, t.at)],
)
