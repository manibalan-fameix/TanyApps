import { type Mock, describe, expect, it, vi } from "vitest"

import { distanceKm, formatKm } from "../lib/core/geo/distance"
import { getGeoProvider } from "../lib/core/geo/provider"
import { validCoords } from "../lib/core/geo/validate"
import { type LiveFix, TOKEN_RE, hashRiderToken, isFresh, newRiderToken, toFix } from "../lib/core/tracking/fix"
import { type FixStore, type TrackerNamespace, createLiveLocation } from "../lib/core/tracking/live-location"

describe("geo", () => {
  it("accepts points in India and rejects the rest", () => {
    expect(validCoords(13.08, 80.27)).toBe(true)
    expect(validCoords(51.5, -0.12)).toBe(false)
    expect(validCoords(NaN, 80)).toBe(false)
    expect(validCoords("13", "80")).toBe(false)
  })

  it("measures Chennai to Tirupati at roughly 120 km as the crow flies", () => {
    const km = distanceKm({ lat: 13.0827, lng: 80.2707 }, { lat: 13.6288, lng: 79.4192 })
    expect(km).toBeGreaterThan(100)
    expect(km).toBeLessThan(130)
    expect(formatKm(0.5)).toBe("0.5")
    expect(formatKm(12.4)).toBe("12")
  })

  it("picks the provider named in GEO_PROVIDER and refuses unknown names", () => {
    expect(getGeoProvider().name).toBe("nominatim")
    expect(getGeoProvider("nominatim").name).toBe("nominatim")
    expect(() => getGeoProvider("mystery")).toThrow("Unknown GEO_PROVIDER")
  })
})

describe("tracking basics", () => {
  it("makes unguessable link tokens that match the accepted shape, and hashes them stably", async () => {
    const a = newRiderToken()
    expect(a).toMatch(TOKEN_RE)
    expect(newRiderToken()).not.toBe(a)
    expect(await hashRiderToken(a)).toBe(await hashRiderToken(a))
    expect(await hashRiderToken(a)).not.toContain(a)
  })

  it("keeps only real positions in India and rounds them", () => {
    expect(toFix({ lat: 13.0827123456, lng: 80.2707123456 }, 1000)).toEqual({ lat: 13.082712, lng: 80.270712, accuracy: null, heading: null, at: 1000 })
    expect(toFix({ lat: 40, lng: 80 })).toBeNull()
    expect(toFix({ lat: "x" })).toBeNull()
    expect(isFresh({ at: Date.now() - 10_000 })).toBe(true)
    expect(isFresh({ at: Date.now() - 60_000 })).toBe(false)
    expect(isFresh(null)).toBe(false)
  })
})

describe("createLiveLocation", () => {
  const fix = { lat: 13.1, lng: 80.2, accuracy: null, heading: null, at: 5 }
  const store = (): FixStore & { saved: unknown[]; dropped: string[] } => {
    const saved: unknown[] = []
    const dropped: string[] = []
    return {
      saved,
      dropped,
      save: async (d: string, e: string, f: LiveFix) => void saved.push([d, e, f]),
      read: async () => fix,
      readMany: async (_d: string, ids: string[]) => new Map<string, LiveFix>(ids.map((id) => [id, fix])),
      drop: async (_d: string, e: string) => void dropped.push(e),
    }
  }

  it("uses the fallback store when there is no Durable Object, and works when destructured", async () => {
    const fb = store()
    const { saveFix, readFix, readFixes, dropFix } = createLiveLocation(fb)
    await saveFix("d1", "e1", fix, null)
    expect(fb.saved).toEqual([["d1", "e1", fix]])
    expect(await readFix("d1", "e1", null)).toEqual(fix)
    expect([...(await readFixes("d1", ["e1", "e2"], null)).keys()]).toEqual(["e1", "e2"])
    await dropFix("d1", "e1", null)
    expect(fb.dropped).toEqual(["e1"])
  })

  it("talks to the object named dealer:entity, and falls back to the store when it throws", async () => {
    const names: string[] = []
    type Obj = { put: Mock<(f: LiveFix) => Promise<void>>; get: Mock<() => Promise<LiveFix | null>>; clear: Mock<() => Promise<void>> }
    const objects = new Map<string, Obj>()
    const ns: TrackerNamespace = {
      idFromName: (n) => (names.push(n), n),
      get: (id) => {
        const o: Obj = objects.get(String(id)) ?? { put: vi.fn<(f: LiveFix) => Promise<void>>(async () => {}), get: vi.fn(async () => fix), clear: vi.fn(async () => {}) }
        objects.set(String(id), o)
        return o
      },
    }
    const fb = store()
    const { saveFix, readFixes, dropFix } = createLiveLocation(fb)
    await saveFix("d1", "e1", fix, ns)
    expect(names).toEqual(["d1:e1"])
    expect(fb.saved).toEqual([])

    objects.get("d1:e1")!.put.mockRejectedValueOnce(new Error("down"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    await saveFix("d1", "e1", fix, ns)
    expect(fb.saved).toHaveLength(1)

    expect([...(await readFixes("d1", ["e1"], ns)).keys()]).toEqual(["e1"])
    await dropFix("d1", "e1", ns)
    expect(objects.get("d1:e1")!.clear).toHaveBeenCalled()
    expect(fb.dropped).toEqual(["e1"])
  })
})
