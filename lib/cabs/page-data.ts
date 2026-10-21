import { asc, desc, eq } from "drizzle-orm"

import type { BlockedRow, ClassOption, ClassRow, DocRow, DriverRow, DutyRow, VehicleRow } from "@/components/cabs/types"
import { tryDecrypt } from "@/lib/crypto"
import { blockedPeriods, driverDocuments, driverDutyLogs, drivers, vehicleClasses, vehicleDocuments, vehicles } from "@/lib/db/schema"
import type { ScopedDb } from "@/lib/db/scoped"
import { formatReg } from "@/lib/reg"

import { countExpiry, expiryStatus } from "./expiry"
import { DRIVER_DOC_LABEL, VEHICLE_DOC_LABEL } from "./schemas"

import type { ChargeRow } from "@/components/cabs/pricing"
import type { PackageRow } from "@/components/cabs/packages"
import type { SettingsValues } from "@/components/cabs/settings-form"
import type { CalcData } from "./calculator"
import type { FareSettings } from "./fare"
import { bpsToPercentText } from "./money"
import type { StoredRateCard } from "./rate-cards"
import { findState } from "./states"
import { cabSettings, packages, rateCards, rateSurcharges } from "@/lib/db/schema"

// Loads what the operator's screens show, already shaped for the browser. Personal values (registration, phone, licence) are
// decrypted here, on the server, for the signed-in operator only.

type Db = ReturnType<typeof import("@/lib/db/scoped").scopedDb>

export async function loadClasses(db: Db): Promise<ClassRow[]> {
  const [classes, all] = await Promise.all([db.vehicleClasses.select(undefined, { orderBy: [asc(vehicleClasses.sortOrder), asc(vehicleClasses.name)] }), db.vehicles.select()])
  const used = new Map<string, number>()
  for (const v of all) used.set(v.classId, (used.get(v.classId) ?? 0) + 1)
  return classes.map((c) => ({ id: c.id, name: c.name, seats: c.seats, bags: c.bags, ac: c.ac, description: c.description, imageUrl: c.imageUrl ?? "", sortOrder: c.sortOrder, active: c.active, vehicles: used.get(c.id) ?? 0 }))
}

export const classOptions = (rows: ClassRow[]): ClassOption[] => rows.map((c) => ({ id: c.id, name: c.name }))

export async function loadVehicles(db: Db, now: Date): Promise<VehicleRow[]> {
  const [rows, classes, docs] = await Promise.all([db.vehicles.select(undefined, { orderBy: [desc(vehicles.createdAt)] }), db.vehicleClasses.select(), db.vehicleDocuments.select()])
  const className = new Map(classes.map((c) => [c.id, c.name]))
  const byVehicle = new Map<string, (string | null)[]>()
  for (const d of docs) byVehicle.set(d.vehicleId, [...(byVehicle.get(d.vehicleId) ?? []), d.validTill])
  return rows.map((v) => toVehicleRow(v, className.get(v.classId) ?? "—", byVehicle.get(v.id) ?? [], now))
}

export function toVehicleRow(v: typeof vehicles.$inferSelect, className: string, docDates: (string | null)[], now: Date): VehicleRow {
  const reg = tryDecrypt(v.regEnc) ?? ""
  return {
    id: v.id,
    classId: v.classId,
    className,
    reg: formatReg(reg),
    makeModel: v.makeModel,
    year: v.year,
    colour: v.colour ?? "",
    fuel: v.fuel ?? "",
    ownership: v.ownership,
    odometerKm: v.odometerKm,
    status: v.status,
    docs: { ...countExpiry(docDates, now), total: docDates.length },
  }
}

export async function loadVehicleDetail(db: Db, id: string, now: Date) {
  const [row] = await db.vehicles.select(eq(vehicles.id, id), { limit: 1 })
  if (!row) return null
  const [cls, docs, blocked] = await Promise.all([
    db.vehicleClasses.select(eq(vehicleClasses.id, row.classId), { limit: 1 }),
    db.vehicleDocuments.select(eq(vehicleDocuments.vehicleId, id), { orderBy: [asc(vehicleDocuments.type)] }),
    db.blockedPeriods.select(eq(blockedPeriods.resourceId, id), { orderBy: [desc(blockedPeriods.startsAt)] }),
  ])
  const docRows: DocRow[] = docs.map((d) => ({ id: d.id, type: d.type, typeLabel: VEHICLE_DOC_LABEL[d.type], number: d.number ?? "", validFrom: d.validFrom, validTill: d.validTill, fileKey: d.fileKey, status: expiryStatus(d.validTill, now) }))
  return {
    vehicle: toVehicleRow(row, cls[0]?.name ?? "—", docs.map((d) => d.validTill), now),
    docs: docRows,
    blocked: toBlocked(blocked.filter((b) => b.resourceType === "vehicle")),
  }
}

const toBlocked = (rows: (typeof blockedPeriods.$inferSelect)[]): BlockedRow[] => rows.map((b) => ({ id: b.id, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), reason: b.reason }))

export function toDriverRow(d: typeof drivers.$inferSelect, docDates: (string | null)[], now: Date): DriverRow {
  return {
    id: d.id,
    name: d.name,
    phone: (tryDecrypt(d.phoneEnc) ?? "").replace(/^\+91/, ""),
    licenceNo: tryDecrypt(d.licenceEnc) ?? "",
    licenceValidTill: d.licenceValidTill,
    licenceStatus: expiryStatus(d.licenceValidTill, now),
    badgeNo: d.badgeNo ?? "",
    employment: d.employment,
    languages: d.languages,
    status: d.status,
    docs: { ...countExpiry(docDates, now), total: docDates.length },
  }
}

export async function loadDrivers(db: Db, now: Date): Promise<DriverRow[]> {
  const [rows, docs] = await Promise.all([db.drivers.select(undefined, { orderBy: [asc(drivers.name)] }), db.driverDocuments.select()])
  const byDriver = new Map<string, (string | null)[]>()
  for (const d of docs) byDriver.set(d.driverId, [...(byDriver.get(d.driverId) ?? []), d.validTill])
  return rows.map((d) => toDriverRow(d, byDriver.get(d.id) ?? [], now))
}

export async function loadDriverDetail(db: Db, id: string, now: Date) {
  const [row] = await db.drivers.select(eq(drivers.id, id), { limit: 1 })
  if (!row) return null
  const [docs, duty, blocked] = await Promise.all([
    db.driverDocuments.select(eq(driverDocuments.driverId, id), { orderBy: [asc(driverDocuments.type)] }),
    db.driverDutyLogs.select(eq(driverDutyLogs.driverId, id), { orderBy: [desc(driverDutyLogs.startedAt)], limit: 30 }),
    db.blockedPeriods.select(eq(blockedPeriods.resourceId, id), { orderBy: [desc(blockedPeriods.startsAt)] }),
  ])
  const docRows: DocRow[] = docs.map((d) => ({ id: d.id, type: d.type, typeLabel: DRIVER_DOC_LABEL[d.type], number: d.number ?? "", validFrom: null, validTill: d.validTill, fileKey: d.fileKey, status: expiryStatus(d.validTill, now) }))
  const dutyRows: DutyRow[] = duty.map((l) => ({ id: l.id, startedAt: l.startedAt.toISOString(), endedAt: l.endedAt ? l.endedAt.toISOString() : null }))
  return {
    driver: toDriverRow(row, [...docs.map((d) => d.validTill)], now),
    docs: docRows,
    duty: dutyRows,
    blocked: toBlocked(blocked.filter((b) => b.resourceType === "driver")),
  }
}

export type { ScopedDb }

// ---------- pricing ----------

export async function loadPricing(db: Db) {
  const [cards, charges, pkgs, settingsRows] = await Promise.all([
    db.rateCards.select(undefined, { orderBy: [asc(rateCards.tripType), asc(rateCards.createdAt)] }),
    db.rateSurcharges.select(undefined, { orderBy: [asc(rateSurcharges.kind), asc(rateSurcharges.createdAt)] }),
    db.packages.select(undefined, { orderBy: [asc(packages.name)] }),
    db.cabSettings.select(eq(cabSettings.dealerId, db.dealerId), { limit: 1 }),
  ])
  const settingsRow = settingsRows[0]
  const storedCards: StoredRateCard[] = cards.map((r) => ({
    id: r.id,
    vehicleClassId: r.vehicleClassId,
    tripType: r.tripType,
    basePaise: r.basePaise,
    perKmPaise: r.perKmPaise,
    minKmPerDay: r.minKmPerDay,
    perHourPaise: r.perHourPaise,
    packageHours: r.packageHours,
    packageKm: r.packageKm,
    extraKmPaise: r.extraKmPaise,
    extraHourPaise: r.extraHourPaise,
    bataPerDayPaise: r.bataPerDayPaise,
    validFrom: r.validFrom,
    validTo: r.validTo,
    active: r.active,
  }))
  const chargeRows: ChargeRow[] = charges.map((s) => ({ id: s.id, kind: s.kind, label: s.label, scope: s.scope, amountPaise: s.amountPaise, bps: s.bps, active: s.active }))
  const packageRows: PackageRow[] = pkgs.map((p) => ({ id: p.id, name: p.name, slug: p.slug, description: p.description, days: p.days, itinerary: p.itinerary, vehicleClassPrices: p.vehicleClassPrices, active: p.active }))
  const settings: FareSettings = {
    nightStart: settingsRow?.nightStart ?? null,
    nightEnd: settingsRow?.nightEnd ?? null,
    gstRateBps: settingsRow?.gstRateBps ?? null,
    stateCode: settingsRow?.stateCode ?? null,
    advanceBps: settingsRow?.advanceBps ?? null,
  }
  const calc: CalcData = {
    cards: storedCards,
    surcharges: chargeRows.filter((s) => s.active),
    packages: packageRows.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, vehicleClassPrices: p.vehicleClassPrices })),
    settings,
  }
  return { cards: storedCards, charges: chargeRows, packages: packageRows, settings, calc, settingsRow }
}

export function settingsToForm(row: typeof cabSettings.$inferSelect | undefined): SettingsValues {
  return {
    advancePercent: bpsToPercentText(row?.advanceBps),
    gstPercent: bpsToPercentText(row?.gstRateBps),
    stateCode: findState(row?.stateCode)?.code ?? "",
    gstin: row?.gstin ?? "",
    sacCode: row?.sacCode ?? "",
    invoicePrefix: row?.invoicePrefix ?? "",
    nightStart: row?.nightStart ?? "",
    nightEnd: row?.nightEnd ?? "",
    minLeadMinutes: String(row?.minLeadMinutes ?? 0),
    bufferMinutes: String(row?.bufferMinutes ?? 0),
    serviceCities: (row?.serviceCities ?? []).join(", "),
    tiers: (row?.cancellationPolicy ?? []).map((t) => ({ hoursBefore: String(t.hoursBefore), feePercent: bpsToPercentText(t.feeBps) })),
  }
}
