import { describe, expect, it } from "vitest"
import type { z } from "zod"

import { matchDishesFromImage } from "@/lib/ai/dish-match"
import type { VisionClient } from "@/lib/ai/vision"
import { imageReply, type BotContext } from "@/lib/restaurant/order-bot"
import type { StoreDish } from "@/lib/restaurant/storefront"
import { storeTerms } from "@/lib/verticals/terms"

const img = { mediaType: "image/jpeg" as const, base64: "AA==" }
const menu = [{ id: "a", name: "Biryani", category: "Mains" }, { id: "b", name: "Naan", category: "Breads" }]
const fake = (matches: string[]): VisionClient => ({
  async json<T>(req: { validate: z.ZodType<T> }) {
    return req.validate.parse({ matches }) as T
  },
})

describe("matchDishesFromImage", () => {
  it("keeps only ids that are on the menu, once each", async () => {
    expect(await matchDishesFromImage(fake(["b", "zzz", "b", "a"]), img, menu)).toEqual(["b", "a"])
  })
  it("returns null when there is no model or no menu", async () => {
    expect(await matchDishesFromImage(null, img, menu)).toBeNull()
    expect(await matchDishesFromImage(fake(["a"]), img, [])).toBeNull()
  })
})

const dish = (id: string, o: Partial<StoreDish> = {}): StoreDish => ({ id, name: id, description: "", price: 100, compareAt: null, portions: [], imageUrl: null, isVeg: true, isAvailable: true, isFeatured: false, categoryId: null, categoryName: "", details: {}, ...o })
const ctx: BotContext = { dishes: [dish("a"), dish("b", { isAvailable: false })], categories: [], canOrder: true, terms: storeTerms("restaurants"), cart: [] }

describe("imageReply", () => {
  it("shows matched, available dishes as cards", () => {
    const m = imageReply(["a", "b"], ctx).media
    expect(m?.kind === "dishes" && m.dishes.map((d) => d.id)).toEqual(["a"])
  })
  it("falls back to the main menu with no match or no answer", () => {
    expect(imageReply([], ctx).media).toBeUndefined()
    expect(imageReply(null, ctx).text).toContain("couldn't look")
  })
})
