import { describe, expect, it } from "vitest"

import { getPrivateStorage, privateStorageAvailable } from "../../lib/storage"
import { DOC_TYPES, isOwnPrivateKey, isDocType, parsePrivateKey, privateKey, sniffDocType } from "../../lib/media/documents"

const D = "11111111-1111-4111-8111-111111111111"
const E = "22222222-2222-4222-8222-222222222222"
const ID = "33333333-3333-4333-8333-333333333333"
const bytes = (...b: number[]) => new Uint8Array(b)

describe("document type sniffing", () => {
  it("recognises PDF, JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffDocType(new TextEncoder().encode("%PDF-1.7\n..."))).toBe("application/pdf")
    expect(sniffDocType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe("image/jpeg")
    expect(sniffDocType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png")
    expect(sniffDocType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp")
  })
  it("refuses anything else, including scripts and HTML dressed up as a PDF", () => {
    expect(sniffDocType(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull()
    expect(sniffDocType(new TextEncoder().encode("#!/bin/sh\nrm -rf /"))).toBeNull()
    expect(sniffDocType(new TextEncoder().encode("PK\u0003\u0004zip"))).toBeNull()
    expect(sniffDocType(new Uint8Array(0))).toBeNull()
    expect(sniffDocType(bytes(0x25, 0x50, 0x44))).toBeNull() // truncated
    expect(sniffDocType(new TextEncoder().encode("RIFF\0\0\0\0WAVEfmt "))).toBeNull() // RIFF but not WebP
  })
  it("lists the accepted types", () => {
    expect([...DOC_TYPES].sort()).toEqual(["application/pdf", "image/jpeg", "image/png", "image/webp"])
    expect(isDocType("application/pdf")).toBe(true)
    expect(isDocType("image/svg+xml")).toBe(false)
    expect(isDocType("text/html")).toBe(false)
  })
})

describe("private keys", () => {
  it("are built under the owner's own prefix with a random name and the right extension", () => {
    expect(privateKey(D, "vehicle-doc", ID, "application/pdf")).toBe(`dealers/${D}/private/vehicle-doc/${ID}.pdf`)
    expect(privateKey(D, "driver-doc", ID, "image/jpeg")).toBe(`dealers/${D}/private/driver-doc/${ID}.jpg`)
  })
  it("round-trip through parsePrivateKey", () => {
    expect(parsePrivateKey(privateKey(D, "driver-doc", ID, "image/png"))).toEqual({ dealerId: D, kind: "driver-doc", type: "image/png" })
  })
  it("reject anything that is not exactly that shape", () => {
    for (const bad of [
      `dealers/${D}/private/vehicle-doc/${ID}.exe`,
      `dealers/${D}/private/vehicle-doc/../${ID}.pdf`,
      `dealers/${D}/private/other/${ID}.pdf`,
      `dealers/${D}/vehicle-doc/${ID}.pdf`,
      `dealers/${D}/private/vehicle-doc/${ID}.pdf/extra`,
      `dealers/${D}/private/vehicle-doc/name.pdf`,
      `../dealers/${D}/private/vehicle-doc/${ID}.pdf`,
      "",
    ]) expect(parsePrivateKey(bad), bad).toBeNull()
  })
  it("may only be saved by the business that owns them, in the right folder; no file is fine", () => {
    const mine = privateKey(D, "vehicle-doc", ID, "application/pdf")
    expect(isOwnPrivateKey(D, "vehicle-doc", mine)).toBe(true)
    expect(isOwnPrivateKey(E, "vehicle-doc", mine)).toBe(false) // another business's file
    expect(isOwnPrivateKey(D, "driver-doc", mine)).toBe(false) // wrong folder
    expect(isOwnPrivateKey(D, "vehicle-doc", "https://evil.example/x.pdf")).toBe(false)
    expect(isOwnPrivateKey(D, "vehicle-doc", null)).toBe(true)
    expect(isOwnPrivateKey(D, "vehicle-doc", "")).toBe(true)
  })
})

describe("private storage", () => {
  const r2 = { R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c" }
  it("never falls back to the public bucket in production", () => {
    expect(() => getPrivateStorage({ ...r2, R2_BUCKET: "public-media", NODE_ENV: "production" })).toThrow("R2_PRIVATE_BUCKET")
    expect(privateStorageAvailable({ ...r2, R2_BUCKET: "public-media", NODE_ENV: "production" })).toBe(false)
  })
  it("uses its own bucket when set, and local disk only in development", () => {
    expect(getPrivateStorage({ ...r2, R2_PRIVATE_BUCKET: "tany-private", NODE_ENV: "production" }).kind).toBe("r2")
    expect(getPrivateStorage({ NODE_ENV: "development" }).kind).toBe("local")
    expect(privateStorageAvailable({ NODE_ENV: "development" })).toBe(true)
  })
})
