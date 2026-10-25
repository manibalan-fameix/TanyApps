// Live test: the cab hold sweep looks only at businesses that have work due. 500 synthetic cab businesses, a few due trips.
// Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database (see docs/staging/neon-test-database.md).
import { randomBytes } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { testDatabaseUrl } from "../support/disposable-db"

const url = testDatabaseUrl()

describe.skipIf(!url)("cab hold sweep at scale (live database)", () => {
  let sweep: typeof import("../../lib/core/jobs/expire-trip-holds")
  let db: typeof import("../../lib/db/client")
  let s: typeof import("../../lib/db/schema")
  let crypto: typeof import("../../lib/crypto")
  let blind: typeof import("../../lib/crypto/blind-index")
  let drizzle: typeof import("drizzle-orm")
  let all: string[] = []
  const classOf = new Map<string, string>()
  const customerOf = new Map<string, string>()
  const tag = randomBytes(3).toString("hex")
  const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000)
  const minutesAhead = (m: number) => new Date(Date.now() + m * 60_000)
  let n = 0

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    process.env.BLIND_INDEX_KEY = randomBytes(32).toString("base64")
    ;[sweep, db, s, crypto, blind, drizzle] = await Promise.all([
      import("../../lib/core/jobs/expire-trip-holds"),
      import("../../lib/db/client"),
      import("../../lib/db/schema"),
      import("../../lib/crypto"),
      import("../../lib/crypto/blind-index"),
      import("drizzle-orm"),
    ])
    const rows = Array.from({ length: 500 }, (_, i) => ({ slug: `hs-${tag}-${i}`, displayName: `Cab ${i}`, industry: "cabs" as const, plan: "starter" as const, theme, phone: "+919812345678" }))
    all = (await db.unscopedDb.insert(s.dealers).values(rows).returning({ id: s.dealers.id })).map((r) => r.id)
  }, 120_000)
  afterAll(async () => {
    try {
      // Only the businesses this run created; their trips, customers and classes are removed with them where the schema cascades.
      await db.unscopedDb.delete(s.trips).where(drizzle.inArray(s.trips.dealerId, all))
      await db.unscopedDb.delete(s.dealers).where(drizzle.inArray(s.dealers.id, all))
    } finally {
      await db.pool.end()
    }
  }, 120_000)

  async function addTrip(dealer: string, t: { status: "requested" | "confirmed"; holdExpiresAt: Date | null; holdAlertAt?: Date | null; holdAlertedAt?: Date | null }) {
    if (!classOf.has(dealer)) {
      classOf.set(dealer, (await db.unscopedDb.insert(s.vehicleClasses).values({ dealerId: dealer, name: "Sedan", seats: 4, bags: 2 }).returning({ id: s.vehicleClasses.id }))[0].id)
      const phone = `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
      customerOf.set(dealer, (await db.unscopedDb.insert(s.customers).values({ dealerId: dealer, phoneEnc: crypto.encrypt(phone), phoneHash: blind.phoneHash(phone) }).returning({ id: s.customers.id }))[0].id)
    }
    const place = { placeId: "p", addressEnc: crypto.encrypt("x"), lat: 13, lng: 80, stateCode: "TN" }
    const [row] = await db.unscopedDb
      .insert(s.trips)
      .values({
        dealerId: dealer, code: `H${tag.slice(0, 2)}${String(++n).padStart(3, "0")}`.toUpperCase(), customerId: customerOf.get(dealer)!, tripType: "airport", status: t.status, pickup: place, drop: place,
        startAt: minutesAhead(600), pax: 2, bags: 1, vehicleClassId: classOf.get(dealer)!, quote: { version: 1, at: new Date().toISOString(), input: {}, result: {}, distanceM: 1000, durationS: 60, distanceSource: "manual" },
        quoteTotalPaise: 100000, advanceDuePaise: t.status === "confirmed" ? 20000 : 0, shareTokenHash: `sh-${tag}-${n}`, holdExpiresAt: t.holdExpiresAt, holdAlertAt: t.holdAlertAt ?? null, holdAlertedAt: t.holdAlertedAt ?? null,
      })
      .returning({ id: s.trips.id })
    return row.id
  }
  const roundTrip = async () => {
    const times: number[] = []
    for (let i = 0; i < 5; i++) {
      const t = performance.now()
      await db.unscopedDb.execute(drizzle.sql`select 1`)
      times.push(performance.now() - t)
    }
    return times.sort((a, b) => a - b)[2]
  }
  const status = async (id: string) => (await db.unscopedDb.select().from(s.trips).where(drizzle.eq(s.trips.id, id)))[0]

  it("with 500 businesses and three due trips it touches only the businesses with work, in a handful of queries", async () => {
    const expired = await addTrip(all[10], { status: "requested", holdExpiresAt: minutesAgo(5), holdAlertAt: minutesAgo(20) })
    const alertOnly = await addTrip(all[200], { status: "requested", holdExpiresAt: minutesAhead(20), holdAlertAt: minutesAgo(2) })
    const unpaid = await addTrip(all[499], { status: "confirmed", holdExpiresAt: minutesAgo(1) })
    // Not due: a deadline in the future, a nudge already sent, and a confirmed booking with no deadline.
    const future = await addTrip(all[11], { status: "requested", holdExpiresAt: minutesAhead(30), holdAlertAt: minutesAhead(15) })
    const nudged = await addTrip(all[12], { status: "requested", holdExpiresAt: minutesAhead(30), holdAlertAt: minutesAgo(5), holdAlertedAt: minutesAgo(4) })
    const open = await addTrip(all[13], { status: "confirmed", holdExpiresAt: null })

    // One round trip to this database, measured now: a local socket is under a millisecond, Neon from a distant region is hundreds.
    const rtt = await roundTrip()
    const queries = vi.spyOn(db.pool, "query") // sees every query on node-postgres; on the Neon driver (HTTP/WebSocket) it sees none
    const t0 = performance.now()
    const r = await sweep.sweepDueHolds({ only: all })
    const ms = performance.now() - t0
    const count = queries.mock.calls.length
    queries.mockRestore()
    console.info(`MEASURED hold sweep, 500 businesses / 3 with work due: ${count || "n/a (Neon driver)"} queries, ${Math.round(ms)} ms, one round trip = ${rtt.toFixed(1)} ms, so ${(ms / Math.max(rtt, 0.1)).toFixed(0)} round trips`)

    expect(r).toMatchObject({ businesses: 3, expired: 2, alerted: 2, failed: 0, deferred: 0 }) // the half-way nudge goes to both requests that passed it
    expect((await status(expired)).status).toBe("expired")
    expect((await status(unpaid)).status).toBe("expired")
    const nudge = await status(alertOnly)
    expect([nudge.status, nudge.holdAlertedAt !== null]).toEqual(["requested", true]) // nudged once, still waiting
    for (const id of [future, nudged, open]) expect((await status(id)).status).not.toBe("expired")
    // The old sweep cost at least two queries for each of the 500 businesses (1000+ round trips). This one costs a handful, whatever
    // the count: judged in round trips so it holds on any driver and any distance.
    if (count > 0) expect(count, `queries issued: ${count}`).toBeLessThan(60)
    expect(ms, `took ${Math.round(ms)} ms = ${(ms / Math.max(rtt, 0.1)).toFixed(0)} round trips`).toBeLessThan(80 * Math.max(rtt, 5) + 1_000)
  }, 120_000)

  it("nothing due costs two queries and touches no business", async () => {
    const queries = vi.spyOn(db.pool, "query")
    const r = await sweep.sweepDueHolds({ only: all })
    const count = queries.mock.calls.length
    queries.mockRestore()
    expect(r).toEqual({ alerted: 0, expired: 0, businesses: 0, deferred: 0, failed: 0 })
    expect(count).toBeLessThanOrEqual(2) // 0 on the Neon driver, where the pool is not used
  })

  it("is bounded per run, serves the oldest work first, and every business is eventually served (no starvation)", async () => {
    const ids = [all[20], all[21], all[22], all[23], all[24]]
    const trips = new Map<string, string>()
    // Oldest deadline first: all[24] has been waiting longest.
    for (const [i, d] of ids.entries()) trips.set(d, await addTrip(d, { status: "requested", holdExpiresAt: minutesAgo(10 + i * 10) }))
    const served: string[][] = []
    for (let run = 0; run < 5; run++) {
      const before = await Promise.all(ids.map(async (d) => [d, (await status(trips.get(d)!)).status] as const))
      const r = await sweep.sweepDueHolds({ only: all, maxBusinesses: 2 })
      const after = await Promise.all(ids.map(async (d) => [d, (await status(trips.get(d)!)).status] as const))
      served.push(after.filter(([, st], i) => st === "expired" && before[i][1] !== "expired").map(([d]) => d))
      expect(r.businesses).toBeLessThanOrEqual(2)
      if (after.every(([, st]) => st === "expired")) break
    }
    expect(served[0].sort()).toEqual([all[23], all[24]].sort()) // the two that waited longest
    expect(served.flat().sort()).toEqual([...ids].sort()) // all five, none skipped, none twice
    expect(served).toHaveLength(3)
  }, 120_000)

  it("always makes progress, even with no time budget left", async () => {
    const a = await addTrip(all[30], { status: "requested", holdExpiresAt: minutesAgo(30) })
    const b = await addTrip(all[31], { status: "requested", holdExpiresAt: minutesAgo(20) })
    const r = await sweep.sweepDueHolds({ only: all, budgetMs: -1 })
    expect(r).toMatchObject({ businesses: 1, deferred: 1 }) // one business served, the other waits for the next minute
    expect((await status(a)).status).toBe("expired")
    expect((await status(b)).status).toBe("requested")
    await sweep.sweepDueHolds({ only: all })
    expect((await status(b)).status).toBe("expired")
  }, 120_000)

  it("running it again changes nothing (safe to repeat)", async () => {
    const id = await addTrip(all[40], { status: "requested", holdExpiresAt: minutesAgo(10) })
    await sweep.sweepDueHolds({ only: all })
    const events = async () => (await db.unscopedDb.select().from(s.tripEvents).where(drizzle.eq(s.tripEvents.tripId, id))).length
    const first = await events()
    expect(await sweep.sweepDueHolds({ only: all })).toMatchObject({ alerted: 0, expired: 0 })
    expect(await events()).toBe(first)
  })
})
