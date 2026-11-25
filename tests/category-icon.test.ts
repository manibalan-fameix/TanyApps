import { Grid02Icon } from "@hugeicons/core-free-icons"
import { describe, expect, it } from "vitest"

import { categoryLook } from "@/lib/restaurant/category-icon"
import { retailTypeList } from "@/lib/verticals/retail-types"

describe("category icons", () => {
  it("gives every starter category of every kind of shop its own picture, not the fallback", () => {
    const missing = retailTypeList.flatMap((t) => t.starterCategories).filter((name) => categoryLook(name).icon === Grid02Icon)
    expect(missing).toEqual([])
  })
  it("covers the usual restaurant menu headings", () => {
    const names = ["Breakfast", "Dosa", "Biryani", "Starters", "Main Course", "Mains", "Soups", "Desserts", "Beverages", "Chicken Specials", "Seafood", "Pizza", "Burgers", "Noodles", "Salads", "Ice Cream", "Sweets", "Combos"]
    expect(names.filter((n) => categoryLook(n).icon === Grid02Icon)).toEqual([])
  })
  it("reads the particular word before the general one", () => {
    expect(categoryLook("Baby Care").icon).not.toBe(categoryLook("Personal Care").icon)
    expect(categoryLook("Kitchen & Home Needs").icon).not.toBe(categoryLook("Home & Cleaning").icon)
    expect(categoryLook("Women's Wear").icon).not.toBe(categoryLook("Men's Wear").icon)
    expect(categoryLook("Snacks & Beverages").icon).not.toBe(categoryLook("Staples").icon)
  })
  it("still shows something for a name it does not know", () => {
    expect(categoryLook("Zyx").icon).toBe(Grid02Icon)
  })
})
