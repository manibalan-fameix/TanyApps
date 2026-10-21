import { describe, expect, it } from "vitest"

import { cabsCopy, isLang } from "../../lib/cabs/lang"
import { cabsTa } from "../../lib/copy-ta"
import { copy } from "../../lib/copy"

const keys = (o: unknown, prefix = ""): string[] =>
  o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => (typeof v === "string" || typeof v === "function" ? [prefix + k] : keys(v, `${prefix}${k}.`))) : []

describe("customer text in English and Tamil", () => {
  it("has every English string in Tamil, and nothing extra", () => {
    expect(keys(cabsTa).sort()).toEqual(keys(copy.cabs).sort())
  })
  it("says that tolls and parking are extra, as actual, in both", () => {
    expect(cabsCopy("en").notices.tolls_parking_extra).toBe("Tolls & parking extra, as actual")
    expect(cabsCopy("ta").notices.tolls_parking_extra).toMatch(/[஀-௿]/) // Tamil script
    expect(cabsCopy("ta").notices.tolls_parking_extra).not.toBe(cabsCopy("en").notices.tolls_parking_extra)
  })
  it("falls back to English for anything unknown", () => {
    expect(cabsCopy(undefined)).toBe(copy.cabs)
    expect(cabsCopy("hi")).toBe(copy.cabs)
    expect(isLang("ta")).toBe(true)
    expect(isLang("hi")).toBe(false)
  })
})
