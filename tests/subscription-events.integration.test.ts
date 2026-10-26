// Live test of applySubscription with replayed, delayed, reordered and concurrent Razorpay subscription events.
// Fixtures only: no Razorpay request is made (the one outbound call, cancelling a replaced subscription, is stubbed at the module boundary).
// Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database (see docs/staging/neon-test-database.md).
import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()
const cancelled: string[] = []
vi.mock("../lib/billing/razorpay", async (orig) => ({
  ...(await orig<typeof import("../lib/billing/razorpay")>()),
  cancelSubscription: async (id: string) => {
    cancelled.push(id)
  },
}))

const T1 = 1_900_000_000 // unix seconds, comfortably in the future
const DAY = 86_400

describe.skipIf(!url)("subscription events (live database, no Razorpay)", () => {
  let svc: typeof import("../lib/billing/service")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  const tag = randomBytes(3).toString("hex")
  let n = 0

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    svc = await import("../lib/billing/service")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
  })
  afterAll(async () => {
    await pool.end()
  })

  const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
  const dealer = async (over: Partial<typeof import("../lib/db/schema").dealers.$inferInsert> = {}) => {
    const sub = `sub_${tag}_${++n}`
    const [d] = await unscopedDb
      .insert(s.dealers)
      .values({ slug: `subev-${tag}-${n}`, displayName: "Sub test", theme, plan: "starter", subscriptionId: sub, subscriptionStatus: "authenticated", trialEndsAt: new Date(Date.now() + 5 * DAY * 1000), ...over })
      .returning()
    return { d, sub }
  }
  const event = (d: { id: string }, id: string, status: string, end: number | null, notes: Record<string, string> = {}) => ({
    id,
    status,
    current_end: end,
    notes: { dealer_id: d.id, plan: "starter", cycle: "monthly", ...notes },
  })
  const reload = async (id: string) => (await unscopedDb.select().from(s.dealers).where(eq(s.dealers.id, id)))[0]

  it("replaying the same event is a no-op", async () => {
    const { d, sub } = await dealer()
    for (let i = 0; i < 3; i++) await svc.applySubscription(event(d, sub, "active", T1))
    const row = await reload(d.id)
    expect(row.subscriptionStatus).toBe("active")
    expect(row.paidThrough?.getTime()).toBe(T1 * 1000)
  })

  it("a delayed older event never moves the paid-through date backwards", async () => {
    const { d, sub } = await dealer()
    await svc.applySubscription(event(d, sub, "active", T1 + 30 * DAY))
    await svc.applySubscription(event(d, sub, "active", T1)) // the previous cycle's event arrives late
    expect((await reload(d.id)).paidThrough?.getTime()).toBe((T1 + 30 * DAY) * 1000)
  })

  it("legitimate reordering still works: halted then a later active", async () => {
    const { d, sub } = await dealer()
    await svc.applySubscription(event(d, sub, "halted", null))
    expect((await reload(d.id)).subscriptionStatus).toBe("halted")
    await svc.applySubscription(event(d, sub, "active", T1))
    const row = await reload(d.id)
    expect(row.subscriptionStatus).toBe("active")
    expect(row.paidThrough?.getTime()).toBe(T1 * 1000)
  })

  it("a late active/authenticated event cannot revive a cancelled subscription", async () => {
    const { d, sub } = await dealer()
    await svc.applySubscription(event(d, sub, "active", T1))
    await svc.applySubscription(event(d, sub, "cancelled", T1))
    await svc.applySubscription(event(d, sub, "authenticated", null))
    await svc.applySubscription(event(d, sub, "active", T1))
    expect((await reload(d.id)).subscriptionStatus).toBe("cancelled")
  })

  it("a brand-new subscription after a cancellation is adopted (re-subscribing works)", async () => {
    const { d, sub } = await dealer({ subscriptionStatus: "cancelled", paidThrough: new Date(T1 * 1000) })
    const fresh = `sub_${tag}_new_${n}`
    const r = await svc.applySubscription(event(d, fresh, "authenticated", null, { plan: "starter" }))
    expect(r.applied).toBe(true)
    const row = await reload(d.id)
    expect(row.subscriptionId).toBe(fresh)
    expect(row.subscriptionStatus).toBe("authenticated")
    expect(cancelled).toContain(sub) // the replaced one is stopped, via the stub
  })

  it("an event naming another business's id cannot touch this one (dealerIdCheck)", async () => {
    const { d, sub } = await dealer()
    const other = await dealer()
    const r = await svc.applySubscription(event(other.d, sub, "active", T1), d.id)
    expect(r.applied).toBe(false)
    expect((await reload(d.id)).subscriptionStatus).toBe("authenticated")
    expect((await reload(other.d.id)).subscriptionStatus).toBe("authenticated")
  })

  it("an unknown dealer in the notes is ignored", async () => {
    const r = await svc.applySubscription({ id: "sub_x", status: "active", current_end: T1, notes: { dealer_id: "00000000-0000-4000-8000-0000000000aa", plan: "starter", cycle: "monthly" } })
    expect(r.applied).toBe(false)
  })

  it("concurrent delivery of the same and of competing events ends in one consistent state", async () => {
    const { d, sub } = await dealer()
    await Promise.all([
      ...Array.from({ length: 6 }, () => svc.applySubscription(event(d, sub, "active", T1))),
      svc.applySubscription(event(d, sub, "active", T1 + 30 * DAY)),
      svc.applySubscription(event(d, sub, "active", T1 + 60 * DAY)),
    ])
    const row = await reload(d.id)
    expect(row.subscriptionId).toBe(sub)
    expect(row.subscriptionStatus).toBe("active")
    // The date only ever moves forward, decided inside the database, so whatever the interleaving the latest period end wins.
    expect(row.paidThrough?.getTime()).toBe((T1 + 60 * DAY) * 1000)
  })
})
