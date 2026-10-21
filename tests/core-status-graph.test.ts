import { describe, expect, it } from "vitest"

import { IllegalTransitionError, defineStatusGraph } from "../lib/core/status-graph"
import { FULFILMENTS } from "../lib/restaurant/settings"
import { ORDER_STATUSES, type OrderStatus, nextStatuses, orderGraph, timelineFor } from "../lib/restaurant/orders"
import type { Fulfilment } from "../lib/restaurant/settings"

describe("defineStatusGraph", () => {
  const g = defineStatusGraph<"a" | "b" | "c">({ a: ["b", "c"], b: ["c"], c: [] })

  it("lists states and the allowed moves", () => {
    expect(g.states).toEqual(["a", "b", "c"])
    expect(g.next("a")).toEqual(["b", "c"])
    expect(g.canMove("a", "c")).toBe(true)
    expect(g.canMove("b", "a")).toBe(false)
    expect(g.canMove("c", "a")).toBe(false)
    expect(g.isTerminal("c")).toBe(true)
    expect(g.isTerminal("a")).toBe(false)
  })

  it("assertMove returns the target or throws a typed error", () => {
    expect(g.assertMove("a", "b")).toBe("b")
    expect(() => g.assertMove("c", "a")).toThrow(IllegalTransitionError)
  })

  it("rejects a graph that points at an undefined state", () => {
    expect(() => defineStatusGraph<"a">({ a: ["zzz" as "a"] })).toThrow("not a state")
  })

  it("treats an unknown current state as having no moves", () => {
    expect(g.next("nope" as "a")).toEqual([])
    expect(g.canMove("nope" as "a", "b")).toBe(false)
  })
})

// The pre-refactor implementation, kept verbatim as the reference the graph must match.
function legacyNextStatuses(status: OrderStatus, fulfilment: Fulfilment): OrderStatus[] {
  if (status === "completed" || status === "cancelled") return []
  if (status === "pending_payment") return ["cancelled"]
  const line = timelineFor(fulfilment)
  const i = line.indexOf(status)
  const forward = i >= 0 && i < line.length - 1 ? [line[i + 1]] : []
  return [...forward, "cancelled"]
}

describe("order lifecycle on the status graph", () => {
  for (const fulfilment of FULFILMENTS) {
    it(`matches the old nextStatuses for every status (${fulfilment})`, () => {
      for (const status of ORDER_STATUSES) {
        expect(nextStatuses(status, fulfilment), `${fulfilment}:${status}`).toEqual(legacyNextStatuses(status, fulfilment))
      }
    })
  }

  it("walks a delivery order from new to completed and nowhere else", () => {
    const g = orderGraph("delivery")
    expect(g.canMove("new", "confirmed")).toBe(true)
    expect(g.canMove("preparing", "out_for_delivery")).toBe(true)
    expect(g.canMove("preparing", "ready")).toBe(false)
    expect(g.canMove("out_for_delivery", "completed")).toBe(true)
    expect(g.canMove("completed", "cancelled")).toBe(false)
    expect(g.isTerminal("cancelled")).toBe(true)
  })

  it("lets an unpaid online order only be dropped", () => {
    expect(orderGraph("pickup").next("pending_payment")).toEqual(["cancelled"])
  })
})
