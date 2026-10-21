"use server"

import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { billingState, effectivePlanKey } from "@/lib/billing/state"
import { blindIndex, phoneHash } from "@/lib/crypto/blind-index"
import { encrypt } from "@/lib/crypto"
import { blockedPeriods, cabSettings, driverDocuments, drivers, packages, rateCards, rateSurcharges, vehicleClasses, vehicleDocuments, vehicles } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { industrySession } from "@/lib/core/guards"
import { rateLimit } from "@/lib/core/rate-limit"
import { DOC_TYPES, MAX_DOC_BYTES, type DocType, isDocType, isOwnPrivateKey, privateKey, type PrivateKind } from "@/lib/media/documents"
import { imageKey, isOwnImage } from "@/lib/restaurant/images"
import { slugify, uniqueSlug } from "@/lib/slug"
import { getPrivateStorage, getStorage, privateStorageAvailable } from "@/lib/storage"
import { regPrefix } from "@/lib/reg"

import { checkHardLimit } from "./limits"
import { rupeesToPaise } from "./money"
import { isUniqueViolation } from "./pg"
import { findConflict, type StoredRateCard } from "./rate-cards"
import {
  blockedPeriodSchema,
  driverDocumentSchema,
  driverSchema,
  packageSchema,
  rateCardSchema,
  surchargeSchema,
  toSettingsRow,
  vehicleClassSchema,
  vehicleDocumentSchema,
  vehicleSchema,
} from "./schemas"

// Every write an operator can make in TanyCabs. The business always comes from the signed-in session, never from the request;
// every id the browser sends is checked to belong to that business before it is used; nothing here trusts a form.
//
// Who may do what (until roles arrive in Phase 5): any member of the business manages vehicles, drivers and documents; only the
// owner changes prices and settings.

export type Fail = { ok: false; error: string; fieldErrors?: Record<string, string>; upgrade?: boolean }
export type Ok<T extends object = object> = { ok: true } & T
type Res<T extends object = object> = Ok<T> | Fail

const uuid = z.string().uuid()
const signedOut: Fail = { ok: false, error: "Please sign in again." }
const ownerOnly: Fail = { ok: false, error: "Only the owner can change prices and settings." }
const trialOver: Fail = { ok: false, error: "Your trial has ended. Add a payment method to keep editing." }
const busy: Fail = { ok: false, error: "Too many changes. Try again in a minute." }
const missing = (what: string): Fail => ({ ok: false, error: `${what} not found.` })

async function open(opts: { owner?: boolean } = {}) {
  const s = await industrySession("cabs")
  if (!s) return { ok: false as const, fail: signedOut }
  if (opts.owner && !s.owner) return { ok: false as const, fail: ownerOnly }
  if (!billingState(s.dealer).hasAccess) return { ok: false as const, fail: trialOver }
  if (!(await rateLimit(`cabs-write:${s.dealer.id}`, 120, 60_000))) return { ok: false as const, fail: busy }
  return { ok: true as const, s, dealerId: s.dealer.id, db: scopedDb(s.dealer.id), plan: effectivePlanKey(s.dealer) }
}

function invalid(error: z.ZodError): Fail {
  const fieldErrors: Record<string, string> = {}
  for (const i of error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message
  return { ok: false, error: error.issues[0]?.message ?? "Check the details.", fieldErrors }
}

const refresh = (...paths: string[]) => {
  for (const p of paths) revalidatePath(p)
  revalidatePath("/dashboard")
}

async function removeFiles(keys: (string | null)[]) {
  const real = keys.filter((k): k is string => Boolean(k))
  if (real.length === 0) return
  try {
    const storage = getPrivateStorage()
    await Promise.all(real.map((k) => storage.remove(k).catch(() => {})))
  } catch {
    // Storage not reachable: the record is gone; an orphan file is harmless and unreachable.
  }
}

// ---------- uploads ----------

/** Where the browser should PUT a document, and the key to save on the record afterwards. */
export async function requestDocumentUpload(kind: PrivateKind, contentType: string, size: number): Promise<Res<{ url: string; method: "PUT"; headers: Record<string, string>; key: string }>> {
  const s = await industrySession("cabs")
  if (!s) return signedOut
  if (kind !== "vehicle-doc" && kind !== "driver-doc") return { ok: false, error: "Invalid upload." }
  if (!isDocType(contentType)) return { ok: false, error: `Upload a PDF or a photo (${DOC_TYPES.map((t) => t.split("/")[1].toUpperCase()).join(", ")}).` }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_DOC_BYTES) return { ok: false, error: `That file is too large. The limit is ${MAX_DOC_BYTES / 1024 / 1024} MB.` }
  if (!privateStorageAvailable()) return { ok: false, error: "Document storage is not set up yet." }
  if (!(await rateLimit(`cabs-doc-upload:${s.dealer.id}`, 60, 60 * 60_000))) return busy
  const key = privateKey(s.dealer.id, kind, crypto.randomUUID(), contentType as DocType)
  return { ok: true, url: `/api/upload/${key}`, method: "PUT", headers: { "Content-Type": contentType }, key }
}

/** Where the browser should PUT the picture of a vehicle class. It is a public photo, like a dish photo. */
export async function requestClassImageUpload(): Promise<Res<{ url: string; method: string; headers: Record<string, string>; publicUrl: string }>> {
  const s = await industrySession("cabs")
  if (!s) return signedOut
  if (!(await rateLimit(`cabs-image:${s.dealer.id}`, 60, 60 * 60_000))) return busy
  const storage = getStorage()
  const key = imageKey(s.dealer.id, "cab-class", crypto.randomUUID())
  const target = await storage.presignPut(key, "image/jpeg")
  return { ok: true, url: target.url, method: target.method, headers: target.headers, publicUrl: storage.publicUrl(key) }
}

/** A saved file key must be one this business uploaded, in the right folder, and must really be there. */
async function checkFile(dealerId: string, kind: PrivateKind, key: string | null): Promise<Fail | null> {
  if (!key) return null
  if (!isOwnPrivateKey(dealerId, kind, key)) return { ok: false, error: "Upload the file again.", fieldErrors: { fileKey: "Upload the file again." } }
  try {
    if (!(await getPrivateStorage().head(key))) return { ok: false, error: "That file did not finish uploading. Try again.", fieldErrors: { fileKey: "Upload the file again." } }
  } catch {
    return { ok: false, error: "We could not check the file. Try again.", fieldErrors: { fileKey: "Try again." } }
  }
  return null
}

// ---------- vehicle classes ----------

async function ownsClass(db: ReturnType<typeof scopedDb>, id: string) {
  return (await db.vehicleClasses.select(eq(vehicleClasses.id, id), { limit: 1 })).length === 1
}

export async function saveVehicleClass(id: string | null, input: unknown): Promise<Res<{ id: string }>> {
  const c = await open()
  if (!c.ok) return c.fail
  const parsed = vehicleClassSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const v = parsed.data
  if (!isOwnImage(getStorage(), c.dealerId, v.imageUrl)) return { ok: false, error: "Upload the picture again.", fieldErrors: { imageUrl: "Upload the picture again." } }
  const row = { name: v.name, seats: v.seats, bags: v.bags, ac: v.ac, description: v.description, imageUrl: v.imageUrl || null, sortOrder: v.sortOrder, active: v.active }
  try {
    if (id) {
      if (!uuid.safeParse(id).success || !(await ownsClass(c.db, id))) return missing("Vehicle class")
      await c.db.vehicleClasses.update(row, eq(vehicleClasses.id, id))
      refresh("/cabs/vehicle-classes", "/cabs/pricing")
      return { ok: true, id }
    }
    const [created] = await c.db.vehicleClasses.insert(row).returning({ id: vehicleClasses.id })
    refresh("/cabs/vehicle-classes", "/cabs/pricing")
    return { ok: true, id: created.id }
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "You already have a class with that name.", fieldErrors: { name: "You already have a class with that name." } }
    throw e
  }
}

export async function deleteVehicleClass(id: string): Promise<Res> {
  const c = await open()
  if (!c.ok) return c.fail
  if (!uuid.safeParse(id).success || !(await ownsClass(c.db, id))) return missing("Vehicle class")
  const [inVehicles, inRates, pkgs] = await Promise.all([
    c.db.vehicles.count(eq(vehicles.classId, id)),
    c.db.rateCards.count(eq(rateCards.vehicleClassId, id)),
    c.db.packages.select(),
  ])
  if (inVehicles > 0) return { ok: false, error: `${inVehicles} ${inVehicles === 1 ? "vehicle uses" : "vehicles use"} this class. Move them to another class first, or mark the class inactive.` }
  if (inRates > 0) return { ok: false, error: "This class has rate cards. Delete those first, or mark the class inactive." }
  if (pkgs.some((p) => id in p.vehicleClassPrices)) return { ok: false, error: "A package has a price for this class. Remove that first, or mark the class inactive." }
  await c.db.vehicleClasses.delete(eq(vehicleClasses.id, id))
  refresh("/cabs/vehicle-classes", "/cabs/pricing")
  return { ok: true }
}

// ---------- vehicles ----------

export async function saveVehicle(id: string | null, input: unknown): Promise<Res<{ id: string }>> {
  const c = await open()
  if (!c.ok) return c.fail
  const parsed = vehicleSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const v = parsed.data
  if (!(await ownsClass(c.db, v.classId))) return { ok: false, error: "Choose a vehicle class from your list.", fieldErrors: { classId: "Choose a class from your list." } }

  const row = {
    classId: v.classId,
    regEnc: encrypt(v.reg),
    regHash: blindIndex("vehicle_reg", v.reg),
    regPrefix: regPrefix(v.reg).toUpperCase(),
    makeModel: v.makeModel,
    year: v.year,
    colour: v.colour,
    fuel: v.fuel,
    ownership: v.ownership,
    odometerKm: v.odometerKm,
    status: v.status,
  }
  const duplicate: Fail = { ok: false, error: "You already have a vehicle with that registration number.", fieldErrors: { reg: "You already have this vehicle." } }

  try {
    if (id) {
      if (!uuid.safeParse(id).success || (await c.db.vehicles.count(eq(vehicles.id, id))) === 0) return missing("Vehicle")
      await c.db.vehicles.update(row, eq(vehicles.id, id))
      refresh("/cabs/vehicles", `/cabs/vehicles/${id}`)
      return { ok: true, id }
    }
    // A hard limit: past the plan's vehicles, adding is refused with an upgrade prompt.
    const limit = checkHardLimit("vehicles", await c.db.vehicles.count(), c.plan)
    if (!limit.ok) return { ok: false, error: limit.message, upgrade: true }
    const [created] = await c.db.vehicles.insert(row).returning({ id: vehicles.id })
    // Two adds at the same instant can both pass the check above; if that put the business over, the later one is undone.
    const after = checkHardLimit("vehicles", (await c.db.vehicles.count()) - 1, c.plan)
    if (!after.ok) {
      await c.db.vehicles.delete(eq(vehicles.id, created.id))
      return { ok: false, error: after.message, upgrade: true }
    }
    refresh("/cabs/vehicles")
    return { ok: true, id: created.id }
  } catch (e) {
    if (isUniqueViolation(e)) return duplicate
    throw e
  }
}

export async function setVehicleStatus(id: string, status: string): Promise<Res> {
  const c = await open()
  if (!c.ok) return c.fail
  const parsed = z.enum(["active", "maintenance", "inactive"]).safeParse(status)
  if (!parsed.success || !uuid.safeParse(id).success) return { ok: false, error: "Invalid request." }
  if ((await c.db.vehicles.count(eq(vehicles.id, id))) === 0) return missing("Vehicle")
  await c.db.vehicles.update({ status: parsed.data }, eq(vehicles.id, id))
  refresh("/cabs/vehicles", `/cabs/vehicles/${id}`)
  return { ok: true }
}

export async function deleteVehicle(id: string): Promise<Res> {
  const c = await open()
  if (!c.ok) return c.fail
  if (!uuid.safeParse(id).success || (await c.db.vehicles.count(eq(vehicles.id, id))) === 0) return missing("Vehicle")
  const docs = await c.db.vehicleDocuments.select(eq(vehicleDocuments.vehicleId, id))
  await c.db.blockedPeriods.delete(and(eq(blockedPeriods.resourceType, "vehicle"), eq(blockedPeriods.resourceId, id))!)
  await c.db.vehicles.delete(eq(vehicles.id, id)) // its documents go with it (ON DELETE CASCADE)
  await removeFiles(docs.map((d) => d.fileKey))
  refresh("/cabs/vehicles")
  return { ok: true }
}

const MAX_DOCS_PER_RECORD = 30

export async function addVehicleDocument(vehicleId: string, input: unknown): Promise<Res<{ id: string }>> {
  const c = await open()
  if (!c.ok) return c.fail
  if (!uuid.safeParse(vehicleId).success || (await c.db.vehicles.count(eq(vehicles.id, vehicleId))) === 0) return missing("Vehicle")
  const parsed = vehicleDocumentSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const d = parsed.data
  if ((await c.db.vehicleDocuments.count(eq(vehicleDocuments.vehicleId, vehicleId))) >= MAX_DOCS_PER_RECORD) return { ok: false, error: "That vehicle has as many documents as we allow." }
  const bad = await checkFile(c.dealerId, "vehicle-doc", d.fileKey)
  if (bad) return bad
  const [created] = await c.db.vehicleDocuments.insert({ vehicleId, type: d.type, number: d.number, validFrom: d.validFrom, validTill: d.validTill, fileKey: d.fileKey }).returning({ id: vehicleDocuments.id })
  refresh(`/cabs/vehicles/${vehicleId}`)
  return { ok: true, id: created.id }
}

export async function deleteVehicleDocument(id: string): Promise<Res> {
  const c = await open()
  if (!c.ok) return c.fail
  if (!uuid.safeParse(id).success) return missing("Document")
  const [doc] = await c.db.vehicleDocuments.select(eq(vehicleDocuments.id, id), { limit: 1 })
  if (!doc) return missing("Document")
  await c.db.vehicleDocuments.delete(eq(vehicleDocuments.id, id))
  await removeFiles([doc.fileKey])
  refresh(`/cabs/vehicles/${doc.vehicleId}`)
  return { ok: true }
}

// ---------- blocked periods ----------

export async function addBlockedPeriod(input: unknown): Promise<Res<{ id: string }>> {
  const c = await open()
  if (!c.ok) return c.fail
  const parsed = blockedPeriodSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const b = parsed.data
  // The id can point at either table, so the database cannot check it; this does.
  const owned = b.resourceType === "vehicle" ? await c.db.vehicles.count(eq(vehicles.id, b.resourceId)) : await c.db.drivers.count(eq(drivers.id, b.resourceId))
  if (owned === 0) return missing(b.resourceType === "vehicle" ? "Vehicle" : "Driver")
  const [created] = await c.db.blockedPeriods.insert({ resourceType: b.resourceType, resourceId: b.resourceId, startsAt: b.startsAt, endsAt: b.endsAt, reason: b.reason }).returning({ id: blockedPeriods.id })
  refresh(b.resourceType === "vehicle" ? `/cabs/vehicles/${b.resourceId}` : `/cabs/drivers/${b.resourceId}`)
  return { ok: true, id: created.id }
}

export async function deleteBlockedPeriod(id: string): Promise<Res> {
  const c = await open()
  if (!c.ok) return c.fail
  if (!uuid.safeParse(id).success) return missing("Blocked period")
  const [row] = await c.db.blockedPeriods.select(eq(blockedPeriods.id, id), { limit: 1 })
  if (!row) return missing("Blocked period")
  await c.db.blockedPeriods.delete(eq(blockedPeriods.id, id))
  refresh(row.resourceType === "vehicle" ? `/cabs/vehicles/${row.resourceId}` : `/cabs/drivers/${row.resourceId}`)
  return { ok: true }
}

// ---------- drivers ----------

export async function saveDriver(id: string | null, input: unknown): Promise<Res<{ id: string }>> {
  const c = await open()
  if (!c.ok) return c.fail
  const parsed = driverSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const v = parsed.data
  const row = {
    name: v.name,
    phoneEnc: encrypt(v.phone),
    phoneHash: phoneHash(v.phone),
    licenceEnc: v.licenceNo ? encrypt(v.licenceNo) : null,
    licenceHash: v.licenceNo ? blindIndex("licence", v.licenceNo) : null,
    licenceValidTill: v.licenceValidTill,
    badgeNo: v.badgeNo,
    employment: v.employment,
    languages: v.languages,
    status: v.status,
  }
  const duplicate: Fail = { ok: false, error: "You already have a driver with that mobile number.", fieldErrors: { phone: "You already have this driver." } }
  try {
    if (id) {
      if (!uuid.safeParse(id).success || (await c.db.drivers.count(eq(drivers.id, id))) === 0) return missing("Driver")
      await c.db.drivers.update(row, eq(drivers.id, id))
      refresh("/cabs/drivers", `/cabs/drivers/${id}`)
      return { ok: true, id }
    }
    const limit = checkHardLimit("drivers", await c.db.drivers.count(), c.plan)
    if (!limit.ok) return { ok: false, error: limit.message, upgrade: true }
    const [created] = await c.db.drivers.insert(row).returning({ id: drivers.id })
    const after = checkHardLimit("drivers", (await c.db.drivers.count()) - 1, c.plan)
    if (!after.ok) {
      await c.db.drivers.delete(eq(drivers.id, created.id))
      return { ok: false, error: after.message, upgrade: true }
    }
    refresh("/cabs/drivers")
    return { ok: true, id: created.id }
  } catch (e) {
    if (isUniqueViolation(e)) return duplicate
    throw e
  }
}

export async function setDriverStatus(id: string, status: string): Promise<Res> {
  const c = await open()
  if (!c.ok) return c.fail
  const parsed = z.enum(["available", "on_trip", "off", "inactive"]).safeParse(status)
  if (!parsed.success || !uuid.safeParse(id).success) return { ok: false, error: "Invalid request." }
  if ((await c.db.drivers.count(eq(drivers.id, id))) === 0) return missing("Driver")
  await c.db.drivers.update({ status: parsed.data }, eq(drivers.id, id))
  refresh("/cabs/drivers", `/cabs/drivers/${id}`)
  return { ok: true }
}

export async function deleteDriver(id: string): Promise<Res> {
  const c = await open()
  if (!c.ok) return c.fail
  if (!uuid.safeParse(id).success || (await c.db.drivers.count(eq(drivers.id, id))) === 0) return missing("Driver")
  const docs = await c.db.driverDocuments.select(eq(driverDocuments.driverId, id))
  await c.db.blockedPeriods.delete(and(eq(blockedPeriods.resourceType, "driver"), eq(blockedPeriods.resourceId, id))!)
  await c.db.drivers.delete(eq(drivers.id, id))
  await removeFiles(docs.map((d) => d.fileKey))
  refresh("/cabs/drivers")
  return { ok: true }
}

export async function addDriverDocument(driverId: string, input: unknown): Promise<Res<{ id: string }>> {
  const c = await open()
  if (!c.ok) return c.fail
  if (!uuid.safeParse(driverId).success || (await c.db.drivers.count(eq(drivers.id, driverId))) === 0) return missing("Driver")
  const parsed = driverDocumentSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const d = parsed.data
  if ((await c.db.driverDocuments.count(eq(driverDocuments.driverId, driverId))) >= MAX_DOCS_PER_RECORD) return { ok: false, error: "That driver has as many documents as we allow." }
  const bad = await checkFile(c.dealerId, "driver-doc", d.fileKey)
  if (bad) return bad
  const [created] = await c.db.driverDocuments.insert({ driverId, type: d.type, number: d.number, validTill: d.validTill, fileKey: d.fileKey }).returning({ id: driverDocuments.id })
  refresh(`/cabs/drivers/${driverId}`)
  return { ok: true, id: created.id }
}

export async function deleteDriverDocument(id: string): Promise<Res> {
  const c = await open()
  if (!c.ok) return c.fail
  if (!uuid.safeParse(id).success) return missing("Document")
  const [doc] = await c.db.driverDocuments.select(eq(driverDocuments.id, id), { limit: 1 })
  if (!doc) return missing("Document")
  await c.db.driverDocuments.delete(eq(driverDocuments.id, id))
  await removeFiles([doc.fileKey])
  refresh(`/cabs/drivers/${doc.driverId}`)
  return { ok: true }
}

// ---------- pricing (owner only) ----------

const toStored = (r: typeof rateCards.$inferSelect): StoredRateCard => ({
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
})

export async function saveRateCard(id: string | null, input: unknown): Promise<Res<{ id: string }>> {
  const c = await open({ owner: true })
  if (!c.ok) return c.fail
  const parsed = rateCardSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const d = parsed.data as Record<string, unknown> & { vehicleClassId: string; tripType: StoredRateCard["tripType"]; active: boolean }
  if (!(await ownsClass(c.db, d.vehicleClassId))) return { ok: false, error: "Choose a vehicle class from your list.", fieldErrors: { vehicleClassId: "Choose a class from your list." } }

  // Fields this trip type does not use are stored as null, so a card never carries leftovers.
  const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : null)
  const row = {
    vehicleClassId: d.vehicleClassId,
    tripType: d.tripType,
    basePaise: num("basePaise"),
    perKmPaise: num("perKmPaise"),
    minKmPerDay: num("minKmPerDay"),
    perHourPaise: null,
    packageHours: num("packageHours"),
    packageKm: num("packageKm"),
    extraKmPaise: num("extraKmPaise"),
    extraHourPaise: num("extraHourPaise"),
    bataPerDayPaise: num("bataPerDayPaise"),
    validFrom: (d.validFrom as string | null) ?? null,
    validTo: (d.validTo as string | null) ?? null,
    active: d.active,
  }

  if (id && (!uuid.safeParse(id).success || (await c.db.rateCards.count(eq(rateCards.id, id))) === 0)) return missing("Rate card")
  const others = (await c.db.rateCards.select()).map(toStored)
  const conflict = findConflict({ ...row, id: id ?? "new" } as StoredRateCard, others)
  if (conflict) return { ok: false, error: "Another active rate card already covers these days for this class and trip type. Change its dates or switch it off first.", fieldErrors: { validFrom: "Overlaps another rate card." } }

  if (id) {
    await c.db.rateCards.update(row, eq(rateCards.id, id))
    refresh("/cabs/pricing")
    return { ok: true, id }
  }
  const [created] = await c.db.rateCards.insert(row).returning({ id: rateCards.id })
  refresh("/cabs/pricing")
  return { ok: true, id: created.id }
}

export async function setRateCardActive(id: string, active: boolean): Promise<Res> {
  const c = await open({ owner: true })
  if (!c.ok) return c.fail
  if (!uuid.safeParse(id).success) return missing("Rate card")
  const [row] = await c.db.rateCards.select(eq(rateCards.id, id), { limit: 1 })
  if (!row) return missing("Rate card")
  if (active) {
    const conflict = findConflict({ ...toStored(row), active: true }, (await c.db.rateCards.select()).map(toStored))
    if (conflict) return { ok: false, error: "Another active rate card already covers these days. Change its dates or switch it off first." }
  }
  await c.db.rateCards.update({ active }, eq(rateCards.id, id))
  refresh("/cabs/pricing")
  return { ok: true }
}

export async function deleteRateCard(id: string): Promise<Res> {
  const c = await open({ owner: true })
  if (!c.ok) return c.fail
  if (!uuid.safeParse(id).success || (await c.db.rateCards.count(eq(rateCards.id, id))) === 0) return missing("Rate card")
  await c.db.rateCards.delete(eq(rateCards.id, id))
  refresh("/cabs/pricing")
  return { ok: true }
}

export async function saveSurcharge(id: string | null, input: unknown): Promise<Res<{ id: string }>> {
  const c = await open({ owner: true })
  if (!c.ok) return c.fail
  const parsed = surchargeSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const s = parsed.data
  // Classes named in the scope must be this business's own.
  const ids = s.scope.vehicleClassIds ?? []
  if (ids.length > 0 && (await c.db.vehicleClasses.count(inArray(vehicleClasses.id, ids))) !== new Set(ids).size) return { ok: false, error: "Choose vehicle classes from your list." }
  const row = { kind: s.kind, label: s.label, scope: s.scope, amountPaise: s.amountPaise, bps: s.bps, active: s.active }
  if (id) {
    if (!uuid.safeParse(id).success || (await c.db.rateSurcharges.count(eq(rateSurcharges.id, id))) === 0) return missing("Charge")
    await c.db.rateSurcharges.update(row, eq(rateSurcharges.id, id))
    refresh("/cabs/pricing/surcharges", "/cabs/pricing")
    return { ok: true, id }
  }
  const [created] = await c.db.rateSurcharges.insert(row).returning({ id: rateSurcharges.id })
  refresh("/cabs/pricing/surcharges", "/cabs/pricing")
  return { ok: true, id: created.id }
}

export async function setSurchargeActive(id: string, active: boolean): Promise<Res> {
  const c = await open({ owner: true })
  if (!c.ok) return c.fail
  if (!uuid.safeParse(id).success || (await c.db.rateSurcharges.count(eq(rateSurcharges.id, id))) === 0) return missing("Charge")
  await c.db.rateSurcharges.update({ active }, eq(rateSurcharges.id, id))
  refresh("/cabs/pricing/surcharges", "/cabs/pricing")
  return { ok: true }
}

export async function deleteSurcharge(id: string): Promise<Res> {
  const c = await open({ owner: true })
  if (!c.ok) return c.fail
  if (!uuid.safeParse(id).success || (await c.db.rateSurcharges.count(eq(rateSurcharges.id, id))) === 0) return missing("Charge")
  await c.db.rateSurcharges.delete(eq(rateSurcharges.id, id))
  refresh("/cabs/pricing/surcharges", "/cabs/pricing")
  return { ok: true }
}

export async function savePackage(id: string | null, input: unknown): Promise<Res<{ id: string }>> {
  const c = await open({ owner: true })
  if (!c.ok) return c.fail
  const parsed = packageSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const p = parsed.data

  const classIds = Object.keys(p.prices)
  if (classIds.length > 0 && (await c.db.vehicleClasses.count(inArray(vehicleClasses.id, classIds))) !== classIds.length) return { ok: false, error: "Choose vehicle classes from your list." }
  const prices: Record<string, number> = {}
  for (const [classId, v] of Object.entries(p.prices)) {
    if (typeof v === "string" && v.trim() === "") continue
    const paise = rupeesToPaise(v)
    if (paise === null) return { ok: false, error: "Enter each price in rupees, like 6500.", fieldErrors: { prices: "Enter each price in rupees, like 6500." } }
    prices[classId] = paise
  }
  const storage = getStorage()
  if (!p.imageUrls.every((u) => isOwnImage(storage, c.dealerId, u))) return { ok: false, error: "Upload the pictures again.", fieldErrors: { imageUrls: "Upload the pictures again." } }

  const base = {
    name: p.name,
    description: p.description,
    days: p.days,
    itinerary: [...p.itinerary].sort((a, b) => a.day - b.day),
    vehicleClassPrices: prices,
    imageUrls: p.imageUrls,
    active: p.active,
  }
  if (id) {
    if (!uuid.safeParse(id).success || (await c.db.packages.count(eq(packages.id, id))) === 0) return missing("Package")
    await c.db.packages.update(base, eq(packages.id, id))
    refresh("/cabs/packages")
    return { ok: true, id }
  }
  const taken = new Set((await c.db.packages.select()).map((x) => x.slug))
  const slug = uniqueSlug(slugify(p.name) || "package", taken)
  const [created] = await c.db.packages.insert({ ...base, slug }).returning({ id: packages.id })
  refresh("/cabs/packages")
  return { ok: true, id: created.id }
}

export async function deletePackage(id: string): Promise<Res> {
  const c = await open({ owner: true })
  if (!c.ok) return c.fail
  if (!uuid.safeParse(id).success || (await c.db.packages.count(eq(packages.id, id))) === 0) return missing("Package")
  await c.db.packages.delete(eq(packages.id, id))
  refresh("/cabs/packages")
  return { ok: true }
}

export async function saveCabSettings(input: unknown): Promise<Res> {
  const c = await open({ owner: true })
  if (!c.ok) return c.fail
  const r = toSettingsRow(input)
  if (!r.ok) return { ok: false, error: Object.values(r.errors)[0], fieldErrors: r.errors }
  const row = { ...r.row, updatedAt: new Date() }
  await c.db.cabSettings.insert(row).onConflictDoUpdate({ target: cabSettings.dealerId, set: row })
  refresh("/cabs/settings", "/cabs/pricing")
  return { ok: true }
}
