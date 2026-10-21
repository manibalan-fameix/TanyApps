import { and, asc, desc, eq } from "drizzle-orm"

import { decrypt, tryDecrypt } from "../crypto"
import { customers, packages, rateCards, tripEvents, trips, vehicleClasses } from "../db/schema"
import type { TripPlace } from "../db/schema"
import type { ScopedDb } from "../db/scoped"
import type { FareLine } from "./fare"
import { istDateString } from "./time"
import { inForce } from "./rate-cards"
import { sealPlace } from "./place-token"
import type { PlaceInput } from "./trip-quote"

type Trip = typeof trips.$inferSelect

/** A stored place as text: the name and address were encrypted together. */
export function placeText(p: TripPlace | null | undefined): { name: string; address: string } {
  const raw = p ? tryDecrypt(p.addressEnc) : null
  if (!raw) return { name: "", address: "" }
  try {
    const j = JSON.parse(raw) as { name?: string; address?: string }
    return { name: j.name ?? "", address: j.address ?? "" }
  } catch {
    return { name: raw, address: "" }
  }
}

export type TripView = {
  id: string
  code: string
  status: Trip["status"]
  tripType: Trip["tripType"]
  source: Trip["source"]
  startAt: string
  returnAt: string | null
  pickup: string
  drop: string
  pax: number
  bags: number
  className: string
  quoteTotalPaise: number
  adjustedTotalPaise: number | null
  adjustmentReason: string | null
  advanceDuePaise: number
  holdExpiresAt: string | null
  notes: string
  rejectReason: string | null
  cancelledReason: string | null
  createdAt: string
  customerId: string
}

export function toTripView(t: Trip, className: string): TripView {
  return {
    id: t.id,
    code: t.code,
    status: t.status,
    tripType: t.tripType,
    source: t.source,
    startAt: t.startAt.toISOString(),
    returnAt: t.returnAt?.toISOString() ?? null,
    pickup: placeText(t.pickup).name,
    drop: placeText(t.drop).name,
    pax: t.pax,
    bags: t.bags,
    className,
    quoteTotalPaise: t.quoteTotalPaise,
    adjustedTotalPaise: t.adjustedTotalPaise,
    adjustmentReason: t.adjustmentReason,
    advanceDuePaise: t.advanceDuePaise,
    holdExpiresAt: t.holdExpiresAt?.toISOString() ?? null,
    notes: (t.notesEnc && tryDecrypt(t.notesEnc)) || "",
    rejectReason: t.rejectReason,
    cancelledReason: t.cancelledReason,
    createdAt: t.createdAt.toISOString(),
    customerId: t.customerId,
  }
}

const classNames = async (db: ScopedDb) => new Map((await db.vehicleClasses.select()).map((c) => [c.id, c.name]))

export async function loadCustomerTrips(db: ScopedDb, customerId: string): Promise<TripView[]> {
  const [rows, names] = await Promise.all([db.trips.select(eq(trips.customerId, customerId), { orderBy: [desc(trips.createdAt)], limit: 100 }), classNames(db)])
  return rows.map((t) => toTripView(t, names.get(t.vehicleClassId) ?? ""))
}

export type TimelineEvent = { id: string; type: string; at: string; actorType: string; data: Record<string, unknown> }

export type StoredFare = { lines: FareLine[]; notices: string[] }

export async function loadTripDetail(db: ScopedDb, id: string, customerId?: string): Promise<{ trip: TripView; events: TimelineEvent[]; fare: StoredFare } | null> {
  const [row] = await db.trips.select(customerId ? and(eq(trips.id, id), eq(trips.customerId, customerId)) : eq(trips.id, id), { limit: 1 })
  if (!row) return null
  const [events, names] = await Promise.all([db.tripEvents.select(eq(tripEvents.tripId, id), { orderBy: [asc(tripEvents.at)] }), classNames(db)])
  return {
    trip: toTripView(row, names.get(row.vehicleClassId) ?? ""),
    events: events.map((e) => ({ id: e.id, type: e.type, at: e.at.toISOString(), actorType: e.actorType, data: e.data })),
    // The lines exactly as quoted. The stored quote never changes, so this is what the customer agreed to.
    fare: { lines: ((row.quote.result as { lines?: FareLine[] }).lines ?? []), notices: ((row.quote.result as { notices?: string[] }).notices ?? []) },
  }
}

/** The pieces of the booking page that depend on what the operator has set up. */
export async function loadBookingOptions(db: ScopedDb, now: Date) {
  const today = istDateString(now)
  const [classes, cards, pkgs] = await Promise.all([
    db.vehicleClasses.select(eq(vehicleClasses.active, true)),
    db.rateCards.select(and(eq(rateCards.tripType, "local_hourly"), eq(rateCards.active, true))),
    db.packages.select(eq(packages.active, true), { orderBy: [asc(packages.name)] }),
  ])
  const activeClass = new Set(classes.map((c) => c.id))
  const seen = new Set<string>()
  const localPackages: { hours: number; km: number }[] = []
  for (const c of cards) {
    if (!activeClass.has(c.vehicleClassId) || !inForce(c, today) || !c.packageHours || !c.packageKm) continue
    const k = `${c.packageHours}:${c.packageKm}`
    if (seen.has(k)) continue
    seen.add(k)
    localPackages.push({ hours: c.packageHours, km: c.packageKm })
  }
  localPackages.sort((a, b) => a.hours - b.hours || a.km - b.km)
  return { localPackages, tours: pkgs.map((p) => ({ id: p.id, name: p.name, days: p.days })) }
}

/** Sealed places and counts from an earlier trip, to prefill "book again". Dates are left for the customer to choose. */
export async function repeatDraft(db: ScopedDb, tripId: string, customerId: string) {
  const [t] = await db.trips.select(and(eq(trips.id, tripId), eq(trips.customerId, customerId)), { limit: 1 })
  if (!t) return null
  const seal = async (p: TripPlace | null) => {
    if (!p) return null
    const { name, address } = placeText(p)
    const input: PlaceInput = { placeId: p.placeId, name, address, lat: p.lat, lng: p.lng, stateCode: p.stateCode }
    return { token: await sealPlace(input), name }
  }
  const input = (t.quote.input ?? {}) as { rateCard?: { packageHours?: number | null; packageKm?: number | null } | null }
  const local = t.tripType === "local_hourly" && input.rateCard?.packageHours && input.rateCard?.packageKm ? `${input.rateCard.packageHours}:${input.rateCard.packageKm}` : ""
  return { tripType: t.tripType as string, pickup: await seal(t.pickup), drop: await seal(t.drop), pax: t.pax, bags: t.bags, localPackage: local, packageId: t.packageId ?? "" }
}

export async function customerPhone(db: ScopedDb, customerId: string): Promise<string> {
  const [c] = await db.customers.select(eq(customers.id, customerId), { limit: 1 })
  return c ? decrypt(c.phoneEnc) : ""
}

