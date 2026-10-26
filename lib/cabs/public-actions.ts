"use server"

import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"

import { decrypt } from "@/lib/crypto"
import { tenantContext } from "@/lib/core/guards"
import { currentCustomer } from "@/lib/core/login/customer"
import { enqueue } from "@/lib/core/notifications/outbox"
import { validCoords } from "@/lib/core/geo/validate"
import { getPlacesProvider } from "@/lib/core/geo/places-provider"
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, type PlaceDetail, type PlaceSuggestion, isSessionToken } from "@/lib/core/geo/places"
import { rateLimit } from "@/lib/core/rate-limit"
import { meterUsage } from "@/lib/core/usage"
import { customerAddresses, customerContacts, customers, vehicleClasses } from "@/lib/db/schema"
import { scopedDb, scopedTransaction } from "@/lib/db/scoped"
import { billingState } from "@/lib/billing/state"
import { normalizePhone, phoneHash } from "@/lib/crypto/blind-index"
import { encrypt } from "@/lib/crypto"
import type { FareLine } from "./fare"
import { bookingMessage } from "./booking-copy"
import { isLang } from "./lang"
import { openPlace, sealPlace } from "./place-token"
import { quickPickByKey } from "./quick-picks"
import { parseIst } from "./calculator"
import { loadPricing } from "./page-data"
import { type ClassFit, type PlaceInput, type QuoteErrorCode, type TripRequest, checkTiming, quoteForClass, resolveDistance } from "./trip-quote"
import { cleanOperationKey, createTripOnce, findByOperationKey } from "./idempotency"
import { cancelTrip, createTrip, withBookingCodeRetry } from "./trips"

// What the public booking page may do. The business comes from the host, the customer from the session cookie, prices from the fare
// engine on the server. Nothing the browser sends is believed about price, distance, tax or who the customer is.

type Fail<C extends string = string> = { ok: false; code: C }

const PLACE_ID = /^(?:[A-Za-z0-9_-]{3,200}|osm:-?\d{1,3}(?:\.\d+)?,-?\d{1,3}(?:\.\d+)?)$/
const sealed = z.string().min(20).max(2500)

const draftSchema = z.object({
  tripType: z.enum(["airport", "outstation_one_way", "outstation_round", "local_hourly", "package_tour"]),
  pickup: sealed,
  drop: sealed.nullable().optional(),
  startAt: z.string().max(20),
  returnAt: z.string().max(20).nullable().optional(),
  pax: z.number().int().min(1).max(60),
  bags: z.number().int().min(0).max(60),
  localPackage: z.object({ hours: z.number().int().min(1).max(24), km: z.number().int().min(1).max(1000) }).nullable().optional(),
  packageId: z.string().uuid().nullable().optional(),
})
export type Draft = z.infer<typeof draftSchema>

async function who() {
  const ctx = await tenantContext("cabs")
  if (!ctx) return null
  return { ...ctx, db: scopedDb(ctx.dealer.id) }
}

const busy = { ok: false, code: "busy" } as const

// ---------- place search ----------

export async function searchPlacesPublic(query: string, sessionToken: string, origin?: { lat: number; lng: number } | null): Promise<{ ok: true; suggestions: PlaceSuggestion[] } | Fail<"unavailable" | "busy" | "bad_request">> {
  const w = await who()
  if (!w) return { ok: false, code: "unavailable" }
  const q = String(query ?? "").trim()
  if (!isSessionToken(sessionToken) || q.length > MAX_QUERY_LENGTH) return { ok: false, code: "bad_request" }
  if (q.length < MIN_QUERY_LENGTH) return { ok: true, suggestions: [] }
  const provider = getPlacesProvider()
  if (!provider) return { ok: false, code: "unavailable" }
  if (!(await rateLimit(`pub-places:${w.ip}`, 120, 10 * 60_000)) || !(await rateLimit(`pub-places-dealer:${w.dealer.id}`, 2_000, 60 * 60_000))) return busy
  if (!(await meterUsage({ dealerId: w.dealer.id, feature: "maps_places_request" })).allowed) return busy
  // The customer's position only ranks and measures the suggestions; anything that is not a real coordinate is ignored.
  const from = origin && validCoords(origin.lat, origin.lng) ? { lat: origin.lat, lng: origin.lng } : undefined
  return { ok: true, suggestions: await provider.autocomplete(q, sessionToken, from) }
}

export type SealedPlace = { token: string; name: string; address: string }

const toInput = (p: PlaceDetail): PlaceInput => ({ placeId: p.placeId, name: p.name, address: p.address, lat: p.lat, lng: p.lng, stateCode: p.stateCode })

export async function placeDetailsPublic(placeId: string, sessionToken: string): Promise<{ ok: true; place: SealedPlace } | Fail<"unavailable" | "busy" | "bad_request" | "not_found">> {
  const w = await who()
  if (!w) return { ok: false, code: "unavailable" }
  if (!isSessionToken(sessionToken) || !PLACE_ID.test(String(placeId))) return { ok: false, code: "bad_request" }
  const provider = getPlacesProvider()
  if (!provider) return { ok: false, code: "unavailable" }
  if (!(await rateLimit(`pub-place-details:${w.ip}`, 120, 10 * 60_000))) return busy
  if (!(await meterUsage({ dealerId: w.dealer.id, feature: "maps_places_request" })).allowed) return busy
  const detail = await provider.details(placeId, sessionToken)
  if (!detail) return { ok: false, code: "not_found" }
  const input = toInput(detail)
  return { ok: true, place: { token: await sealPlace(input), name: input.name, address: input.address } }
}

/** An airport or station from the quick list: looked up by name on the server, then sealed like any other place. */
export async function quickPickPublic(key: string): Promise<{ ok: true; place: SealedPlace } | Fail<"unavailable" | "busy" | "not_found">> {
  const w = await who()
  const pick = quickPickByKey(String(key))
  if (!w) return { ok: false, code: "unavailable" }
  if (!pick) return { ok: false, code: "not_found" }
  const provider = getPlacesProvider()
  if (!provider) return { ok: false, code: "unavailable" }
  if (!(await rateLimit(`pub-quick:${w.ip}`, 60, 10 * 60_000))) return busy
  const token = crypto.randomUUID()
  const first = (await provider.autocomplete(pick.query, token))[0]
  const detail = first ? await provider.details(first.placeId, token) : null
  if (!detail) return { ok: false, code: "not_found" }
  const input: PlaceInput = { ...toInput(detail), name: pick.en }
  return { ok: true, place: { token: await sealPlace(input), name: pick.en, address: input.address } }
}

// ---------- quotes ----------

export type FareOption = {
  classId: string
  name: string
  seats: number
  bags: number
  ac: boolean
  imageUrl: string | null
  description: string
  totalPaise: number
  advanceDuePaise: number
  lines: FareLine[]
  notices: string[]
  gstPaise: number
  taxablePaise: number
}

export type QuotesResult =
  | { ok: true; options: FareOption[]; distanceKm: number | null; durationMin: number | null; supportedClasses: number }
  | Fail<QuoteErrorCode | "unavailable" | "busy" | "bad_request" | "none_available">

type Prepared = { ok: true; w: NonNullable<Awaited<ReturnType<typeof who>>>; req: TripRequest; data: Awaited<ReturnType<typeof loadPricing>>["calc"]; classes: ClassFit[]; classRows: (typeof vehicleClasses.$inferSelect)[]; minLead: number; respondWindow: number; unpaidHold: number } | Fail<QuoteErrorCode | "unavailable" | "bad_request">

async function prepare(raw: unknown, now: Date): Promise<Prepared> {
  const w = await who()
  if (!w) return { ok: false, code: "unavailable" }
  if (!billingState(w.dealer).hasAccess) return { ok: false, code: "unavailable" }
  const parsed = draftSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, code: "bad_request" }
  const d = parsed.data
  const [pickup, drop] = await Promise.all([openPlace(d.pickup), d.drop ? openPlace(d.drop) : Promise.resolve(null)])
  const startAt = parseIst(d.startAt)
  const returnAt = d.returnAt ? parseIst(d.returnAt) : null
  if (!pickup || (d.drop && !drop) || !startAt || (d.returnAt && !returnAt)) return { ok: false, code: "bad_request" }

  const pricing = await loadPricing(w.db)
  const classRows = await w.db.vehicleClasses.select(eq(vehicleClasses.active, true), { orderBy: [asc(vehicleClasses.sortOrder), asc(vehicleClasses.name)] })
  const minLead = pricing.settingsRow?.minLeadMinutes ?? 0
  const req: TripRequest = { tripType: d.tripType, pickup, drop, startAt, returnAt, pax: d.pax, bags: d.bags, localPackage: d.localPackage ?? null, packageId: d.packageId ?? null }
  // A package id comes from the browser, so it must be one of THIS business's own packages, whatever the trip type. A foreign or
  // unknown id is refused the same way, so the answer reveals nothing about other businesses.
  if (req.packageId && !pricing.calc.packages.some((pk) => pk.id === req.packageId)) return { ok: false, code: "bad_request" }
  const timing = checkTiming(req, minLead, now)
  if (timing) return { ok: false, code: timing }
  return {
    ok: true,
    w,
    req,
    data: pricing.calc,
    classRows,
    classes: classRows.map((c) => ({ id: c.id, name: c.name, seats: c.seats, bags: c.bags, active: c.active })),
    minLead,
    respondWindow: pricing.settingsRow?.respondWindowMinutes ?? 30,
    unpaidHold: pricing.settingsRow?.unpaidHoldMinutes ?? 20,
  }
}

/** Live fares for every vehicle class that fits the party, from one distance lookup. */
export async function getQuotes(raw: unknown): Promise<QuotesResult> {
  const now = new Date()
  const p = await prepare(raw, now)
  if (!p.ok) return p
  if (!(await rateLimit(`pub-quotes:${p.w.ip}`, 60, 10 * 60_000)) || !(await rateLimit(`pub-quotes-dealer:${p.w.dealer.id}`, 1_500, 60 * 60_000))) return busy
  // One route lookup per quote request. Approximate: a distance served from the shared route cache is still counted, so this slightly
  // over-states real provider calls (an upper bound, which is the safe direction for a cost estimate).
  if (!(await meterUsage({ dealerId: p.w.dealer.id, feature: "maps_route_request" })).allowed) return busy
  const dist = await resolveDistance(p.req, getPlacesProvider())
  if (!dist.ok) return { ok: false, code: dist.code }

  const options: FareOption[] = []
  let firstFailure: QuoteErrorCode | null = null
  let supported = 0
  for (const row of p.classRows) {
    const q = quoteForClass({ id: row.id, name: row.name, seats: row.seats, bags: row.bags, active: row.active }, p.req, p.data, dist.route)
    if (!q.ok) {
      if (q.code !== "no_fit") firstFailure ??= q.code
      continue
    }
    supported++
    options.push({
      classId: row.id,
      name: row.name,
      seats: row.seats,
      bags: row.bags,
      ac: row.ac,
      imageUrl: row.imageUrl,
      description: row.description,
      totalPaise: q.result.totalPaise,
      advanceDuePaise: q.result.advanceDuePaise ?? 0,
      lines: q.result.lines,
      notices: q.result.notices,
      gstPaise: q.result.gst.cgstPaise + q.result.gst.sgstPaise + q.result.gst.igstPaise,
      taxablePaise: q.result.taxablePaise,
    })
  }
  if (options.length === 0) return { ok: false, code: firstFailure ?? "none_available" }
  return { ok: true, options, distanceKm: dist.route ? Math.round(dist.route.distanceM / 100) / 10 : null, durationMin: dist.route?.durationS ? Math.round(dist.route.durationS / 60) : null, supportedClasses: supported }
}

// ---------- booking ----------

export type RequestResult =
  | { ok: true; id: string; code: string }
  | Fail<QuoteErrorCode | "unavailable" | "bad_request" | "busy" | "signed_out" | "fare_changed" | "class_gone"> & { newTotalPaise?: number }

/** The customer asks for the booking. OTP login is required: no trip is ever created for an unverified phone. */
export async function requestBooking(raw: unknown, classId: string, expectedTotalPaise: number, notes: string, operationKey?: string): Promise<RequestResult> {
  const now = new Date()
  const p = await prepare(raw, now)
  if (!p.ok) return p
  const customer = await currentCustomer(p.w.dealer.id)
  if (!customer) return { ok: false, code: "signed_out" }
  // The same submission again (double tap, retry, second tab) gets the request it already made. Checked first, so a repeat costs no map
  // lookup and uses none of the customer's booking allowance.
  const opKey = cleanOperationKey(operationKey)
  if (opKey) {
    const existing = await findByOperationKey(p.w.db, customer.id, opKey, now)
    if (existing) return { ok: true, id: existing.id, code: existing.code }
  }
  if (!(await rateLimit(`pub-book:c:${customer.id}`, 10, 60 * 60_000)) || !(await rateLimit(`pub-book:ip:${p.w.ip}`, 30, 60 * 60_000))) return busy

  const cls = p.classes.find((c) => c.id === classId)
  if (!cls) return { ok: false, code: "class_gone" }
  const dist = await resolveDistance(p.req, getPlacesProvider())
  if (!dist.ok) return { ok: false, code: dist.code }
  const q = quoteForClass(cls, p.req, p.data, dist.route)
  if (!q.ok) return { ok: false, code: q.code }
  // What the customer was shown must be what they are booked at; if the operator changed prices meanwhile, show the new fare first.
  if (q.result.totalPaise !== expectedTotalPaise) return { ok: false, code: "fare_changed", newTotalPaise: q.result.totalPaise }

  const operatorPhone = p.w.dealer.phone
  const created = await createTripOnce(p.w.db, customer.id, opKey, now, () => withBookingCodeRetry(() => scopedTransaction(p.w.dealer.id, async (db) => {
    const trip = await createTrip(db, { customerId: customer.id, req: p.req, quote: q, source: "web", actor: { type: "customer", id: customer.id }, now, respondWindowMinutes: p.respondWindow, notes, idempotencyKey: opKey })
    if (operatorPhone) {
      await enqueue(db, { event: "trip.requested", recipientType: "operator", recipient: operatorPhone, channel: "wa_link", template: "trip_requested", payload: { tripId: trip.id, code: trip.code, text: bookingMessage("en", "operatorReminder", { code: trip.code }) } })
    }
    await enqueue(db, {
      event: "trip.requested",
      recipientType: "customer",
      recipientId: customer.id,
      recipient: decrypt(customer.phoneEnc),
      channel: "wa_link",
      template: "trip_requested_customer",
      payload: { tripId: trip.id, code: trip.code, text: bookingMessage(isLang(customer.language) ? customer.language : "en", "requestedToCustomer", { code: trip.code, operator: p.w.dealer.displayName }) },
    })
    return trip
  })))
  return { ok: true, id: created.id, code: created.code }
}

export async function cancelMyBooking(id: string, reason: string): Promise<{ ok: boolean; code?: "signed_out" | "illegal" | "changed" | "not_found" }> {
  const w = await who()
  if (!w) return { ok: false, code: "not_found" }
  const customer = await currentCustomer(w.dealer.id)
  if (!customer) return { ok: false, code: "signed_out" }
  if (!z.string().uuid().safeParse(id).success) return { ok: false, code: "not_found" }
  if (!(await rateLimit(`pub-cancel:${customer.id}`, 20, 60 * 60_000))) return { ok: false, code: "changed" }
  const r = await scopedTransaction(w.dealer.id, (db) => cancelTrip(db, id, { type: "customer", id: customer.id }, reason.trim() || "Cancelled by customer", customer.id))
  return r.ok ? { ok: true } : { ok: false, code: r.reason }
}

// ---------- account ----------

export async function updateProfile(input: { name: string; language: string }): Promise<{ ok: boolean }> {
  const w = await who()
  if (!w) return { ok: false }
  const c = await currentCustomer(w.dealer.id)
  if (!c) return { ok: false }
  const parsed = z.object({ name: z.string().trim().max(80), language: z.enum(["en", "ta"]) }).safeParse(input)
  if (!parsed.success) return { ok: false }
  await w.db.customers.update({ name: parsed.data.name || null, language: parsed.data.language }, eq(customers.id, c.id))
  return { ok: true }
}

export async function saveAddress(input: { label: string; place: string }): Promise<{ ok: boolean }> {
  const w = await who()
  const c = w ? await currentCustomer(w.dealer.id) : null
  if (!w || !c) return { ok: false }
  const parsed = z.object({ label: z.string().trim().min(1).max(40), place: sealed }).safeParse(input)
  const place = parsed.success ? await openPlace(parsed.data.place) : null
  if (!parsed.success || !place) return { ok: false }
  if ((await w.db.customerAddresses.count(eq(customerAddresses.customerId, c.id))) >= 10) return { ok: false }
  await w.db.customerAddresses.insert({ customerId: c.id, label: parsed.data.label, addressEnc: encrypt(JSON.stringify({ name: place.name, address: place.address, stateCode: place.stateCode })), lat: place.lat, lng: place.lng, placeId: place.placeId })
  return { ok: true }
}

export async function deleteAddress(id: string): Promise<{ ok: boolean }> {
  const w = await who()
  const c = w ? await currentCustomer(w.dealer.id) : null
  if (!w || !c || !z.string().uuid().safeParse(id).success) return { ok: false }
  await w.db.customerAddresses.delete(and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, c.id)) as never)
  return { ok: true }
}

export async function saveContact(input: { name: string; phone: string }): Promise<{ ok: boolean; error?: "phone" | "limit" }> {
  const w = await who()
  const c = w ? await currentCustomer(w.dealer.id) : null
  if (!w || !c) return { ok: false }
  const parsed = z.object({ name: z.string().trim().min(1).max(60), phone: z.string().max(20) }).safeParse(input)
  const phone = parsed.success ? normalizePhone(parsed.data.phone) : null
  if (!parsed.success || !phone) return { ok: false, error: "phone" }
  if ((await w.db.customerContacts.count(eq(customerContacts.customerId, c.id))) >= 5) return { ok: false, error: "limit" }
  try {
    await w.db.customerContacts.insert({ customerId: c.id, name: parsed.data.name, phoneEnc: encrypt(phone), phoneHash: phoneHash(phone) })
  } catch {
    return { ok: false, error: "phone" } // the same number twice
  }
  return { ok: true }
}

export async function deleteContact(id: string): Promise<{ ok: boolean }> {
  const w = await who()
  const c = w ? await currentCustomer(w.dealer.id) : null
  if (!w || !c || !z.string().uuid().safeParse(id).success) return { ok: false }
  await w.db.customerContacts.delete(and(eq(customerContacts.id, id), eq(customerContacts.customerId, c.id)) as never)
  return { ok: true }
}
