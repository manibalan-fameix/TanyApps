// Live test of what the operator's screens load, and of the monthly bookings-allowance events. Runs only when
// TEST_DATABASE_URL points at a DISPOSABLE, migrated database (audit rows are append-only and cannot be cleaned up).
import { randomBytes, randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const url = process.env.TEST_DATABASE_URL

vi.mock("@/lib/core/guards", () => ({ industrySession: async () => session }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
let session: { dealer: Record<string, unknown>; owner: boolean } | null = null

describe.skipIf(!url)("operator screens' data (live database)", () => {
  let db: typeof import("../../lib/db/client")
  let s: typeof import("../../lib/db/schema")
  let scoped: typeof import("../../lib/db/scoped")
  let a: typeof import("../../lib/cabs/admin-actions")
  let pd: typeof import("../../lib/cabs/page-data")
  let usage: typeof import("../../lib/cabs/usage")
  let limits: typeof import("../../lib/cabs/limits")
  let A: string
  let B: string
  const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
  const future = new Date(Date.now() + 20 * 86_400_000)
  const asA = () => (session = { dealer: { id: A, plan: "starter", trialEndsAt: future, paidThrough: null, subscriptionStatus: null, nextPlan: null, nextPlanStartsAt: null, cancelRequestedAt: null }, owner: true })

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    process.env.BLIND_INDEX_KEY = randomBytes(32).toString("base64")
    vi.stubEnv("NODE_ENV", "development")
    ;[db, s, scoped, a, pd, usage, limits] = await Promise.all([import("../../lib/db/client"), import("../../lib/db/schema"), import("../../lib/db/scoped"), import("../../lib/cabs/admin-actions"), import("../../lib/cabs/page-data"), import("../../lib/cabs/usage"), import("../../lib/cabs/limits")])
    const tag = randomUUID().slice(0, 6)
    const rows = await db.unscopedDb.insert(s.dealers).values([{ slug: `pd-a-${tag}`, displayName: "A", industry: "cabs", plan: "starter", theme, trialEndsAt: future }, { slug: `pd-b-${tag}`, displayName: "B", industry: "cabs", plan: "starter", theme, trialEndsAt: future }]).returning({ id: s.dealers.id })
    ;[A, B] = rows.map((r) => r.id)
    asA()
  })
  afterAll(async () => {
    vi.unstubAllEnvs()
    await db.pool.end()
  })

  it("shows a vehicle with its registration decrypted for its owner, and counts its documents' expiry", async () => {
    const cls = ((await a.saveVehicleClass(null, { name: "Sedan", seats: 4, bags: 2, ac: true })) as { id: string }).id
    const v = (await a.saveVehicle(null, { classId: cls, reg: "TN09AB1234", makeModel: "Etios", ownership: "own", odometerKm: 10 })) as { id: string }
    await a.addVehicleDocument(v.id, { type: "insurance", validTill: "2020-01-01" })
    await a.addVehicleDocument(v.id, { type: "fc", validTill: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10) })
    await a.addVehicleDocument(v.id, { type: "rc" })
    const rows = await pd.loadVehicles(scoped.scopedDb(A), new Date())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ reg: "TN 09 AB 1234", makeModel: "Etios", className: "Sedan", docs: { expired: 1, soon: 1, total: 3 } })
    const detail = await pd.loadVehicleDetail(scoped.scopedDb(A), v.id, new Date())
    expect(detail?.docs.map((d) => d.status).sort()).toEqual(["expired", "none", "soon"])
    // Another business sees none of it.
    expect(await pd.loadVehicles(scoped.scopedDb(B), new Date())).toEqual([])
    expect(await pd.loadVehicleDetail(scoped.scopedDb(B), v.id, new Date())).toBeNull()
  })

  it("shows a driver with the mobile number and licence decrypted, and the licence's expiry", async () => {
    const d = (await a.saveDriver(null, { name: "Murugan", phone: "9876543210", employment: "employee", licenceNo: "TN09 2020 0012345", licenceValidTill: "2020-06-01" })) as { id: string }
    const rows = await pd.loadDrivers(scoped.scopedDb(A), new Date())
    expect(rows[0]).toMatchObject({ name: "Murugan", phone: "9876543210", licenceNo: "TN0920200012345", licenceStatus: "expired" })
    expect((await pd.loadDriverDetail(scoped.scopedDb(A), d.id, new Date()))?.driver.id).toBe(d.id)
    expect(await pd.loadDriverDetail(scoped.scopedDb(B), d.id, new Date())).toBeNull()
  })

  it("round-trips settings through the form and into the numbers the fare engine reads", async () => {
    expect(await a.saveCabSettings({ gstPercent: "5", stateCode: "TN", advancePercent: "20", nightStart: "22:00", nightEnd: "06:00", cancellationPolicy: [{ hoursBefore: 24, feePercent: "0" }, { hoursBefore: 4, feePercent: "50" }] })).toEqual({ ok: true })
    const loaded = await pd.loadPricing(scoped.scopedDb(A))
    expect(loaded.settings).toEqual({ nightStart: "22:00", nightEnd: "06:00", gstRateBps: 500, stateCode: "33", advanceBps: 2000 })
    expect(pd.settingsToForm(loaded.settingsRow)).toMatchObject({ gstPercent: "5", stateCode: "TN", advancePercent: "20", tiers: [{ hoursBefore: "24", feePercent: "0" }, { hoursBefore: "4", feePercent: "50" }] })
    expect(pd.settingsToForm(undefined)).toMatchObject({ gstPercent: "", stateCode: "", advancePercent: "", tiers: [], minLeadMinutes: "0" })
    expect((await pd.loadPricing(scoped.scopedDb(B))).settings.gstRateBps).toBeNull()
  })

  it("records the 80% and 100% bookings events once a month each, for the Tany team", async () => {
    const now = new Date("2031-05-10T10:00:00+05:30")
    const db_ = scoped.scopedDb(A)
    expect(await usage.recordBookingsThreshold(db_, limits.bookingsUsage(10, "starter"), now)).toBe(false)
    expect(await usage.recordBookingsThreshold(db_, null, now)).toBe(false)
    expect(await usage.recordBookingsThreshold(db_, limits.bookingsUsage(330, "starter"), now)).toBe(true)
    expect(await usage.recordBookingsThreshold(db_, limits.bookingsUsage(340, "starter"), now)).toBe(false) // already told this month
    expect(await usage.recordBookingsThreshold(db_, limits.bookingsUsage(401, "starter"), now)).toBe(true) // 100% is its own event
    expect(await usage.recordBookingsThreshold(db_, limits.bookingsUsage(500, "starter"), now)).toBe(false)
    expect(await usage.recordBookingsThreshold(db_, limits.bookingsUsage(330, "starter"), new Date("2031-06-02T10:00:00+05:30"))).toBe(true) // a new month
    const events = (await db_.auditLog.select()).filter((e) => e.action.startsWith("plan.bookings"))
    expect(events.map((e) => `${e.action}@${e.entityId}`).sort()).toEqual(["plan.bookings_100_percent@2031-05", "plan.bookings_80_percent@2031-05", "plan.bookings_80_percent@2031-06"])
    expect(events[0]).toMatchObject({ entity: "plan", actorType: "system" })
    expect(await scoped.scopedDb(B).auditLog.select()).toEqual([])
  })

  it("counts no bookings until trips exist (Phase 2 replaces this)", async () => {
    expect(await usage.monthlyBookingCount(scoped.scopedDb(A), new Date())).toBe(0)
  })
})
