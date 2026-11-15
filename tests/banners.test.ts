import { describe, expect, it } from "vitest"

import { bannerSchema, cleanLink, isExternalLink, readTone } from "../lib/restaurant/banners"

describe("banner links", () => {
  it("keeps pages on the restaurant's own site and https links", () => {
    expect(cleanLink("/menu")).toBe("/menu")
    expect(cleanLink("/category/rice-biryani")).toBe("/category/rice-biryani")
    expect(cleanLink("https://example.com/offer")).toBe("https://example.com/offer")
    expect(cleanLink("")).toBe("")
  })
  it("drops anything that could run code or leave the site unexpectedly", () => {
    for (const bad of ["javascript:alert(1)", "//evil.example", "http://example.com", "data:text/html,x", "/a b", "/\\evil", "menu"]) expect(cleanLink(bad)).toBe("")
  })
  it("tells external links from site pages", () => {
    expect(isExternalLink("https://example.com")).toBe(true)
    expect(isExternalLink("/menu")).toBe(false)
  })
})

describe("banner fields", () => {
  it("needs a title and keeps the text short", () => {
    expect(bannerSchema.safeParse({ title: "" }).success).toBe(false)
    expect(bannerSchema.safeParse({ title: "x".repeat(51) }).success).toBe(false)
    expect(bannerSchema.safeParse({ title: "Weekend feast", subtitle: "x".repeat(91) }).success).toBe(false)
    expect(bannerSchema.safeParse({ title: "Weekend feast", buttonLabel: "x".repeat(21) }).success).toBe(false)
    expect(bannerSchema.parse({ title: "Weekend feast" })).toMatchObject({ subtitle: "", buttonLabel: "", linkUrl: "", tone: "soft" })
  })
  it("falls back to the soft tone for unknown values", () => {
    expect(readTone("bold")).toBe("bold")
    expect(readTone("neon")).toBe("soft")
  })
})
