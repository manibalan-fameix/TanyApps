import { describe, expect, it } from "vitest"

import { estimateRefund, lineStates, photoNeeded, readReturnSettings, reasonsFor, refundLimit, returnsConfigured, selectionError, windowHoursFor, type PriorReturn, type ReturnOrder } from "../lib/returns/rules"

const delivered = new Date("2026-11-20T10:00:00Z")
const after = (h: number) => new Date(delivered.getTime() + h * 3_600_000)

const order: ReturnOrder = {
  status: "completed",
  lines: [
    { itemId: "a", name: "Atta", portion: null, price: 200, qty: 1 },
    { itemId: "b", name: "Apple", portion: null, price: 100, qty: 1 },
  ],
  subtotal: 300,
  discount: 30,
  gst: 14,
  deliveryFee: 25,
  tip: 0,
  total: 309,
  deliveredAt: delivered,
  updatedAt: delivered,
}
const categories: Record<string, { id: string; name: string }> = { a: { id: "c1", name: "Atta & Rice" }, b: { id: "c2", name: "Fresh Fruits" } }
const categoryOf = (id: string) => categories[id] ?? null
const settings = readReturnSettings({})

describe("return settings", () => {
  it("is off and unconfigured until the owner saves it", () => {
    expect(settings.enabled).toBe(false)
    expect(returnsConfigured({ homepage: {} })).toBe(false)
    expect(returnsConfigured({ returns: { enabled: false } })).toBe(true)
    expect(readReturnSettings({ returns: { enabled: "yes" } }).enabled).toBe(false)
  })
  it("gives fresh food 24 hours and the rest 3 days, unless the owner says otherwise", () => {
    expect(windowHoursFor(categories.b, settings, "retail")).toBe(24)
    expect(windowHoursFor(categories.a, settings, "retail")).toBe(72)
    expect(windowHoursFor(categories.b, { ...settings, categoryHours: { c2: 6 } }, "retail")).toBe(6)
  })
  it("offers restaurants only missing, wrong and spoiled, and changed-my-mind only when switched on", () => {
    expect(reasonsFor("restaurants", settings)).toEqual(["wrong_item", "missing_item", "expired"])
    expect(reasonsFor("retail", settings)).not.toContain("changed_mind")
  })
  it("never asks for a photo of a missing item", () => {
    expect(photoNeeded("damaged", settings)).toBe(true)
    expect(photoNeeded("missing_item", { ...settings, photoReasons: ["missing_item"] })).toBe(false)
  })
})

describe("what can be returned", () => {
  it("closes each item by its own window", () => {
    const states = lineStates(order, categoryOf, settings, "retail", [], after(30))
    expect(states.map((s) => s.blocked)).toEqual([null, "window"])
    expect(selectionError([{ position: 1, qty: 1 }], states)).toMatch(/24 hours/)
  })
  it("blocks ticked categories and quantities already reported", () => {
    const prior: PriorReturn[] = [{ lines: [{ position: 1, qty: 1 }], reason: "damaged", requested: 94, approved: 94 }]
    const states = lineStates(order, categoryOf, { ...settings, blockedCategories: ["c1"] }, "retail", prior, after(1))
    expect(states.map((s) => s.blocked)).toEqual(["category", "returned"])
  })
  it("refuses empty, repeated, unknown and excessive selections", () => {
    const states = lineStates(order, categoryOf, settings, "retail", [], after(1))
    expect(selectionError([], states)).toBeTruthy()
    expect(selectionError([{ position: 0, qty: 2 }], states)).toBeTruthy()
    expect(selectionError([{ position: 0, qty: 0.5 }], states)).toBeTruthy()
    expect(selectionError([{ position: 9, qty: 1 }], states)).toBeTruthy()
    expect(selectionError([{ position: 0, qty: 1 }, { position: 0, qty: 1 }], states)).toBeTruthy()
    expect(selectionError([{ position: 0, qty: 1 }], states)).toBeNull()
  })
})

describe("refund amount", () => {
  it("matches the example in the design: ₹94 for the ₹100 item", () => {
    expect(estimateRefund(order, [{ position: 1, qty: 1 }], "damaged", []).amount).toBe(94)
  })
  it("returns everything paid, delivery included, when the whole order is the shop's fault", () => {
    expect(estimateRefund(order, [{ position: 0, qty: 1 }, { position: 1, qty: 1 }], "damaged", [])).toMatchObject({ amount: 309, deliveryFee: 25 })
  })
  it("keeps the delivery fee when the customer changed their mind", () => {
    expect(estimateRefund(order, [{ position: 0, qty: 1 }, { position: 1, qty: 1 }], "changed_mind", []).amount).toBe(284)
  })
  it("gives the rounding left over to the return that completes the order, so the parts add up", () => {
    const first = estimateRefund(order, [{ position: 1, qty: 1 }], "damaged", [])
    const prior: PriorReturn[] = [{ lines: [{ position: 1, qty: 1 }], reason: "damaged", requested: first.amount, approved: first.amount }]
    const second = estimateRefund(order, [{ position: 0, qty: 1 }], "damaged", prior)
    expect(first.amount + second.amount).toBe(309)
  })
  it("does not hand back what the shop lowered, and never passes what was paid", () => {
    const prior: PriorReturn[] = [{ lines: [{ position: 1, qty: 1 }], reason: "damaged", requested: 94, approved: 50 }]
    expect(estimateRefund(order, [{ position: 0, qty: 1 }], "damaged", prior).amount).toBe(215)
    const raised: PriorReturn[] = [{ ...prior[0], approved: 300 }]
    expect(estimateRefund(order, [{ position: 0, qty: 1 }], "damaged", raised).amount).toBe(9)
  })
  it("never takes back the tip", () => {
    expect(refundLimit({ total: 329, tip: 20 }, [])).toBe(309)
  })
})
