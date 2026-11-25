import { describe, expect, it } from "vitest"

import { HOME_SECTIONS, homepageSchema, readHomepage, rowProducts } from "@/lib/restaurant/homepage"

const products = ["a", "b", "c"].map((id) => ({ id }))

describe("home page layout", () => {
  it("keeps the shipped layout when nothing was saved, or the saved value is unreadable", () => {
    for (const stored of [null, {}, { homepage: "junk" }]) {
      const home = readHomepage(stored)
      expect(home.sections).toEqual(HOME_SECTIONS.map((id) => ({ id, visible: true })))
      expect(home.picks.productIds).toEqual([])
    }
  })
  it("keeps the owner's order and visibility, adding any section that is missing and dropping repeats", () => {
    const home = readHomepage({ homepage: { sections: [{ id: "offers", visible: true }, { id: "banners", visible: false }, { id: "offers", visible: false }] } })
    expect(home.sections.map((s) => s.id)).toEqual(["offers", "banners", "categories", "picks", "catalogue"])
    expect(home.sections[1].visible).toBe(false)
  })
  it("refuses unknown sections, long headings and too many products", () => {
    expect(homepageSchema.safeParse({ sections: [{ id: "popup", visible: true }] }).success).toBe(false)
    expect(homepageSchema.safeParse({ picks: { title: "x".repeat(61) } }).success).toBe(false)
    expect(homepageSchema.safeParse({ picks: { productIds: Array(13).fill("3f0c2f0e-1111-4222-8333-123456789012") } }).success).toBe(false)
  })
  it("shows chosen products in the owner's order and falls back to automatic ones", () => {
    expect(rowProducts(["c", "a"], products, products, []).map((p) => p.id)).toEqual(["c", "a"])
    expect(rowProducts([], products, products, [products[1]])).toEqual([products[1]])
    expect(rowProducts(["gone"], products, products, [products[1]])).toEqual([products[1]])
  })
  it("does not swap in other products when a filter hides the chosen ones", () => {
    expect(rowProducts(["a"], products, [products[1]], products)).toEqual([])
  })
})
