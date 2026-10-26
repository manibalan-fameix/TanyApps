// Live test: only the Tany team can close a payment exception, and what they type is recorded with who they are.
// Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database (see docs/staging/neon-test-database.md).
import { randomBytes } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()
const who = vi.hoisted(() => ({ admin: null as string | null }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/super/guard", () => ({
  requireSuperAdmin: async () => {
    if (!who.admin) throw new Error("NEXT_NOT_FOUND") // what the real guard does for anyone who is not on the Tany list (a 404)
    return { email: who.admin }
  },
  superAdminActor: async () => {
    if (!who.admin) throw new Error("NEXT_NOT_FOUND")
    return { email: who.admin, uid: "uid-ops" }
  },
}))

describe.skipIf(!url)("payment exceptions: who can close them (live database)", () => {
  let actions: typeof import("../app/(super)/super/payments/actions")
  let ex: typeof import("../lib/core/payment-exceptions")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  const tag = randomBytes(3).toString("hex")
  let n = 0

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    actions = await import("../app/(super)/super/payments/actions")
    ex = await import("../lib/core/payment-exceptions")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
  })
  afterAll(async () => {
    await pool.end()
  })
  const make = async () => {
    const ref = `pay_adm_${tag}_${++n}`
    await ex.recordException({ kind: "unmatched_payment", ref, detail: "test" })
    return (await unscopedDb.select().from(s.paymentExceptions).where(eq(s.paymentExceptions.ref, ref)))[0]
  }
  const get = async (id: string) => (await unscopedDb.select().from(s.paymentExceptions).where(eq(s.paymentExceptions.id, id)))[0]

  it("someone who is not on the Tany team cannot resolve anything, and nothing changes", async () => {
    const e = await make()
    who.admin = null
    await expect(actions.resolvePaymentException(e.id, "I did something")).rejects.toThrow("NEXT_NOT_FOUND")
    expect((await get(e.id)).status).toBe("open")
  })
  it("a Tany team member resolves it, and their email and note are recorded", async () => {
    const e = await make()
    who.admin = "ops@tany.in"
    expect(await actions.resolvePaymentException(e.id, "Refunded in the Razorpay dashboard")).toEqual({ ok: true })
    const after = await get(e.id)
    expect([after.status, after.resolvedBy, after.resolution]).toEqual(["resolved", "ops@tany.in", "Refunded in the Razorpay dashboard"])
    expect(after.resolvedAt).not.toBeNull()
    // The resolution is also in the platform security trail, attributed to the verified team member, without the free-text note.
    const trail = await unscopedDb.select().from(s.securityAuditEvents).where(and(eq(s.securityAuditEvents.action, "payment_exception.resolve"), eq(s.securityAuditEvents.targetId, e.id)))
    expect(trail).toHaveLength(1)
    expect(trail[0]).toMatchObject({ actorType: "super_admin", actorId: "uid-ops", actorLabel: "ops@tany.in", outcome: "success", targetType: "payment_exception" })
    expect(JSON.stringify(trail[0])).not.toContain("Refunded in the Razorpay dashboard")
  })
  it("a denied resolution leaves no trail row and changes nothing", async () => {
    const e = await make()
    who.admin = null
    await expect(actions.resolvePaymentException(e.id, "should not happen")).rejects.toThrow("NEXT_NOT_FOUND")
    expect(await unscopedDb.select().from(s.securityAuditEvents).where(eq(s.securityAuditEvents.targetId, e.id))).toHaveLength(0)
  })
  it("a note is required, an id must be real, and a second resolve is refused", async () => {
    const e = await make()
    who.admin = "ops@tany.in"
    expect(await actions.resolvePaymentException(e.id, "ok")).toEqual({ ok: false, error: "Say what you did, in a few words." })
    expect((await get(e.id)).status).toBe("open")
    for (const id of ["", "nope", "' OR 1=1 --", "00000000-0000-0000-0000-000000000000"]) {
      expect((await actions.resolvePaymentException(id, "a proper note")).ok).toBe(false)
    }
    expect(await actions.resolvePaymentException(e.id, "first resolution")).toEqual({ ok: true })
    expect(await actions.resolvePaymentException(e.id, "second resolution")).toEqual({ ok: false, error: "Already resolved." })
    expect((await get(e.id)).resolution).toBe("first resolution")
  })
  it("the list shows open items first-class and keeps the resolved ones for the record", async () => {
    const open = await make()
    const done = await make()
    who.admin = "ops@tany.in"
    await actions.resolvePaymentException(done.id, "handled by hand")
    const openIds = (await ex.listExceptions({ status: "open" })).map((x) => x.id)
    const resolvedIds = (await ex.listExceptions({ status: "resolved", limit: 500 })).map((x) => x.id)
    expect(openIds).toContain(open.id)
    expect(openIds).not.toContain(done.id)
    expect(resolvedIds).toContain(done.id)
  })
})
