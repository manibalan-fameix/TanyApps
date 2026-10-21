// Live test of the operator actions. Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database.
import { randomBytes, randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"
import path from "node:path"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const url = process.env.TEST_DATABASE_URL

let session: { dealer: { id: string; plan: string; trialEndsAt: Date | null; paidThrough: Date | null; subscriptionStatus: string | null; nextPlan: null; nextPlanStartsAt: null; cancelRequestedAt: null }; owner: boolean } | null = null
vi.mock("@/lib/core/guards", () => ({ industrySession: async () => session }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

describe.skipIf(!url)("operator actions (live database)", () => {
  let a: typeof import("../../lib/cabs/admin-actions")
  let db: typeof import("../../lib/db/client")
  let s: typeof import("../../lib/db/schema")
  let scoped: typeof import("../../lib/db/scoped")
  let storage: typeof import("../../lib/storage")
  let crypto_: typeof import("../../lib/crypto")
  let A: string, B: string, classA: string, classB: string
  const tag = randomUUID().slice(0, 6)
  const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
  const future = new Date(Date.now() + 20 * 86_400_000)
  const as = (dealerId: string, over: { plan?: string; owner?: boolean; trialEndsAt?: Date | null } = {}) => {
    session = { dealer: { id: dealerId, plan: over.plan ?? "starter", trialEndsAt: over.trialEndsAt === undefined ? future : over.trialEndsAt, paidThrough: null, subscriptionStatus: null, nextPlan: null, nextPlanStartsAt: null, cancelRequestedAt: null }, owner: over.owner ?? true }
  }
  const reg = (n: number) => `TN09AB${String(1000 + n)}`
  /** The vehicle created with vehicle(classId, n): rows have no guaranteed order, so find it by its registration. */
  const byReg = async (dealerId: string, n: number) => (await scoped.scopedDb(dealerId).vehicles.select()).find((v) => crypto_.decrypt(v.regEnc) === reg(n))!
  const vehicle = (classId: string, n: number, over: object = {}) => ({ classId, reg: reg(n), makeModel: "Toyota Etios", ownership: "own", odometerKm: 1000, ...over })
  const driver = (n: number, over: object = {}) => ({ name: `Driver ${n}`, phone: `98${String(10_000_000 + n)}`, employment: "employee", ...over })

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    process.env.BLIND_INDEX_KEY = randomBytes(32).toString("base64")
    vi.stubEnv("NODE_ENV", "development") // local-disk storage
    for (const k of ["R2_BUCKET", "R2_PRIVATE_BUCKET", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "VISION_API_KEY"]) delete process.env[k]
    ;[db, s, scoped, storage, crypto_] = await Promise.all([import("../../lib/db/client"), import("../../lib/db/schema"), import("../../lib/db/scoped"), import("../../lib/storage"), import("../../lib/crypto")])
    a = await import("../../lib/cabs/admin-actions")
    const rows = await db.unscopedDb
      .insert(s.dealers)
      .values([{ slug: `cab-a-${tag}`, displayName: "A", industry: "cabs", plan: "starter", theme, trialEndsAt: future }, { slug: `cab-b-${tag}`, displayName: "B", industry: "cabs", plan: "starter", theme, trialEndsAt: future }])
      .returning({ id: s.dealers.id })
    ;[A, B] = rows.map((r) => r.id)
    as(A)
    classA = ((await a.saveVehicleClass(null, { name: "Sedan", seats: 4, bags: 2, ac: true })) as { id: string }).id
    as(B)
    classB = ((await a.saveVehicleClass(null, { name: "Sedan", seats: 4, bags: 2, ac: true })) as { id: string }).id
  })
  beforeEach(() => as(A))
  afterAll(async () => {
    vi.unstubAllEnvs()
    await rm(path.resolve(process.cwd(), ".local-uploads", "dealers", A), { recursive: true, force: true })
    await rm(path.resolve(process.cwd(), ".local-uploads", "dealers", B), { recursive: true, force: true })
    await db.pool.end()
  })

  describe("sign-in, billing and who may do what", () => {
    it("refuses everything without a cab session", async () => {
      session = null
      expect(await a.saveVehicle(null, vehicle(classA, 1))).toEqual({ ok: false, error: "Please sign in again." })
      expect(await a.saveRateCard(null, {})).toMatchObject({ ok: false })
    })
    it("refuses edits once the trial has ended", async () => {
      as(A, { trialEndsAt: new Date(Date.now() - 86_400_000) })
      expect(await a.saveVehicleClass(null, { name: "Late", seats: 4, bags: 1, ac: true })).toMatchObject({ ok: false, error: expect.stringContaining("trial has ended") })
    })
    it("lets staff manage the fleet but not prices or settings", async () => {
      as(A, { owner: false })
      expect(await a.saveVehicleClass(null, { name: "Staff class", seats: 4, bags: 1, ac: true })).toMatchObject({ ok: true })
      for (const r of [await a.saveRateCard(null, { vehicleClassId: classA, tripType: "airport", perKmPaise: "14" }), await a.saveSurcharge(null, { kind: "hill", label: "Hill", scope: {}, mode: "flat", amount: "100" }), await a.savePackage(null, { name: "Tour", days: 2 }), await a.saveCabSettings({ gstPercent: "5" })]) {
        expect(r).toEqual({ ok: false, error: "Only the owner can change prices and settings." })
      }
    })
  })

  describe("vehicle classes", () => {
    it("rejects a duplicate name with a field error, and edits one", async () => {
      expect(await a.saveVehicleClass(null, { name: "Sedan", seats: 4, bags: 2, ac: true })).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String) } })
      expect(await a.saveVehicleClass(classA, { name: "Sedan", seats: 5, bags: 3, ac: false })).toMatchObject({ ok: true })
      const [row] = await scoped.scopedDb(A).vehicleClasses.select(eq(s.vehicleClasses.id, classA))
      expect(row).toMatchObject({ seats: 5, bags: 3, ac: false })
    })
    it("only accepts a picture this business uploaded", async () => {
      expect(await a.saveVehicleClass(null, { name: "Pic", seats: 4, bags: 1, ac: true, imageUrl: "https://evil.example/x.jpg" })).toMatchObject({ ok: false, fieldErrors: { imageUrl: expect.any(String) } })
      const own = storage.getStorage().publicUrl(`dealers/${A}/cab-class/${randomUUID()}.jpg`)
      expect(await a.saveVehicleClass(null, { name: "Pic", seats: 4, bags: 1, ac: true, imageUrl: own })).toMatchObject({ ok: true })
      const foreign = storage.getStorage().publicUrl(`dealers/${B}/cab-class/${randomUUID()}.jpg`)
      expect(await a.saveVehicleClass(null, { name: "Pic2", seats: 4, bags: 1, ac: true, imageUrl: foreign })).toMatchObject({ ok: false })
    })
    it("cannot touch another business's class", async () => {
      expect(await a.saveVehicleClass(classB, { name: "Hijack", seats: 4, bags: 1, ac: true })).toEqual({ ok: false, error: "Vehicle class not found." })
      expect(await a.deleteVehicleClass(classB)).toEqual({ ok: false, error: "Vehicle class not found." })
      expect((await scoped.scopedDb(B).vehicleClasses.select(eq(s.vehicleClasses.id, classB)))[0].name).toBe("Sedan")
    })
    it("will not delete a class that vehicles, rate cards or packages still use", async () => {
      const cls = ((await a.saveVehicleClass(null, { name: "Busy", seats: 7, bags: 4, ac: true })) as { id: string }).id
      const v = (await a.saveVehicle(null, vehicle(cls, 50))) as { id: string }
      expect(await a.deleteVehicleClass(cls)).toMatchObject({ ok: false, error: expect.stringContaining("1 vehicle uses") })
      await a.deleteVehicle(v.id)
      const rc = (await a.saveRateCard(null, { vehicleClassId: cls, tripType: "airport", perKmPaise: "14" })) as { id: string }
      expect(await a.deleteVehicleClass(cls)).toMatchObject({ ok: false, error: expect.stringContaining("rate cards") })
      await a.deleteRateCard(rc.id)
      const pk = (await a.savePackage(null, { name: "Uses busy", days: 2, prices: { [cls]: "5000" } })) as { id: string }
      expect(await a.deleteVehicleClass(cls)).toMatchObject({ ok: false, error: expect.stringContaining("package") })
      await a.deletePackage(pk.id)
      expect(await a.deleteVehicleClass(cls)).toEqual({ ok: true })
    })
  })

  describe("vehicles", () => {
    it("stores the registration encrypted with a keyed hash, and shows only the state/district prefix", async () => {
      const r = (await a.saveVehicle(null, vehicle(classA, 1))) as { id: string }
      const [row] = await scoped.scopedDb(A).vehicles.select(eq(s.vehicles.id, r.id))
      expect(row.regEnc).not.toContain("TN09AB1001")
      expect(crypto_.decrypt(row.regEnc)).toBe("TN09AB1001")
      expect(row.regHash).toMatch(/^[0-9a-f]{64}$/)
      expect(row.regHash).not.toContain("1001")
      expect(row.regPrefix).toBe("TN09")
    })
    it("rejects a duplicate registration (however it is typed) with a field error", async () => {
      expect(await a.saveVehicle(null, vehicle(classA, 1, { reg: "tn 09 ab 1001" }))).toMatchObject({ ok: false, fieldErrors: { reg: expect.any(String) } })
    })
    it("lets two businesses own a vehicle with the same registration number", async () => {
      as(B)
      expect(await a.saveVehicle(null, vehicle(classB, 1))).toMatchObject({ ok: true })
    })
    it("refuses a class that belongs to someone else", async () => {
      expect(await a.saveVehicle(null, vehicle(classB, 2))).toMatchObject({ ok: false, fieldErrors: { classId: expect.any(String) } })
    })
    it("cannot be edited, re-statused or deleted by another business", async () => {
      const mine = await byReg(A, 1)
      as(B)
      expect(await a.saveVehicle(mine.id, vehicle(classB, 77))).toEqual({ ok: false, error: "Vehicle not found." })
      expect(await a.setVehicleStatus(mine.id, "inactive")).toEqual({ ok: false, error: "Vehicle not found." })
      expect(await a.deleteVehicle(mine.id)).toEqual({ ok: false, error: "Vehicle not found." })
      expect((await scoped.scopedDb(A).vehicles.select(eq(s.vehicles.id, mine.id)))[0].status).toBe("active")
    })
    it("updates a vehicle and its status", async () => {
      const mine = await byReg(A, 1)
      expect(await a.saveVehicle(mine.id, vehicle(classA, 1, { makeModel: "Honda City", odometerKm: 5000 }))).toMatchObject({ ok: true })
      expect(await a.setVehicleStatus(mine.id, "maintenance")).toEqual({ ok: true })
      expect(await a.setVehicleStatus(mine.id, "flying")).toMatchObject({ ok: false })
      const [row] = await scoped.scopedDb(A).vehicles.select(eq(s.vehicles.id, mine.id))
      expect(row).toMatchObject({ makeModel: "Honda City", odometerKm: 5000, status: "maintenance" })
      await a.setVehicleStatus(mine.id, "active")
    })
  })

  describe("plan limits", () => {
    it("blocks the 11th vehicle on Starter with an upgrade prompt, and counts every status", async () => {
      const already = await scoped.scopedDb(A).vehicles.count()
      for (let n = 0; n < 10 - already; n++) expect(await a.saveVehicle(null, vehicle(classA, 100 + n, { status: n % 2 ? "inactive" : "active" }))).toMatchObject({ ok: true })
      expect(await scoped.scopedDb(A).vehicles.count()).toBe(10)
      const r = await a.saveVehicle(null, vehicle(classA, 999))
      expect(r).toMatchObject({ ok: false, upgrade: true, error: expect.stringContaining("10 vehicles") })
      expect(await scoped.scopedDb(A).vehicles.count()).toBe(10)
    })
    it("still lets an existing vehicle be edited at the limit", async () => {
      const mine = await byReg(A, 1)
      expect(await a.saveVehicle(mine.id, vehicle(classA, 1, { colour: "White" }))).toMatchObject({ ok: true })
    })
    it("allows more vehicles on Growth, and refuses on a plan without cab limits", async () => {
      as(A, { plan: "growth" })
      expect(await a.saveVehicle(null, vehicle(classA, 200))).toMatchObject({ ok: true })
      as(A, { plan: "free" })
      expect(await a.saveVehicle(null, vehicle(classA, 201))).toMatchObject({ ok: false, upgrade: true })
    })
    it("never ends up over the limit when many adds happen at the same instant", async () => {
      const rows = await db.unscopedDb.insert(s.dealers).values({ slug: `cab-race-${tag}`, displayName: "Race", industry: "cabs", plan: "starter", theme, trialEndsAt: future }).returning({ id: s.dealers.id })
      const R = rows[0].id
      as(R)
      const cls = ((await a.saveVehicleClass(null, { name: "Sedan", seats: 4, bags: 2, ac: true })) as { id: string }).id
      const results = await Promise.all(Array.from({ length: 16 }, (_, n) => a.saveVehicle(null, vehicle(cls, 300 + n))))
      const added = results.filter((r) => r.ok).length
      expect(await scoped.scopedDb(R).vehicles.count()).toBeLessThanOrEqual(10)
      expect(await scoped.scopedDb(R).vehicles.count()).toBe(added)
    })
    it("blocks the 16th driver on Starter, hard", async () => {
      for (let n = 0; n < 15; n++) expect(await a.saveDriver(null, driver(n)), `driver ${n}`).toMatchObject({ ok: true })
      expect(await a.saveDriver(null, driver(99))).toMatchObject({ ok: false, upgrade: true, error: expect.stringContaining("15 drivers") })
      expect(await scoped.scopedDb(A).drivers.count()).toBe(15)
    })
  })

  describe("drivers", () => {
    it("stores phone and licence encrypted with keyed hashes", async () => {
      as(B)
      const r = (await a.saveDriver(null, driver(1, { licenceNo: "tn09 2020 0012345", licenceValidTill: "2031-01-01" }))) as { id: string }
      const [row] = await scoped.scopedDb(B).drivers.select(eq(s.drivers.id, r.id))
      expect(crypto_.decrypt(row.phoneEnc)).toBe("+919810000001")
      expect(row.phoneEnc).not.toContain("9810000001")
      expect(crypto_.decrypt(row.licenceEnc!)).toBe("TN0920200012345")
      expect(row.phoneHash).toMatch(/^[0-9a-f]{64}$/)
      expect(row.licenceHash).toMatch(/^[0-9a-f]{64}$/)
      expect(row.licenceValidTill).toBe("2031-01-01")
    })
    it("rejects the same mobile number twice in one business, but not across businesses", async () => {
      as(B)
      expect(await a.saveDriver(null, driver(1))).toMatchObject({ ok: false, fieldErrors: { phone: expect.any(String) } })
      as(A)
      expect(await a.saveDriver(null, driver(1))).toMatchObject({ ok: false }) // A already has driver 1 too: the same-business rule
    })
    it("cannot be changed by another business", async () => {
      const [mine] = await scoped.scopedDb(A).drivers.select()
      as(B)
      expect(await a.saveDriver(mine.id, driver(500))).toEqual({ ok: false, error: "Driver not found." })
      expect(await a.setDriverStatus(mine.id, "off")).toEqual({ ok: false, error: "Driver not found." })
      expect(await a.deleteDriver(mine.id)).toEqual({ ok: false, error: "Driver not found." })
    })
  })

  describe("documents and files", () => {
    let vehicleId: string
    beforeAll(async () => {
      as(A)
      vehicleId = (await byReg(A, 1)).id
    })

    it("hands out an upload target only for allowed types and sizes", async () => {
      const ok = await a.requestDocumentUpload("vehicle-doc", "application/pdf", 1_000_000)
      expect(ok).toMatchObject({ ok: true, method: "PUT", headers: { "Content-Type": "application/pdf" } })
      if (ok.ok) {
        expect(ok.key).toMatch(new RegExp(`^dealers/${A}/private/vehicle-doc/[0-9a-f-]{36}\\.pdf$`))
        expect(ok.url).toBe(`/api/upload/${ok.key}`)
      }
      expect(await a.requestDocumentUpload("vehicle-doc", "image/svg+xml", 100)).toMatchObject({ ok: false })
      expect(await a.requestDocumentUpload("vehicle-doc", "text/html", 100)).toMatchObject({ ok: false })
      expect(await a.requestDocumentUpload("vehicle-doc", "application/pdf", 50 * 1024 * 1024)).toMatchObject({ ok: false, error: expect.stringContaining("too large") })
      expect(await a.requestDocumentUpload("vehicle-doc", "application/pdf", 0)).toMatchObject({ ok: false })
      expect(await a.requestDocumentUpload("passport" as "vehicle-doc", "application/pdf", 100)).toMatchObject({ ok: false })
    })

    it("saves a document with a file only if the file was really uploaded to this business's folder", async () => {
      const t = await a.requestDocumentUpload("vehicle-doc", "application/pdf", 100)
      if (!t.ok) throw new Error("no target")
      // Not uploaded yet.
      expect(await a.addVehicleDocument(vehicleId, { type: "insurance", validTill: "2027-03-31", fileKey: t.key })).toMatchObject({ ok: false, fieldErrors: { fileKey: expect.any(String) } })
      await storage.getPrivateStorage().put(t.key, Buffer.from("%PDF-1.7 test"), "application/pdf")
      const added = (await a.addVehicleDocument(vehicleId, { type: "insurance", number: "POL-1", validTill: "2027-03-31", fileKey: t.key })) as { id: string }
      expect(added.id).toBeTruthy()
      const [doc] = await scoped.scopedDb(A).vehicleDocuments.select(eq(s.vehicleDocuments.id, added.id))
      expect(doc).toMatchObject({ type: "insurance", number: "POL-1", validTill: "2027-03-31", fileKey: t.key })
      // Deleting the record deletes the file.
      expect(await a.deleteVehicleDocument(added.id)).toEqual({ ok: true })
      expect(await storage.getPrivateStorage().head(t.key)).toBeNull()
    })

    it("refuses another business's file, a file in the wrong folder, and a made-up key", async () => {
      const foreign = `dealers/${B}/private/vehicle-doc/${randomUUID()}.pdf`
      const wrongFolder = `dealers/${A}/private/driver-doc/${randomUUID()}.pdf`
      for (const fileKey of [foreign, wrongFolder, "https://evil.example/x.pdf", `dealers/${A}/private/vehicle-doc/../x.pdf`]) {
        expect(await a.addVehicleDocument(vehicleId, { type: "rc", fileKey }), fileKey).toMatchObject({ ok: false })
      }
    })

    it("accepts a document with no file, and one that never expires", async () => {
      expect(await a.addVehicleDocument(vehicleId, { type: "rc", number: "RC123" })).toMatchObject({ ok: true })
    })

    it("cannot attach documents to, or delete documents of, another business", async () => {
      const [doc] = await scoped.scopedDb(A).vehicleDocuments.select()
      as(B)
      expect(await a.addVehicleDocument(vehicleId, { type: "rc" })).toEqual({ ok: false, error: "Vehicle not found." })
      expect(await a.deleteVehicleDocument(doc.id)).toEqual({ ok: false, error: "Document not found." })
    })

    it("does the same for drivers, and deleting a driver removes their files", async () => {
      const [d] = await scoped.scopedDb(A).drivers.select()
      const t = await a.requestDocumentUpload("driver-doc", "image/jpeg", 100)
      if (!t.ok) throw new Error("no target")
      await storage.getPrivateStorage().put(t.key, Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")
      expect(await a.addDriverDocument(d.id, { type: "licence", number: "L1", validTill: "2030-01-01", fileKey: t.key })).toMatchObject({ ok: true })
      expect(await a.addDriverDocument(d.id, { type: "licence", fileKey: `dealers/${B}/private/driver-doc/${randomUUID()}.pdf` })).toMatchObject({ ok: false })
      expect(await a.deleteDriver(d.id)).toEqual({ ok: true })
      expect(await storage.getPrivateStorage().head(t.key)).toBeNull()
      expect(await scoped.scopedDb(A).driverDocuments.count(eq(s.driverDocuments.driverId, d.id))).toBe(0)
    })
  })

  describe("blocked periods", () => {
    const period = (resourceId: string, over: object = {}) => ({ resourceType: "vehicle", resourceId, startsAt: "2026-12-01T09:00:00+05:30", endsAt: "2026-12-03T09:00:00+05:30", reason: "Service", ...over })
    it("blocks a vehicle or driver that is yours, and nothing else", async () => {
      const v = (await scoped.scopedDb(A).vehicles.select())[0]
      expect(await a.addBlockedPeriod(period(v.id))).toMatchObject({ ok: true })
      const d = (await scoped.scopedDb(A).drivers.select())[0]
      expect(await a.addBlockedPeriod(period(d.id, { resourceType: "driver" }))).toMatchObject({ ok: true })
      // A driver id used as a vehicle, a stranger's vehicle, a random id.
      expect(await a.addBlockedPeriod(period(d.id))).toEqual({ ok: false, error: "Vehicle not found." })
      as(B)
      expect(await a.addBlockedPeriod(period(v.id))).toEqual({ ok: false, error: "Vehicle not found." })
      as(A)
      expect(await a.addBlockedPeriod(period(randomUUID()))).toMatchObject({ ok: false })
      expect(await a.addBlockedPeriod(period(v.id, { endsAt: "2026-11-30T09:00:00+05:30" }))).toMatchObject({ ok: false })
    })
    it("can be removed by its owner only", async () => {
      const [p] = await scoped.scopedDb(A).blockedPeriods.select()
      as(B)
      expect(await a.deleteBlockedPeriod(p.id)).toEqual({ ok: false, error: "Blocked period not found." })
      as(A)
      expect(await a.deleteBlockedPeriod(p.id)).toEqual({ ok: true })
    })
    it("goes away with the vehicle", async () => {
      const target = await byReg(A, 100)
      await a.addBlockedPeriod(period(target.id))
      await a.deleteVehicle(target.id)
      expect(await scoped.scopedDb(A).blockedPeriods.count(eq(s.blockedPeriods.resourceId, target.id))).toBe(0)
    })
  })

  describe("pricing", () => {
    it("saves a rate card per trip type, with unused fields null", async () => {
      const r = (await a.saveRateCard(null, { vehicleClassId: classA, tripType: "outstation_round", perKmPaise: "11.5", minKmPerDay: 250, bataPerDayPaise: "400", packageKm: 99 })) as { id: string }
      const [row] = await scoped.scopedDb(A).rateCards.select(eq(s.rateCards.id, r.id))
      expect(row).toMatchObject({ tripType: "outstation_round", perKmPaise: 1150, minKmPerDay: 250, bataPerDayPaise: 40_000, basePaise: null, packageKm: null })
    })
    it("will not save two active cards that cover the same days for the same class and trip type", async () => {
      const r = await a.saveRateCard(null, { vehicleClassId: classA, tripType: "outstation_round", perKmPaise: "12", minKmPerDay: 250 })
      expect(r).toMatchObject({ ok: false, fieldErrors: { validFrom: expect.any(String) } })
      expect(await a.saveRateCard(null, { vehicleClassId: classA, tripType: "outstation_round", perKmPaise: "12", minKmPerDay: 250, active: false })).toMatchObject({ ok: true })
    })
    it("keeps different hourly packages for one class side by side", async () => {
      const base = { vehicleClassId: classA, tripType: "local_hourly", extraKmPaise: "12", extraHourPaise: "200" }
      expect(await a.saveRateCard(null, { ...base, basePaise: "800", packageHours: 4, packageKm: 40 })).toMatchObject({ ok: true })
      expect(await a.saveRateCard(null, { ...base, basePaise: "1400", packageHours: 8, packageKm: 80 })).toMatchObject({ ok: true })
      expect(await a.saveRateCard(null, { ...base, basePaise: "900", packageHours: 4, packageKm: 40 })).toMatchObject({ ok: false })
    })
    it("allows a new season's card after the old one's dates", async () => {
      const base = { vehicleClassId: classA, tripType: "airport", perKmPaise: "14" }
      expect(await a.saveRateCard(null, { ...base, validFrom: "2027-01-01", validTo: "2027-03-31" })).toMatchObject({ ok: true })
      expect(await a.saveRateCard(null, { ...base, perKmPaise: "16", validFrom: "2027-04-01" })).toMatchObject({ ok: true })
      expect(await a.saveRateCard(null, { ...base, perKmPaise: "17", validFrom: "2027-03-15", validTo: "2027-04-10" })).toMatchObject({ ok: false })
    })
    it("refuses a class that is not yours, and cards of another business", async () => {
      expect(await a.saveRateCard(null, { vehicleClassId: classB, tripType: "airport", perKmPaise: "14" })).toMatchObject({ ok: false })
      const [mine] = await scoped.scopedDb(A).rateCards.select()
      as(B)
      expect(await a.saveRateCard(mine.id, { vehicleClassId: classB, tripType: "airport", perKmPaise: "1" })).toEqual({ ok: false, error: "Rate card not found." })
      expect(await a.setRateCardActive(mine.id, false)).toEqual({ ok: false, error: "Rate card not found." })
      expect(await a.deleteRateCard(mine.id)).toEqual({ ok: false, error: "Rate card not found." })
    })
    it("will not switch a card back on if that would overlap another", async () => {
      const cards = await scoped.scopedDb(A).rateCards.select(eq(s.rateCards.tripType, "outstation_round"))
      const off = cards.find((c) => !c.active)!
      expect(await a.setRateCardActive(off.id, true)).toMatchObject({ ok: false })
    })

    it("saves surcharges as a flat amount or a percentage, checking the classes in their scope", async () => {
      expect(await a.saveSurcharge(null, { kind: "hill", label: "Hill", scope: {}, mode: "flat", amount: "500" })).toMatchObject({ ok: true })
      const pct = (await a.saveSurcharge(null, { kind: "festival", label: "Festival", scope: { dateRanges: [{ from: "2026-11-08", to: "2026-11-10" }] }, mode: "percent", amount: "5" })) as { id: string }
      const [row] = await scoped.scopedDb(A).rateSurcharges.select(eq(s.rateSurcharges.id, pct.id))
      expect(row).toMatchObject({ amountPaise: null, bps: 500 })
      expect(await a.saveSurcharge(null, { kind: "hill", label: "Foreign", scope: { vehicleClassIds: [classB] }, mode: "flat", amount: "1" })).toMatchObject({ ok: false })
      as(B)
      expect(await a.saveSurcharge(pct.id, { kind: "hill", label: "Hill charge", scope: {}, mode: "flat", amount: "1" })).toEqual({ ok: false, error: "Charge not found." })
      expect(await a.deleteSurcharge(pct.id)).toEqual({ ok: false, error: "Charge not found." })
      as(A)
      expect(await a.setSurchargeActive(pct.id, false)).toEqual({ ok: true })
      expect(await a.deleteSurcharge(pct.id)).toEqual({ ok: true })
    })

    it("saves packages with per-class prices in paise and unique slugs", async () => {
      const p1 = (await a.savePackage(null, { name: "Pondicherry weekend", days: 2, itinerary: [{ day: 2, title: "Beach" }, { day: 1, title: "Drive" }], prices: { [classA]: "6500" } })) as { id: string }
      const p2 = (await a.savePackage(null, { name: "Pondicherry weekend", days: 3 })) as { id: string }
      const [r1] = await scoped.scopedDb(A).packages.select(eq(s.packages.id, p1.id))
      const [r2] = await scoped.scopedDb(A).packages.select(eq(s.packages.id, p2.id))
      expect(r1).toMatchObject({ slug: "pondicherry-weekend", vehicleClassPrices: { [classA]: 650_000 } })
      expect(r1.itinerary.map((d) => d.day)).toEqual([1, 2])
      expect(r2.slug).toBe("pondicherry-weekend-2")
      expect(await a.savePackage(null, { name: "Foreign prices", days: 2, prices: { [classB]: "5000" } })).toMatchObject({ ok: false })
      expect(await a.savePackage(null, { name: "Bad price", days: 2, prices: { [classA]: "lots" } })).toMatchObject({ ok: false })
    })

    it("saves settings once per business and overwrites them", async () => {
      expect(await a.saveCabSettings({ gstPercent: "5", stateCode: "TN", advancePercent: "20", nightStart: "22:00", nightEnd: "06:00" })).toEqual({ ok: true })
      expect(await a.saveCabSettings({ gstPercent: "12", stateCode: "TN" })).toEqual({ ok: true })
      const rows = await scoped.scopedDb(A).cabSettings.select()
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ gstRateBps: 1200, stateCode: "33", advanceBps: null, nightStart: null })
      expect(await a.saveCabSettings({ gstPercent: "lots" })).toMatchObject({ ok: false, fieldErrors: { gstPercent: expect.any(String) } })
      expect(await scoped.scopedDb(B).cabSettings.select()).toHaveLength(0)
    })
  })
})
