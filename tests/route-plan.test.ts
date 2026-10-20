import { describe, expect, it } from "vitest"

import { remainingRoute, type StoredRoute } from "../lib/restaurant/route-plan"

// A straight road running north for about 4.4 km (0.04 degrees of latitude), 20 minutes end to end.
const to = { lat: 13.04, lng: 80.2 }
const road: StoredRoute = {
  points: [[13.0, 80.2], [13.01, 80.2], [13.02, 80.2], [13.03, 80.2], [13.04, 80.2]],
  km: 4.4,
  minutes: 20,
  at: 1_000_000,
  to,
}

describe("remainingRoute", () => {
  it("reuses the stored road and shortens it as the rider moves along it", () => {
    const left = remainingRoute(road, { lat: 13.02, lng: 80.2 }, to, 1_000_000 + 60_000)
    expect(left).not.toBeNull()
    expect(left!.points[0][0]).toBeCloseTo(13.02, 4)
    expect(left!.points.at(-1)).toEqual([13.04, 80.2])
    expect(left!.km).toBeCloseTo(2.2, 0)
    expect(left!.minutes).toBeGreaterThanOrEqual(9)
    expect(left!.minutes).toBeLessThanOrEqual(11)
  })

  it("keeps working for a rider a few metres off the road (GPS drift)", () => {
    expect(remainingRoute(road, { lat: 13.015, lng: 80.2008 }, to, 1_000_000)).not.toBeNull()
  })

  it("asks for a new route when the rider has left the road", () => {
    expect(remainingRoute(road, { lat: 13.015, lng: 80.21 }, to, 1_000_000)).toBeNull()
  })

  it("asks for a new route when the destination moved", () => {
    expect(remainingRoute(road, { lat: 13.01, lng: 80.2 }, { lat: 13.05, lng: 80.2 }, 1_000_000)).toBeNull()
  })

  it("asks for a new route once it is ten minutes old", () => {
    expect(remainingRoute(road, { lat: 13.01, lng: 80.2 }, to, 1_000_000 + 10 * 60_000 + 1)).toBeNull()
  })

  it("has nothing to reuse when no route is stored", () => {
    expect(remainingRoute(null, { lat: 13.01, lng: 80.2 }, to)).toBeNull()
  })

  it("never reports less than one minute", () => {
    const left = remainingRoute(road, { lat: 13.0399, lng: 80.2 }, to, 1_000_000)
    expect(left!.minutes).toBe(1)
  })
})
