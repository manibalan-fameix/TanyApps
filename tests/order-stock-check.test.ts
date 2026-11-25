import { describe, expect, it } from "vitest"

import { orderStockProblems } from "../lib/restaurant/stock"

const line = (qty = 2, itemId = "a") => ({ itemId, name: "Rice", qty })
const item = (stockQuantity: number | null, isAvailable = true) => ({ id: "a", stockQuantity, isAvailable })
const set = (n: number) => new Map([["a", n]])

describe("orderStockProblems", () => {
  it("passes an order whose stock was set aside", () => {
    expect(orderStockProblems([line()], [item(5)], set(2))).toEqual([])
  })
  it("passes the order that took the last units, leaving the dish unavailable", () => {
    expect(orderStockProblems([line()], [item(0, false)], set(2))).toEqual([])
  })
  it("passes an untracked dish that is available, and holds it once marked sold out", () => {
    expect(orderStockProblems([line()], [item(null)], new Map())).toEqual([])
    expect(orderStockProblems([line()], [item(null, false)], new Map())).toEqual(["Rice is marked sold out."])
  })
  it("holds a tracked dish that was switched off while stock remains", () => {
    expect(orderStockProblems([line()], [item(3, false)], set(2))).toEqual(["Rice is marked sold out."])
  })
  it("holds an order whose stock was not fully set aside", () => {
    expect(orderStockProblems([line()], [item(10)], set(1))).toHaveLength(1)
  })
  it("counts two portions of one dish together", () => {
    expect(orderStockProblems([line(1), line(2)], [item(4)], set(2))).toHaveLength(1)
    expect(orderStockProblems([line(1), line(2)], [item(4)], set(3))).toEqual([])
  })
  it("holds a removed dish and an empty order", () => {
    expect(orderStockProblems([line()], [], set(2))).toEqual(["Rice is no longer on the menu."])
    expect(orderStockProblems([], [], new Map())).toEqual(["This order has no items."])
  })
})
