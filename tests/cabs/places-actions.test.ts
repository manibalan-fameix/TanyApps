import { beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.fn()
const limit = vi.fn()
const provider = { autocomplete: vi.fn(), details: vi.fn(), route: vi.fn() }
const getProvider = vi.fn()
const between = vi.fn()

vi.mock("@/lib/core/guards", () => ({ industrySession: (...a: unknown[]) => session(...a) }))
vi.mock("@/lib/core/rate-limit", () => ({ rateLimit: (...a: unknown[]) => limit(...a) }))
vi.mock("@/lib/core/geo/places-provider", () => ({ getPlacesProvider: () => getProvider() }))
vi.mock("@/lib/core/geo/route-cache", () => ({ routeBetween: (...a: unknown[]) => between(...a) }))

import { distanceBetween, placeDetails, searchPlaces } from "../../lib/cabs/places-actions"

const TOKEN = "3f2a5c1e-9b7d-4e2a-8c3f-1a2b3c4d5e6f"

beforeEach(() => {
  for (const m of [session, limit, getProvider, between, ...Object.values(provider)]) m.mockReset()
  session.mockResolvedValue({ dealer: { id: "d1" }, owner: true })
  limit.mockResolvedValue(true)
  getProvider.mockReturnValue(provider)
})

describe("searchPlaces", () => {
  it("needs a signed-in cab operator", async () => {
    session.mockResolvedValue(null)
    expect(await searchPlaces("chennai", TOKEN)).toEqual({ ok: false, error: "Please sign in again." })
    expect(session).toHaveBeenCalledWith("cabs")
    expect(provider.autocomplete).not.toHaveBeenCalled()
  })
  it("rejects a bad session token, answers short queries locally, and refuses very long ones", async () => {
    expect(await searchPlaces("chennai", "not-a-uuid")).toMatchObject({ ok: false })
    expect(await searchPlaces("ch", TOKEN)).toEqual({ ok: true, suggestions: [] })
    expect(await searchPlaces("x".repeat(500), TOKEN)).toMatchObject({ ok: false })
    expect(provider.autocomplete).not.toHaveBeenCalled()
  })
  it("says so when place search is not set up", async () => {
    getProvider.mockReturnValue(null)
    expect(await searchPlaces("chennai", TOKEN)).toEqual({ ok: false, error: "Place search is not set up yet." })
  })
  it("limits how often a business can search, per business", async () => {
    limit.mockResolvedValue(false)
    expect(await searchPlaces("chennai", TOKEN)).toMatchObject({ ok: false })
    expect(limit.mock.calls[0][0]).toBe("cabs-places:d1")
    expect(provider.autocomplete).not.toHaveBeenCalled()
  })
  it("forwards a good search to the provider with the session token", async () => {
    provider.autocomplete.mockResolvedValue([{ placeId: "p", primary: "A", secondary: "B" }])
    expect(await searchPlaces("  chennai airport ", TOKEN)).toEqual({ ok: true, suggestions: [{ placeId: "p", primary: "A", secondary: "B" }] })
    expect(provider.autocomplete).toHaveBeenCalledWith("chennai airport", TOKEN)
  })
})

describe("placeDetails", () => {
  it("validates the place id and token, then returns the place", async () => {
    expect(await placeDetails("short", TOKEN)).toMatchObject({ ok: false })
    expect(await placeDetails("ChIJabcdefghij", "nope")).toMatchObject({ ok: false })
    expect(await placeDetails("../../etc/passwd", TOKEN)).toMatchObject({ ok: false })
    provider.details.mockResolvedValue({ placeId: "ChIJabcdefghij", name: "X", address: "Y", lat: 1, lng: 2, stateCode: "TN", gstStateCode: "33" })
    expect(await placeDetails("ChIJabcdefghij", TOKEN)).toMatchObject({ ok: true, place: { name: "X" } })
    expect(await placeDetails("osm:13.08,80.27", TOKEN)).toMatchObject({ ok: true })
  })
  it("reports a place that cannot be found, no sign-in, no provider, and rate limiting", async () => {
    provider.details.mockResolvedValue(null)
    expect(await placeDetails("ChIJabcdefghij", TOKEN)).toEqual({ ok: false, error: "We could not find that place." })
    session.mockResolvedValue(null)
    expect(await placeDetails("ChIJabcdefghij", TOKEN)).toMatchObject({ ok: false })
    session.mockResolvedValue({ dealer: { id: "d1" } })
    getProvider.mockReturnValue(null)
    expect(await placeDetails("ChIJabcdefghij", TOKEN)).toMatchObject({ ok: false })
    getProvider.mockReturnValue(provider)
    limit.mockResolvedValue(false)
    expect(await placeDetails("ChIJabcdefghij", TOKEN)).toMatchObject({ ok: false })
  })
})

describe("distanceBetween", () => {
  const R = { distanceM: 1000, durationS: 60, tollEstimatePaise: null, source: "osrm" as const }
  it("validates both places and returns the route with whether it came from the cache", async () => {
    expect(await distanceBetween("bad", "ChIJabcdefghij")).toMatchObject({ ok: false })
    expect(await distanceBetween("ChIJabcdefghij", "x")).toMatchObject({ ok: false })
    between.mockResolvedValue({ route: R, cached: true })
    expect(await distanceBetween("ChIJabcdefghij", "ChIJklmnopqrst")).toEqual({ ok: true, route: R, cached: true })
    expect(between).toHaveBeenCalledWith(provider, { placeId: "ChIJabcdefghij" }, { placeId: "ChIJklmnopqrst" })
  })
  it("reports no route, no sign-in, no provider, and rate limiting", async () => {
    between.mockResolvedValue(null)
    expect(await distanceBetween("ChIJabcdefghij", "ChIJklmnopqrst")).toEqual({ ok: false, error: "We could not work out the distance." })
    session.mockResolvedValue(null)
    expect(await distanceBetween("ChIJabcdefghij", "ChIJklmnopqrst")).toMatchObject({ ok: false })
    session.mockResolvedValue({ dealer: { id: "d1" } })
    getProvider.mockReturnValue(null)
    expect(await distanceBetween("ChIJabcdefghij", "ChIJklmnopqrst")).toMatchObject({ ok: false })
    getProvider.mockReturnValue(provider)
    limit.mockResolvedValue(false)
    expect(await distanceBetween("ChIJabcdefghij", "ChIJklmnopqrst")).toMatchObject({ ok: false })
  })
})
