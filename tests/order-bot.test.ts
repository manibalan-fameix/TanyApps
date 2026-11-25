import { describe, expect, it } from "vitest"

import { greeting, respond, type BotContext } from "@/lib/restaurant/order-bot"
import type { StoreDish } from "@/lib/restaurant/storefront"
import { storeTerms } from "@/lib/verticals/terms"

const dish = (o: Partial<StoreDish>): StoreDish => ({
  id: "d1", name: "Paneer Tikka", description: "", price: 200, compareAt: null, portions: [], imageUrl: null, isVeg: true,
  isAvailable: true, isFeatured: false, categoryId: "c1", categoryName: "Starters", details: {}, ...o,
})
const ctx = (o: Partial<BotContext> = {}): BotContext => ({
  dishes: [dish({}), dish({ id: "d2", name: "Biryani", isVeg: false, portions: [{ label: "Half", price: 150 }, { label: "Full", price: 280 }] })],
  categories: [{ id: "c1", name: "Starters", slug: "starters", count: 2 }],
  canOrder: true, terms: storeTerms("restaurants"), cart: [], ...o,
})

describe("order bot", () => {
  it("offers the main choices", () => {
    expect(greeting(ctx()).options.map((o) => o.label)).toContain("Browse menu")
  })
  it("shows the sizes of a dish with several portions", () => {
    const m = respond({ t: "dish", id: "d2" }, ctx()).media
    expect(m?.kind === "portions" && m.dish.portions.map((p) => p.label)).toEqual(["Half", "Full"])
  })
  it("won't open a dish when orders are closed or it is unavailable", () => {
    expect(respond({ t: "dish", id: "d1" }, ctx({ canOrder: false })).media).toBeUndefined()
    expect(respond({ t: "dish", id: "d1" }, ctx({ dishes: [dish({ isAvailable: false })] })).media).toBeUndefined()
  })
  it("shows category cards with a photo from the category's dishes", () => {
    const m = respond({ t: "categories" }, ctx({ dishes: [dish({ imageUrl: "/a.jpg" })] })).media
    expect(m?.kind === "categories" && m.items[0]).toMatchObject({ name: "Starters", slug: "starters", imageUrl: "/a.jpg" })
  })
  it("shows the live cart, or says it is empty", () => {
    const cart = [{ itemId: "d1", name: "Paneer Tikka", portion: null, price: 200, qty: 2 }]
    expect(respond({ t: "cart" }, ctx({ cart })).media).toEqual({ kind: "cart" })
    expect(respond({ t: "cart" }, ctx()).media).toBeUndefined()
  })
  it("searches by name", () => {
    const m = respond({ t: "search", q: "biry" }, ctx()).media
    expect(m?.kind === "dishes" && m.dishes.map((d) => d.name)).toEqual(["Biryani"])
    expect(respond({ t: "search", q: "zzz" }, ctx()).text).toContain("couldn't find")
  })
})
