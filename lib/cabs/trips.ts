import { and, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm"

import { decrypt, encrypt } from "../crypto"
import { phoneHash } from "../crypto/blind-index"
import { audit } from "../core/audit"
import { enqueue } from "../core/notifications/outbox"
import { customers, type TripPlace, trips } from "../db/schema"
import type { ScopedDb } from "../db/scoped"
import { newBookingCode, newShareToken } from "./booking-code"
import { bookingMessage } from "./booking-copy"
import { paymentHoldExpiry, requestHold } from "./holds"
import { isUniqueViolation } from "./pg"
import { snapshotOf, type PlaceInput, type TripQuote, type TripRequest } from "./trip-quote"
import { type TripStatus, tripGraph } from "./trip-status"

type Trip = typeof trips.$inferSelect
export type Actor = { type: "customer" | "operator" | "system"; id: string | null }

export const toPlace = (p: PlaceInput): TripPlace => ({ placeId: p.placeId, addressEnc: encrypt(JSON.stringify({ name: p.name, address: p.address })), lat: p.lat, lng: p.lng, stateCode: p.stateCode })

async function event(db: ScopedDb, tripId: string, e: { type: string; from?: TripStatus | null; to?: TripStatus | null; actor: Actor; data?: Record<string, unknown> }) {
  await db.tripEvents.insert({ tripId, type: e.type, fromStatus: e.from ?? null, toStatus: e.to ?? null, actorType: e.actor.type, actorId: e.actor.id, data: e.data ?? {} })
}

export type CreateTripInput = {
  customerId: string
  req: TripRequest
  quote: Extract<TripQuote, { ok: true }>
  source: "web" | "phone" | "walk_in"
  actor: Actor
  now: Date
  /** From cab_settings. */
  respondWindowMinutes: number
  /** Operator-made bookings are confirmed on the spot, since the operator has already agreed. */
  confirmNow?: boolean
  notes?: string
}

export type CreatedTrip = { id: string; code: string; status: TripStatus; shareToken: string }

/**
 * Writes a booking: the trip, its immutable quote, its first event, and (for a customer's request) the alert to the operator.
 * Call inside a transaction. The booking code is retried on the rare clash.
 */
export async function createTrip(db: ScopedDb, input: CreateTripInput): Promise<CreatedTrip> {
  const { req, quote: q, now } = input
  const share = await newShareToken()
  const confirmed = input.confirmNow === true
  const hold = confirmed ? null : requestHold({ now, startAt: req.startAt, maxMinutes: input.respondWindowMinutes })

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newBookingCode()
    try {
      const [row] = await db.trips
        .insert({
          code,
          customerId: input.customerId,
          tripType: req.tripType,
          status: confirmed ? "confirmed" : "requested",
          source: input.source,
          bookedByType: input.actor.type,
          bookedById: input.actor.id,
          pickup: toPlace(req.pickup),
          drop: req.drop ? toPlace(req.drop) : null,
          startAt: req.startAt,
          returnAt: req.returnAt,
          pax: req.pax,
          bags: req.bags,
          notesEnc: input.notes?.trim() ? encrypt(input.notes.trim().slice(0, 500)) : null,
          vehicleClassId: q.classId,
          packageId: req.packageId ?? null,
          quote: snapshotOf(q, now),
          quoteTotalPaise: q.result.totalPaise,
          advanceDuePaise: q.result.advanceDuePaise ?? 0,
          holdExpiresAt: hold?.expiresAt ?? null,
          holdAlertAt: hold?.alertAt ?? null,
          shareTokenHash: share.hash,
          confirmedAt: confirmed ? now : null,
        })
        .returning({ id: trips.id, code: trips.code, status: trips.status })
      await event(db, row.id, { type: "created", to: row.status, actor: input.actor, data: { source: input.source, totalPaise: q.result.totalPaise } })
      return { id: row.id, code: row.code, status: row.status, shareToken: share.token }
    } catch (e) {
      if (!isUniqueViolation(e) || attempt === 4) throw e
    }
  }
  throw new Error("unreachable")
}

export type MoveResult = { ok: true; trip: Trip } | { ok: false; reason: "not_found" | "changed" | "illegal" }

/** The trip, only if it belongs to this business (and, when given, this customer). */
export async function loadTrip(db: ScopedDb, id: string, customerId?: string): Promise<Trip | null> {
  const [row] = await db.trips.select(customerId ? and(eq(trips.id, id), eq(trips.customerId, customerId)) : eq(trips.id, id), { limit: 1 })
  return row ?? null
}

/**
 * Moves a trip to a new status if the graph allows it AND the trip is still in the status the caller saw. The update is
 * conditional on that status, so two people acting at once (operator accepts while the customer cancels, or the clock expires
 * it) cannot both win: the loser gets "changed".
 */
export async function moveTrip(db: ScopedDb, id: string, to: TripStatus, actor: Actor, opts: { expectFrom?: TripStatus; set?: Partial<typeof trips.$inferInsert>; type?: string; data?: Record<string, unknown>; customerId?: string } = {}): Promise<MoveResult> {
  const current = await loadTrip(db, id, opts.customerId)
  if (!current) return { ok: false, reason: "not_found" }
  const from = current.status
  if (opts.expectFrom && opts.expectFrom !== from) return { ok: false, reason: "changed" }
  if (!tripGraph.canMove(from, to)) return { ok: false, reason: "illegal" }
  const updated = await db.trips
    .update({ ...opts.set, status: to, updatedAt: new Date() }, and(eq(trips.id, id), eq(trips.status, from)) as never)
    .returning()
  if (updated.length !== 1) return { ok: false, reason: "changed" }
  await event(db, id, { type: opts.type ?? to, from, to, actor, data: opts.data })
  return { ok: true, trip: updated[0] }
}

type Settings = { unpaidHoldMinutes: number }

/** The operator accepts. If an advance is due, the customer's payment clock starts now; otherwise no deadline remains. */
export async function acceptTrip(db: ScopedDb, id: string, actor: Actor, settings: Settings, now: Date): Promise<MoveResult> {
  const current = await loadTrip(db, id)
  if (!current) return { ok: false, reason: "not_found" }
  const owesAdvance = current.advanceDuePaise > current.advancePaidPaise
  return moveTrip(db, id, "confirmed", actor, {
    expectFrom: "requested",
    type: "accepted",
    set: { confirmedAt: now, holdExpiresAt: owesAdvance ? paymentHoldExpiry(now, settings.unpaidHoldMinutes) : null, holdAlertAt: null },
  })
}

export const rejectTrip = (db: ScopedDb, id: string, actor: Actor, reason: string) =>
  moveTrip(db, id, "rejected", actor, { expectFrom: "requested", type: "rejected", set: { rejectReason: reason.slice(0, 300), holdExpiresAt: null, holdAlertAt: null }, data: { reason: reason.slice(0, 300) } })

/** The customer or the operator cancels. Cancellation fees arrive with payments; today there is none. */
export const cancelTrip = (db: ScopedDb, id: string, actor: Actor, reason: string, customerId?: string) =>
  moveTrip(db, id, "cancelled", actor, { customerId, type: "cancelled", set: { cancelledReason: reason.slice(0, 300), cancelledByType: actor.type, holdExpiresAt: null, holdAlertAt: null }, data: { reason: reason.slice(0, 300) } })

/**
 * The operator agrees a different price. The customer's quote is never edited; the agreed figure and the reason sit beside it,
 * the change is an event on the trip, and it is written to the audit log. Allowed only before a driver is assigned.
 */
export async function adjustQuote(db: ScopedDb, id: string, actor: Actor, newTotalPaise: number, reason: string, advanceBps: number | null): Promise<MoveResult> {
  const current = await loadTrip(db, id)
  if (!current) return { ok: false, reason: "not_found" }
  if (current.status !== "requested" && current.status !== "confirmed") return { ok: false, reason: "illegal" }
  const advance = advanceBps ? Math.min(newTotalPaise, Math.round((newTotalPaise * advanceBps) / 10_000 / 100) * 100) : 0
  const updated = await db.trips
    .update({ adjustedTotalPaise: newTotalPaise, adjustmentReason: reason.slice(0, 300), advanceDuePaise: advance, updatedAt: new Date() }, and(eq(trips.id, id), eq(trips.status, current.status)) as never)
    .returning()
  if (updated.length !== 1) return { ok: false, reason: "changed" }
  await event(db, id, { type: "quote_adjusted", actor, data: { fromPaise: current.adjustedTotalPaise ?? current.quoteTotalPaise, toPaise: newTotalPaise, reason: reason.slice(0, 300) } })
  await audit(db, { actorType: actor.type === "operator" ? "user" : actor.type, actorId: actor.id ?? "unknown", action: "fare.adjust", entity: "trip", entityId: id, diff: { fromPaise: current.adjustedTotalPaise ?? current.quoteTotalPaise, toPaise: newTotalPaise, reason: reason.slice(0, 300) } })
  return { ok: true, trip: updated[0] }
}

/** What the customer owes: the operator's agreed price if there is one, else the quote. */
export const effectiveTotalPaise = (t: Pick<Trip, "quoteTotalPaise" | "adjustedTotalPaise">) => t.adjustedTotalPaise ?? t.quoteTotalPaise

// ---------- customers ----------

/** The customer for this phone at this business, created on first sight. `verified` marks a phone proved by OTP. */
export async function upsertCustomer(db: ScopedDb, phoneE164: string, opts: { verified: boolean; language?: string; name?: string | null; now: Date }): Promise<{ id: string; sessionVersion: number; isNew: boolean }> {
  const hash = phoneHash(phoneE164)
  const find = async () => (await db.customers.select(eq(customers.phoneHash, hash), { limit: 1 }))[0]
  let row = await find()
  if (!row) {
    try {
      await db.customers.insert({ phoneEnc: encrypt(phoneE164), phoneHash: hash, name: opts.name?.trim() || null, language: opts.language === "ta" ? "ta" : "en", verifiedAt: opts.verified ? opts.now : null })
    } catch (e) {
      if (!isUniqueViolation(e)) throw e // two requests created the same customer at once: the other one won, read it
    }
    row = await find()
    if (!row) throw new Error("customer missing after insert")
    if (opts.verified) await db.customers.update({ lastLoginAt: opts.now }, eq(customers.id, row.id))
    return { id: row.id, sessionVersion: row.sessionVersion, isNew: true }
  }
  if (opts.verified) await db.customers.update({ verifiedAt: row.verifiedAt ?? opts.now, lastLoginAt: opts.now }, eq(customers.id, row.id))
  return { id: row.id, sessionVersion: row.sessionVersion, isNew: false }
}

// ---------- holds ----------

export type HoldSweep = { alerted: number; expired: number }

/**
 * Makes the world match the hold rules for one business. Safe to run again and again:
 *  - a request past half its window that has not been nudged gets one nudge (one event, one operator message);
 *  - a request past its deadline, or an accepted booking whose advance was not paid in time, expires.
 * Every change is a conditional update, so a trip the operator just answered is left alone.
 */
export async function sweepHolds(db: ScopedDb, now: Date, opts: { operatorPhone: string | null; operatorName: string }): Promise<HoldSweep> {
  let alerted = 0
  let expired = 0

  const toAlert = await db.trips.select(and(eq(trips.status, "requested"), isNull(trips.holdAlertedAt), isNotNull(trips.holdAlertAt), lte(trips.holdAlertAt, now)))
  for (const t of toAlert) {
    const claimed = await db.trips.update({ holdAlertedAt: now }, and(eq(trips.id, t.id), eq(trips.status, "requested"), isNull(trips.holdAlertedAt)) as never).returning({ id: trips.id })
    if (claimed.length !== 1) continue
    await event(db, t.id, { type: "hold_alert", actor: { type: "system", id: null }, data: { expiresAt: t.holdExpiresAt?.toISOString() ?? null } })
    if (opts.operatorPhone) {
      await enqueue(db, { event: "trip.hold_alert", recipientType: "operator", recipient: opts.operatorPhone, channel: "wa_link", template: "trip_hold_alert", payload: { tripId: t.id, code: t.code, text: bookingMessage("en", "operatorReminder", { code: t.code }) } })
    }
    alerted++
  }

  const due = await db.trips.select(and(inArray(trips.status, ["requested", "confirmed"]), isNotNull(trips.holdExpiresAt), lte(trips.holdExpiresAt, now)))
  for (const t of due) {
    const reason = t.status === "requested" ? "no_response" : "advance_unpaid"
    const res = await moveTrip(db, t.id, "expired", { type: "system", id: null }, { expectFrom: t.status, type: "expired", set: { holdExpiresAt: null, holdAlertAt: null }, data: { reason } })
    if (!res.ok) continue
    expired++
    const [c] = await db.customers.select(eq(customers.id, t.customerId), { limit: 1 })
    if (c) {
      await enqueue(db, {
        event: "trip.expired",
        recipientType: "customer",
        recipientId: c.id,
        recipient: decrypt(c.phoneEnc),
        channel: "wa_link",
        template: "trip_expired",
        payload: { tripId: t.id, code: t.code, reason, text: bookingMessage(c.language === "ta" ? "ta" : "en", reason === "no_response" ? "expiredNoResponse" : "expiredUnpaid", { code: t.code, operator: opts.operatorName }) },
      })
    }
  }
  return { alerted, expired }
}

