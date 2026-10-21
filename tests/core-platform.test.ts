import { randomBytes } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { blindIndex, normalizePhone, phoneHash } from "../lib/crypto/blind-index"
import { decrypt } from "../lib/crypto"
import { audit, diffOf, isSensitiveKey, redactDiff } from "../lib/core/audit"
import { enqueue, waLinkFor } from "../lib/core/notifications/outbox"
import type { ScopedDb } from "../lib/db/scoped"

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"))
  vi.stubEnv("BLIND_INDEX_KEY", randomBytes(32).toString("base64"))
})

describe("blind index", () => {
  it("is stable for the same input and differs by value, purpose and key", () => {
    const a = phoneHash("+919876543210")
    expect(a).toBe(phoneHash("+919876543210"))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(phoneHash("+919876543211"))
    expect(blindIndex("phone", "x")).not.toBe(blindIndex("licence", "x"))
    vi.stubEnv("BLIND_INDEX_KEY", randomBytes(32).toString("base64"))
    expect(phoneHash("+919876543210")).not.toBe(a)
  })

  it("does not contain the value it hides", () => {
    expect(phoneHash("+919876543210")).not.toContain("9876543210")
  })

  it("refuses to run without a proper key", () => {
    vi.stubEnv("BLIND_INDEX_KEY", "")
    expect(() => phoneHash("+919876543210")).toThrow("BLIND_INDEX_KEY")
    vi.stubEnv("BLIND_INDEX_KEY", Buffer.from("short").toString("base64"))
    expect(() => phoneHash("+919876543210")).toThrow("32 bytes")
  })

  it("normalises Indian mobile numbers to E.164 and rejects the rest", () => {
    for (const v of ["9876543210", "+91 98765 43210", "09876543210", "91-9876543210"]) expect(normalizePhone(v)).toBe("+919876543210")
    for (const v of ["12345", "5876543210", "+14155550100", ""]) expect(normalizePhone(v)).toBeNull()
  })
})

describe("audit redaction", () => {
  it("recognises sensitive fields by whole words, not substrings", () => {
    for (const k of ["phone", "customerPhone", "pickup_lat", "pickupLng", "REG-NUMBER", "licenceNo", "email", "addressLine", "otpHash", "recipient_enc"]) expect(isSensitiveKey(k), k).toBe(true)
    for (const k of ["template", "status", "region", "platform", "totalPaise", "reason", "vehicleId"]) expect(isSensitiveKey(k), k).toBe(false)
  })

  it("records what changed but only that a sensitive field changed, never its value", () => {
    const d = diffOf({ status: "assigned", driverId: "d1", phone: "+919876543210", same: 1 }, { status: "in_trip", driverId: "d2", phone: "+919000000000", same: 1 })
    expect(d).toEqual({
      status: { from: "assigned", to: "in_trip" },
      driverId: { from: "d1", to: "d2" },
      phone: { from: "[redacted]", to: "[redacted]" },
    })
    expect(JSON.stringify(d)).not.toContain("9876543210")
  })

  it("redacts nested and listed values in hand-built diffs and caps their depth", () => {
    const r = redactDiff({ a: { email: "x@y.z", ok: 1 }, list: [{ token: "t" }], deep: { a: { b: { c: { d: { e: 1 } } } } } }) as Record<string, unknown>
    expect(JSON.stringify(r)).not.toContain("x@y.z")
    expect(JSON.stringify(r)).not.toContain('"t"')
    expect(JSON.stringify(r)).toContain("[truncated]")
  })
})

/** A ScopedDb stand-in that records what is inserted. */
function fakeDb() {
  const rows: Record<string, Record<string, unknown>[]> = { auditLog: [], notifications: [] }
  const repo = (name: string) => ({
    insert: (values: Record<string, unknown>) => {
      rows[name].push(values)
      return Object.assign(Promise.resolve(), { returning: async () => [{ id: `${name}-${rows[name].length}` }] })
    },
    select: () => Promise.resolve(rows[name]),
  })
  return { rows, db: { auditLog: repo("auditLog"), notifications: repo("notifications") } as unknown as ScopedDb }
}

describe("audit()", () => {
  it("appends an entry with sensitive diff fields redacted and long values trimmed", async () => {
    const { db, rows } = fakeDb()
    await audit(db, { actorType: "user", actorId: "u1", action: "fare.adjust", entity: "trip", entityId: "t1", diff: { totalPaise: { from: 100, to: 90 }, phone: "+919876543210" } })
    expect(rows.auditLog).toHaveLength(1)
    expect(rows.auditLog[0]).toMatchObject({ actorType: "user", actorId: "u1", action: "fare.adjust", entity: "trip", entityId: "t1" })
    expect(JSON.stringify(rows.auditLog[0].diff)).not.toContain("9876543210")
    expect((rows.auditLog[0].diff as { totalPaise: unknown }).totalPaise).toEqual({ from: 100, to: 90 })
  })

  it("replaces an enormous diff with a summary instead of storing it", async () => {
    const { db, rows } = fakeDb()
    await audit(db, { actorType: "system", actorId: "cron", action: "x.y", entity: "e", entityId: "1", diff: { blob: "x".repeat(20_000) } })
    expect(rows.auditLog[0].diff).toEqual({ truncated: true, keys: ["blob"] })
  })
})

describe("notification outbox", () => {
  it("stores the recipient encrypted with a keyed hash, and a wa_link is ready without a worker", async () => {
    const { db, rows } = fakeDb()
    await enqueue(db, { event: "driver_assigned", recipientType: "customer", recipient: "98765 43210", channel: "wa_link", template: "driver_assigned", payload: { text: "Your driver is on the way" } })
    const row = rows.notifications[0]
    expect(row.status).toBe("link_ready")
    expect(row.recipientEnc).not.toContain("9876543210")
    expect(decrypt(String(row.recipientEnc))).toBe("+919876543210")
    expect(row.recipientHash).toBe(phoneHash("+919876543210"))
    expect(JSON.stringify(row.payload)).not.toContain("9876543210")
  })

  it("leaves other channels pending for the sender, never dropping them", async () => {
    const { db, rows } = fakeDb()
    await enqueue(db, { event: "booking_confirmed", recipientType: "customer", recipient: "9876543210", channel: "whatsapp", template: "booking_confirmed" })
    expect(rows.notifications[0].status).toBe("pending")
  })

  it("rejects a recipient that is not a mobile number for a phone channel", async () => {
    const { db, rows } = fakeDb()
    await expect(enqueue(db, { event: "x", recipientType: "customer", recipient: "12345", channel: "sms", template: "t" })).rejects.toThrow("mobile number")
    expect(rows.notifications).toHaveLength(0)
  })

  it("hashes an email recipient case-insensitively", async () => {
    const { db, rows } = fakeDb()
    await enqueue(db, { event: "invoice", recipientType: "customer", recipient: "A@B.com", channel: "email", template: "invoice" })
    expect(rows.notifications[0].recipientHash).toBe(blindIndex("email", "a@b.com"))
  })

  it("builds the wa.me link on demand from the encrypted recipient", async () => {
    const { db } = fakeDb()
    await enqueue(db, { event: "e", recipientType: "customer", recipient: "9876543210", channel: "wa_link", template: "t", payload: { text: "Hi there" } })
    const link = await waLinkFor(db, "notifications-1")
    expect(link).toBe("https://wa.me/919876543210?text=Hi%20there")
  })
})
