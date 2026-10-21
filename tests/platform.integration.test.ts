// Live test of audit_log and the notifications outbox. Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated
// database (audit rows are append-only, so they cannot be cleaned up; see tenant-leak.integration.test.ts).
import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)("audit log and outbox (live database)", () => {
  let scopedDb: typeof import("../lib/db/scoped").scopedDb
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  let audit: typeof import("../lib/core/audit").audit
  let enqueue: typeof import("../lib/core/notifications/outbox").enqueue
  let waLinkFor: typeof import("../lib/core/notifications/outbox").waLinkFor
  let A: string, B: string

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    process.env.BLIND_INDEX_KEY = randomBytes(32).toString("base64")
    ;({ scopedDb } = await import("../lib/db/scoped"))
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
    ;({ audit } = await import("../lib/core/audit"))
    ;({ enqueue, waLinkFor } = await import("../lib/core/notifications/outbox"))
    const tag = Math.random().toString(36).slice(2, 8)
    const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
    const rows = await unscopedDb
      .insert(s.dealers)
      .values([{ slug: `pl-a-${tag}`, displayName: "A", theme }, { slug: `pl-b-${tag}`, displayName: "B", theme }])
      .returning({ id: s.dealers.id })
    ;[A, B] = rows.map((r) => r.id)
  })
  afterAll(async () => {
    await pool.end()
  })

  it("writes audit entries for one dealer and shows them only to that dealer", async () => {
    await audit(scopedDb(A), { actorType: "user", actorId: "u1", action: "trip.reassign", entity: "trip", entityId: "t1", diff: { driverId: { from: "d1", to: "d2" }, phone: "+919876543210" } })
    const mine = await scopedDb(A).auditLog.select()
    const theirs = await scopedDb(B).auditLog.select()
    expect(mine).toHaveLength(1)
    expect(theirs).toHaveLength(0)
    expect(JSON.stringify(mine[0].diff)).not.toContain("9876543210")
    expect(mine[0].at).toBeInstanceOf(Date)
  })

  it("cannot be edited or deleted, even by code that tries", async () => {
    await expect(unscopedDb.update(s.auditLog).set({ action: "hacked" })).rejects.toThrow()
    await expect(unscopedDb.delete(s.auditLog)).rejects.toThrow()
  })

  it("queues a notification with the recipient encrypted at rest, and builds the wa.me link from it", async () => {
    const id = await enqueue(scopedDb(A), { event: "driver_assigned", recipientType: "customer", recipient: "9876543210", channel: "wa_link", template: "driver_assigned", payload: { text: "Driver on the way" } })
    const [row] = await scopedDb(A).notifications.select()
    expect(row.id).toBe(id)
    expect(row.status).toBe("link_ready")
    expect(row.recipientEnc).not.toContain("9876543210")
    expect(JSON.stringify(row)).not.toContain("9876543210")
    expect(await waLinkFor(scopedDb(A), id)).toBe("https://wa.me/919876543210?text=Driver%20on%20the%20way")
    // Another dealer cannot read or link it.
    expect(await scopedDb(B).notifications.select()).toHaveLength(0)
    expect(await waLinkFor(scopedDb(B), id)).toBeNull()
  })

  it("keeps one opt-in per dealer, person and channel", async () => {
    const values = { recipientHash: "h".repeat(64), channel: "whatsapp" as const, source: "login" }
    await scopedDb(A).notificationOptins.insert(values)
    await expect(scopedDb(A).notificationOptins.insert(values)).rejects.toThrow()
    await scopedDb(B).notificationOptins.insert(values) // same person, another dealer: fine
  })
})
