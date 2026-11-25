import { describe, expect, it } from "vitest"

import { compareValues, matchesFilter, matchesSearch } from "@/components/data-table/data-grid-filters"

describe("list column filters", () => {
  it("keeps only the ticked values", () => {
    expect(matchesFilter("new", { values: ["new", "preparing"] })).toBe(true)
    expect(matchesFilter("cancelled", { values: ["new"] })).toBe(false)
    expect(matchesFilter(3, { values: ["3"] })).toBe(true)
  })
  it("keeps numbers inside the limits, and drops blanks once a limit is set", () => {
    expect(matchesFilter(150, { min: "100", max: "200" })).toBe(true)
    expect(matchesFilter(99, { min: "100" })).toBe(false)
    expect(matchesFilter(0, { max: "10" })).toBe(true)
    expect(matchesFilter(null, { max: "10" })).toBe(false)
    expect(matchesFilter(null, {})).toBe(true)
  })
  it("compares whole days, first and last included", () => {
    const at = new Date(2026, 10, 24, 23, 30).toISOString()
    expect(matchesFilter(at, { from: "2026-11-24", to: "2026-11-24" })).toBe(true)
    expect(matchesFilter(at, { from: "2026-11-25" })).toBe(false)
    expect(matchesFilter(null, { to: "2026-11-25" })).toBe(false)
  })
})

describe("list search and sorting", () => {
  it("needs every word, in any order and any case", () => {
    expect(matchesSearch(["Amul Butter 100g", "Dairy", 58], "butter AMUL")).toBe(true)
    expect(matchesSearch(["Amul Butter 100g", "Dairy"], "butter staples")).toBe(false)
    expect(matchesSearch(["x"], "")).toBe(true)
  })
  it("puts blanks first and sorts numbers inside text naturally", () => {
    expect([10, null, 2].sort(compareValues)).toEqual([null, 2, 10])
    expect(["Item 10", "item 2"].sort(compareValues)).toEqual(["item 2", "Item 10"])
  })
})
