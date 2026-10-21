"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { billingState } from "@/lib/billing/state"
import { audit } from "@/lib/core/audit"
import { industrySession } from "@/lib/core/guards"
import { enqueue } from "@/lib/core/notifications/outbox"
import { getPlacesProvider } from "@/lib/core/geo/places-provider"
import { rateLimit } from "@/lib/core/rate-limit"
import { decrypt, tryDecrypt } from "@/lib/crypto"
import { normalizePhone } from "@/lib/crypto/blind-index"
import { customers } from "@/lib/db/schema"
import { scopedDb, scopedTransaction, type ScopedDb } from "@/lib/db/scoped"
import { type MessageKey, bookingMessage, bookingText } from "./booking-copy"
import { parseIst } from "./calculator"
import { isLang } from "./lang"
import { rupeesToPaise } from "./money"
import { loadPricing } from "./page-data"
import { type PlaceInput, type QuoteErrorCode, type TripRequest, quoteForClass, resolveDistance } from "./trip-quote"
import { type MoveResult, acceptTrip, adjustQuote, cancelTrip, createTrip, loadTrip, rejectTrip, upsertCustomer } from "./trips"

// What the operator can do with a booking. The business comes from the signed-in session; every booking id is checked to belong to
// it (the scoped database cannot see another business's rows at all); every change goes through the trip status graph.

type Fail = { ok: false; error: string }
type Ok<T extends object = object> = { ok: true } & T

const uuid = z.string().uuid()
const reasonText = z.string().trim().min(3, "Please give a short reason.").max(300)

async function open() {
  const s = await industrySession("cabs")
  if (!s) return { ok: false as const, fail: { ok: false, error: "Please sign in again." } satisfies Fail }
  if (!billingState(s.dealer).hasAccess) return { ok: false as const, fail: { ok: false, error: "Your trial has ended. Add a payment method to keep working." } satisfies Fail }
  if (!(await rateLimit(`cabs-bookings:${s.dealer.id}`, 240, 60_000))) return { ok: false as const, fail: { ok: false, error: "Too many changes. Try again in a minute." } satisfies Fail }
  return { ok: true as const, s, dealer: s.dealer, actor: { type: "operator" as const, id: s.dealer.id } }
}

const WHY: Record<Extract<MoveResult, { ok: false }>["reason"], string> = {
  not_found: "Booking not found.",
  changed: "This booking just changed (the customer cancelled, or it expired). Reload to see where it stands.",
  illegal: "That is not possible for a booking in this state.",
}

const refresh = (id?: string) => {
  revalidatePath("/cabs/bookings")
  if (id) revalidatePath(`/cabs/bookings/${id}`)
  revalidatePath("/dashboard")
}

async function tellCustomer(db: ScopedDb, trip: { id: string; code: string; customerId: string }, key: MessageKey, operator: string) {
  const [c] = await db.customers.select(eq(customers.id, trip.customerId), { limit: 1 })
  if (!c) return
  await enqueue(db, {
    event: `trip.${key}`,
    recipientType: "customer",
    recipientId: c.id,
    recipient: decrypt(c.phoneEnc),
    channel: "wa_link",
    template: `trip_${key}`,
    payload: { tripId: trip.id, code: trip.code, text: bookingMessage(isLang(c.language) ? c.language : "en", key, { code: trip.code, operator }) },
  })
}

export async function acceptBooking(id: string): Promise<Ok | Fail> {
  const c = await open()
  if (!c.ok) return c.fail
  if (!uuid.safeParse(id).success) return { ok: false, error: WHY.not_found }
  const db = scopedDb(c.dealer.id)
  const settings = (await db.cabSettings.select(undefined, { limit: 1 }))[0]
  const r = await scopedTransaction(c.dealer.id, async (tx) => {
    const moved = await acceptTrip(tx, id, c.actor, { unpaidHoldMinutes: settings?.unpaidHoldMinutes ?? 20 }, new Date())
    if (moved.ok) {
      await audit(tx, { actorType: "user", actorId: c.actor.id ?? "operator", action: "trip.accept", entity: "trip", entityId: id })
      await tellCustomer(tx, moved.trip, "acceptedToCustomer", c.dealer.displayName)
    }
    return moved
  })
  if (!r.ok) return { ok: false, error: WHY[r.reason] }
  refresh(id)
  return { ok: true }
}

export async function rejectBooking(id: string, reason: string): Promise<Ok | Fail> {
  const c = await open()
  if (!c.ok) return c.fail
  const why = reasonText.safeParse(reason)
  if (!why.success) return { ok: false, error: why.error.issues[0].message }
  if (!uuid.safeParse(id).success) return { ok: false, error: WHY.not_found }
  const r = await scopedTransaction(c.dealer.id, async (tx) => {
    const moved = await rejectTrip(tx, id, c.actor, why.data)
    if (moved.ok) {
      await audit(tx, { actorType: "user", actorId: c.actor.id ?? "operator", action: "trip.reject", entity: "trip", entityId: id, diff: { reason: why.data } })
      await tellCustomer(tx, moved.trip, "rejectedToCustomer", c.dealer.displayName)
    }
    return moved
  })
  if (!r.ok) return { ok: false, error: WHY[r.reason] }
  refresh(id)
  return { ok: true }
}

export async function adjustBookingFare(id: string, rupees: string, reason: string): Promise<Ok | Fail> {
  const c = await open()
  if (!c.ok) return c.fail
  const why = reasonText.safeParse(reason)
  if (!why.success) return { ok: false, error: why.error.issues[0].message }
  const paise = rupeesToPaise(rupees)
  if (paise === null || paise <= 0 || paise > 100_000_000) return { ok: false, error: "Enter the agreed fare in rupees, like 4500." }
  if (!uuid.safeParse(id).success) return { ok: false, error: WHY.not_found }
  const db = scopedDb(c.dealer.id)
  const settings = (await db.cabSettings.select(undefined, { limit: 1 }))[0]
  const r = await scopedTransaction(c.dealer.id, (tx) => adjustQuote(tx, id, c.actor, paise, why.data, settings?.advanceBps ?? null))
  if (!r.ok) return { ok: false, error: WHY[r.reason] }
  refresh(id)
  return { ok: true }
}

export async function cancelBookingAsOperator(id: string, reason: string): Promise<Ok | Fail> {
  const c = await open()
  if (!c.ok) return c.fail
  const why = reasonText.safeParse(reason)
  if (!why.success) return { ok: false, error: why.error.issues[0].message }
  if (!uuid.safeParse(id).success) return { ok: false, error: WHY.not_found }
  const r = await scopedTransaction(c.dealer.id, async (tx) => {
    const moved = await cancelTrip(tx, id, c.actor, why.data)
    if (moved.ok) await audit(tx, { actorType: "user", actorId: c.actor.id ?? "operator", action: "trip.cancel", entity: "trip", entityId: id, diff: { reason: why.data } })
    return moved
  })
  if (!r.ok) return { ok: false, error: WHY[r.reason] }
  refresh(id)
  return { ok: true }
}

// ---------- manual bookings (phone and walk-in) ----------

const place = z.object({ placeId: z.string().max(200).nullable(), name: z.string().trim().min(1).max(200), address: z.string().trim().max(400), lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable(), stateCode: z.string().max(2).nullable() })

const manualSchema = z.object({
  source: z.enum(["phone", "walk_in"]),
  phone: z.string().max(20),
  name: z.string().trim().max(80).optional().default(""),
  tripType: z.enum(["airport", "outstation_one_way", "outstation_round", "local_hourly", "package_tour"]),
  pickup: place,
  drop: place.nullable().optional(),
  startAt: z.string().max(20),
  returnAt: z.string().max(20).nullable().optional(),
  pax: z.number().int().min(1).max(60),
  bags: z.number().int().min(0).max(60),
  classId: uuid,
  localPackage: z.object({ hours: z.number().int().min(1).max(24), km: z.number().int().min(1).max(1000) }).nullable().optional(),
  packageId: uuid.nullable().optional(),
  /** One way, in km, typed by the operator when no map service answers. */
  manualDistanceKm: z.string().max(8).optional().default(""),
  notes: z.string().max(500).optional().default(""),
})

const english = bookingText("en")
const codeText = (code: QuoteErrorCode | "none", operator: string, detail?: string) => (detail && code === "no_price" ? detail : (english[`err_${code}` as keyof typeof english] ?? english.err_generic).replace("{operator}", operator))

async function prepareManual(input: unknown, now: Date) {
  const c = await open()
  if (!c.ok) return { ok: false as const, fail: c.fail }
  const parsed = manualSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, fail: { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." } satisfies Fail }
  const d = parsed.data
  const phone = normalizePhone(d.phone)
  if (!phone) return { ok: false as const, fail: { ok: false, error: "Enter a valid 10-digit mobile number." } satisfies Fail }
  const startAt = parseIst(d.startAt)
  const returnAt = d.returnAt ? parseIst(d.returnAt) : null
  if (!startAt || (d.returnAt && !returnAt)) return { ok: false as const, fail: { ok: false, error: "Enter the pickup date and time." } satisfies Fail }
  if (startAt.getTime() < now.getTime() - 60 * 60_000) return { ok: false as const, fail: { ok: false, error: "The pickup time is in the past." } satisfies Fail }
  if (d.tripType === "outstation_round" && (!returnAt || returnAt <= startAt)) return { ok: false as const, fail: { ok: false, error: "The return must be after the pickup." } satisfies Fail }
  const manualKm = d.manualDistanceKm.trim() === "" ? null : Number(d.manualDistanceKm)
  if (manualKm !== null && (!Number.isFinite(manualKm) || manualKm <= 0 || manualKm > 5000)) return { ok: false as const, fail: { ok: false, error: "Enter the distance in km, like 120." } satisfies Fail }

  const db = scopedDb(c.dealer.id)
  const [pricing, classRows] = await Promise.all([loadPricing(db), db.vehicleClasses.select()])
  const cls = classRows.find((k) => k.id === d.classId)
  if (!cls) return { ok: false as const, fail: { ok: false, error: "Choose a vehicle class." } satisfies Fail }
  const req: TripRequest = {
    tripType: d.tripType,
    pickup: d.pickup as PlaceInput,
    drop: (d.drop ?? null) as PlaceInput | null,
    startAt,
    returnAt,
    pax: d.pax,
    bags: d.bags,
    localPackage: d.localPackage ?? null,
    packageId: d.packageId ?? null,
    manualDistanceKm: manualKm,
  }
  const dist = await resolveDistance(req, getPlacesProvider())
  if (!dist.ok) return { ok: false as const, fail: { ok: false, error: dist.code === "no_map_service" || dist.code === "no_route" ? `${codeText(dist.code, c.dealer.displayName)} You can type the distance yourself.` : codeText(dist.code, c.dealer.displayName) } satisfies Fail }
  const q = quoteForClass({ id: cls.id, name: cls.name, seats: cls.seats, bags: cls.bags, active: true }, req, pricing.calc, dist.route)
  if (!q.ok) return { ok: false as const, fail: { ok: false, error: codeText(q.code, c.dealer.displayName, q.detail) } satisfies Fail }
  return { ok: true as const, c, db, d, phone, req, q, settings: pricing.settingsRow, distanceKm: dist.route ? Math.round(dist.route.distanceM / 100) / 10 : null }
}

export async function previewManualFare(input: unknown): Promise<Ok<{ totalPaise: number; advanceDuePaise: number; lines: import("./fare").FareLine[]; notices: string[]; distanceKm: number | null }> | Fail> {
  const p = await prepareManual(input, new Date())
  if (!p.ok) return p.fail
  return { ok: true, totalPaise: p.q.result.totalPaise, advanceDuePaise: p.q.result.advanceDuePaise ?? 0, lines: p.q.result.lines, notices: p.q.result.notices, distanceKm: p.distanceKm }
}

/** A booking the operator takes by phone or at the counter. Priced by the same engine as the website, and confirmed on the spot. */
export async function createManualBooking(input: unknown): Promise<Ok<{ id: string; code: string }> | Fail> {
  const now = new Date()
  const p = await prepareManual(input, now)
  if (!p.ok) return p.fail
  const { c, d, phone, req, q } = p
  const created = await scopedTransaction(c.dealer.id, async (tx) => {
    const customer = await upsertCustomer(tx, phone, { verified: false, name: d.name || null, now })
    if (d.name) await tx.customers.update({ name: d.name }, eq(customers.id, customer.id))
    const trip = await createTrip(tx, { customerId: customer.id, req, quote: q, source: d.source, actor: c.actor, now, respondWindowMinutes: p.settings?.respondWindowMinutes ?? 30, confirmNow: true, notes: d.notes })
    await audit(tx, { actorType: "user", actorId: c.actor.id ?? "operator", action: "trip.manual_booking", entity: "trip", entityId: trip.id, diff: { source: d.source, totalPaise: q.result.totalPaise } })
    return trip
  })
  refresh(created.id)
  return { ok: true, id: created.id, code: created.code }
}

export async function bookingCustomerPhone(id: string): Promise<string> {
  const s = await industrySession("cabs")
  if (!s || !uuid.safeParse(id).success) return ""
  const db = scopedDb(s.dealer.id)
  const trip = await loadTrip(db, id)
  if (!trip) return ""
  const [cust] = await db.customers.select(eq(customers.id, trip.customerId), { limit: 1 })
  return cust ? (tryDecrypt(cust.phoneEnc) ?? "") : ""
}
