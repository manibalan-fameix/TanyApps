import { beforeAll, describe, expect, it } from "vitest"

import { decrypt, encrypt, needsRekey, tryDecrypt } from "@/lib/crypto"

beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
})

describe("per-business encryption", () => {
  it("round-trips under the same business", () => {
    expect(decrypt(encrypt("+919876543210", "dealer-a"), "dealer-a")).toBe("+919876543210")
  })
  it("refuses another business's id", () => {
    expect(() => decrypt(encrypt("secret", "dealer-a"), "dealer-b")).toThrow()
    expect(tryDecrypt(encrypt("secret", "dealer-a"), "dealer-b")).toBeNull()
  })
  it("refuses a v2 value with no business id", () => {
    expect(() => decrypt(encrypt("secret", "dealer-a"))).toThrow()
  })
  it("still reads legacy v1 values, with or without an id", () => {
    const old = encrypt("legacy")
    expect(old.startsWith("v1:")).toBe(true)
    expect(decrypt(old)).toBe("legacy")
    expect(decrypt(old, "dealer-a")).toBe("legacy")
    expect(needsRekey(old)).toBe(true)
    expect(needsRekey(encrypt("x", "dealer-a"))).toBe(false)
  })
})
