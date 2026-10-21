import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { findState } from "../../lib/cabs/states"
import { createGoogleProvider, tollPaise } from "../../lib/core/geo/google"
import { parseOsmId } from "../../lib/core/geo/osm"
import { isSessionToken, type PlacesProvider, type RouteResult } from "../../lib/core/geo/places"
import { getPlacesProvider } from "../../lib/core/geo/places-provider"
import { routeBetween, ttlMs, type RouteStore, type StoredRoute } from "../../lib/core/geo/route-cache"

const TOKEN = "3f2a5c1e-9b7d-4e2a-8c3f-1a2b3c4d5e6f"
const KEY = "test-server-key-123"

type Call = { url: string; init: RequestInit }
function fakeFetch(responses: (unknown | { __status: number; body?: unknown } | Error)[]) {
  const calls: Call[] = []
  const impl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    const next = responses.shift()
    if (next instanceof Error) throw next
    if (next && typeof next === "object" && "__status" in next) return new Response(JSON.stringify((next as { body?: unknown }).body ?? {}), { status: (next as { __status: number }).__status })
    return new Response(JSON.stringify(next ?? {}), { status: 200 })
  })
  return { calls, impl: impl as unknown as typeof fetch }
}
const headerOf = (c: Call, name: string) => (c.init.headers as Record<string, string>)[name]

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}))

describe("session tokens", () => {
  it("accepts a version 4 UUID and nothing else", () => {
    expect(isSessionToken(TOKEN)).toBe(true)
    expect(isSessionToken(crypto.randomUUID())).toBe(true)
    for (const bad of ["", "abc", "3f2a5c1e-9b7d-1e2a-8c3f-1a2b3c4d5e6f", TOKEN + "x", null, 42, undefined]) expect(isSessionToken(bad)).toBe(false)
  })
})

describe("Google autocomplete (Places API New)", () => {
  it("sends the key in a header, the session token in the body, and restricts to India", async () => {
    const f = fakeFetch([{ suggestions: [] }])
    await createGoogleProvider({ apiKey: KEY, fetchImpl: f.impl }).autocomplete("chennai air", TOKEN)
    const c = f.calls[0]
    expect(c.url).toBe("https://places.googleapis.com/v1/places:autocomplete")
    expect(c.init.method).toBe("POST")
    expect(headerOf(c, "X-Goog-Api-Key")).toBe(KEY)
    expect(headerOf(c, "Content-Type")).toBe("application/json")
    expect(headerOf(c, "X-Goog-FieldMask")).toContain("suggestions.placePrediction.placeId")
    expect(JSON.parse(String(c.init.body))).toEqual({ input: "chennai air", sessionToken: TOKEN, includedRegionCodes: ["in"], languageCode: "en" })
    expect(c.url).not.toContain(KEY) // never in a URL, which would end up in logs
  })

  it("maps place predictions and skips query predictions and entries without an id", async () => {
    const f = fakeFetch([
      {
        suggestions: [
          { placePrediction: { placeId: "ChIJabc", text: { text: "Chennai International Airport, Chennai" }, structuredFormat: { mainText: { text: "Chennai International Airport" }, secondaryText: { text: "Meenambakkam, Chennai" } } } },
          { queryPrediction: { text: { text: "chennai airport taxi" } } },
          { placePrediction: { text: { text: "no id" } } },
          { placePrediction: { placeId: "ChIJdef", text: { text: "Only a full text" } } },
        ],
      },
    ])
    expect(await createGoogleProvider({ apiKey: KEY, fetchImpl: f.impl }).autocomplete("chen", TOKEN)).toEqual([
      { placeId: "ChIJabc", primary: "Chennai International Airport", secondary: "Meenambakkam, Chennai" },
      { placeId: "ChIJdef", primary: "Only a full text", secondary: "" },
    ])
  })

  it("returns nothing, without throwing or leaking the key, when Google errors or is unreachable", async () => {
    const err = vi.mocked(console.error)
    const p = (r: unknown) => createGoogleProvider({ apiKey: KEY, fetchImpl: fakeFetch([r]).impl })
    expect(await p({ __status: 403, body: { error: { message: "API key not valid" } } }).autocomplete("chennai", TOKEN)).toEqual([])
    expect(await p(new Error("network down")).autocomplete("chennai", TOKEN)).toEqual([])
    expect(await p({}).autocomplete("chennai", TOKEN)).toEqual([])
    expect(err.mock.calls.flat().join(" ")).not.toContain(KEY)
  })
})

describe("Google place details", () => {
  const detail = {
    id: "ChIJabc",
    displayName: { text: "Chennai International Airport" },
    formattedAddress: "Airport Rd, Chennai 600027",
    location: { latitude: 12.99, longitude: 80.17 },
    addressComponents: [{ longText: "Tamil Nadu", shortText: "TN", types: ["administrative_area_level_1", "political"] }],
  }

  it("asks for only the fields it needs and ends the autocomplete session with the same token", async () => {
    const f = fakeFetch([detail])
    await createGoogleProvider({ apiKey: KEY, fetchImpl: f.impl }).details("ChIJabc", TOKEN)
    const c = f.calls[0]
    expect(c.init.method).toBe("GET")
    expect(c.url).toBe(`https://places.googleapis.com/v1/places/ChIJabc?sessionToken=${TOKEN}&languageCode=en`)
    expect(headerOf(c, "X-Goog-FieldMask")).toBe("id,displayName,formattedAddress,location,addressComponents")
    expect(headerOf(c, "X-Goog-Api-Key")).toBe(KEY)
  })

  it("maps the place and works out its state", async () => {
    const f = fakeFetch([detail])
    expect(await createGoogleProvider({ apiKey: KEY, fetchImpl: f.impl }).details("ChIJabc", TOKEN)).toEqual({
      placeId: "ChIJabc",
      name: "Chennai International Airport",
      address: "Airport Rd, Chennai 600027",
      lat: 12.99,
      lng: 80.17,
      stateCode: "TN",
      gstStateCode: "33",
    })
  })

  it("copes with a place that has no state, no name, or a long-name-only state", async () => {
    const mk = (extra: object) => createGoogleProvider({ apiKey: KEY, fetchImpl: fakeFetch([{ location: { latitude: 1, longitude: 2 }, ...extra }]).impl }).details("X1234567890", TOKEN)
    expect(await mk({})).toMatchObject({ name: "", address: "", stateCode: null, gstStateCode: null, placeId: "X1234567890" })
    expect(await mk({ addressComponents: [{ longText: "Karnataka", types: ["administrative_area_level_1"] }] })).toMatchObject({ stateCode: "KA", gstStateCode: "29" })
  })

  it("returns null when there is no usable location or Google fails", async () => {
    expect(await createGoogleProvider({ apiKey: KEY, fetchImpl: fakeFetch([{ id: "x" }]).impl }).details("ChIJabc12345", TOKEN)).toBeNull()
    expect(await createGoogleProvider({ apiKey: KEY, fetchImpl: fakeFetch([{ __status: 404 }]).impl }).details("ChIJabc12345", TOKEN)).toBeNull()
  })
})

describe("Google Routes", () => {
  const ok = { routes: [{ distanceMeters: 152_300, duration: "9540s" }] }

  it("asks for distance and duration by road, with plain (not traffic-aware) routing and no tolls by default", async () => {
    const f = fakeFetch([ok])
    const r = await createGoogleProvider({ apiKey: KEY, fetchImpl: f.impl }).route({ placeId: "ChIJone1234567" }, { placeId: "ChIJtwo1234567" })
    const c = f.calls[0]
    expect(c.url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes")
    expect(headerOf(c, "X-Goog-FieldMask")).toBe("routes.distanceMeters,routes.duration")
    const body = JSON.parse(String(c.init.body))
    expect(body).toMatchObject({ origin: { placeId: "ChIJone1234567" }, destination: { placeId: "ChIJtwo1234567" }, travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE" })
    expect(body.extraComputations).toBeUndefined()
    expect(r).toEqual({ distanceM: 152_300, durationS: 9540, tollEstimatePaise: null, source: "google" })
  })

  it("uses coordinates for a pin or fallback place", async () => {
    const f = fakeFetch([ok])
    await createGoogleProvider({ apiKey: KEY, fetchImpl: f.impl }).route({ placeId: "osm:13.1,80.2", lat: 13.1, lng: 80.2 }, { placeId: "", lat: 9.9, lng: 78.1 })
    const body = JSON.parse(String(f.calls[0].init.body))
    expect(body.origin).toEqual({ location: { latLng: { latitude: 13.1, longitude: 80.2 } } })
    expect(body.destination).toEqual({ location: { latLng: { latitude: 9.9, longitude: 78.1 } } })
  })

  it("requests and reads tolls only when switched on", async () => {
    const f = fakeFetch([{ routes: [{ distanceMeters: 1000, duration: "60s", travelAdvisory: { tollInfo: { estimatedPrice: [{ currencyCode: "INR", units: "145", nanos: 500_000_000 }] } } }] }])
    const r = await createGoogleProvider({ apiKey: KEY, tolls: true, fetchImpl: f.impl }).route({ placeId: "ChIJone1234567" }, { placeId: "ChIJtwo1234567" })
    expect(headerOf(f.calls[0], "X-Goog-FieldMask")).toBe("routes.distanceMeters,routes.duration,routes.travelAdvisory.tollInfo")
    expect(JSON.parse(String(f.calls[0].init.body)).extraComputations).toEqual(["TOLLS"])
    expect(r?.tollEstimatePaise).toBe(14_550)
  })

  it("returns null when there is no route, a missing distance, an odd duration, or Google fails", async () => {
    const p = (r: unknown) => createGoogleProvider({ apiKey: KEY, fetchImpl: fakeFetch([r]).impl }).route({ placeId: "a" }, { placeId: "b" })
    expect(await p({})).toBeNull()
    expect(await p({ routes: [] })).toBeNull()
    expect(await p({ routes: [{ duration: "60s" }] })).toBeNull()
    expect(await p({ routes: [{ distanceMeters: 5, duration: "1h" }] })).toBeNull()
    expect(await p({ __status: 500 })).toBeNull()
  })

  it("reads toll prices in rupees only", () => {
    expect(tollPaise(undefined)).toBeNull()
    expect(tollPaise([])).toBeNull()
    expect(tollPaise([{ currencyCode: "USD", units: "4" }])).toBeNull()
    expect(tollPaise([{ currencyCode: "INR", units: "200" }])).toBe(20_000)
    expect(tollPaise([{ currencyCode: "INR", nanos: 750_000_000 }])).toBe(75)
    expect(tollPaise([{ currencyCode: "INR", units: "x" }])).toBeNull()
  })
})

describe("provider choice", () => {
  it("uses Google with a key, the free fallback in development, and nothing in production without a key", () => {
    expect(getPlacesProvider({ GOOGLE_MAPS_SERVER_KEY: KEY, NODE_ENV: "production" })?.name).toBe("google")
    expect(getPlacesProvider({ GOOGLE_MAPS_SERVER_KEY: "  ", NODE_ENV: "development" })?.name).toBe("osm")
    expect(getPlacesProvider({ NODE_ENV: "test" })?.name).toBe("osm")
    expect(getPlacesProvider({ NODE_ENV: "production" })).toBeNull()
  })
})

describe("fallback place ids", () => {
  it("round-trips coordinates and rejects anything else", () => {
    expect(parseOsmId("osm:13.08270,80.27070")).toEqual({ lat: 13.0827, lng: 80.2707 })
    for (const bad of ["osm:51.5,-0.12", "osm:abc", "ChIJabc", "osm:13,80,1"]) expect(parseOsmId(bad)).toBeNull()
  })
})

describe("states", () => {
  it("finds a state by code, alias, GST code or name", () => {
    expect(findState("TN")).toMatchObject({ code: "TN", gst: "33", name: "Tamil Nadu" })
    expect(findState(" tn ")?.code).toBe("TN")
    expect(findState("TS")?.code).toBe("TG")
    expect(findState("OR")?.code).toBe("OD")
    expect(findState("29")?.code).toBe("KA")
    expect(findState("andhra pradesh")?.code).toBe("AP")
    for (const bad of ["", "  ", null, undefined, "XX", "99"]) expect(findState(bad)).toBeNull()
  })
})

describe("route cache", () => {
  const A = { placeId: "ChIJone1234567" }
  const B = { placeId: "ChIJtwo1234567" }
  const now = new Date("2026-11-02T10:00:00Z")
  const day = 86_400_000
  const route = (source: RouteResult["source"], distanceM = 150_000): RouteResult => ({ distanceM, durationS: 9000, tollEstimatePaise: null, source })

  function memoryStore(initial: StoredRoute[] = []) {
    const rows = [...initial]
    const store: RouteStore & { rows: StoredRoute[] } = {
      rows,
      find: vi.fn(async () => rows),
      save: vi.fn(async (_f, _t, r, at) => void rows.push({ ...r, fetchedAt: at })),
    }
    return store
  }
  const provider = (r: RouteResult | null): PlacesProvider & { route: ReturnType<typeof vi.fn> } => ({ name: "google", autocomplete: vi.fn(), details: vi.fn(), route: vi.fn(async () => r) }) as never

  it("does NOT store Google distances unless caching is explicitly allowed", async () => {
    const store = memoryStore()
    const p = provider(route("google"))
    await routeBetween(p, A, B, { store, now, env: {} })
    await routeBetween(p, A, B, { store, now, env: {} })
    expect(p.route).toHaveBeenCalledTimes(2)
    expect(store.save).not.toHaveBeenCalled()
    expect(ttlMs("google", {})).toBe(0)
    expect(ttlMs("google", { GOOGLE_ROUTE_CACHE_DAYS: "nope" })).toBe(0)
    expect(ttlMs("google", { GOOGLE_ROUTE_CACHE_DAYS: "-3" })).toBe(0)
  })

  it("stores and reuses a Google distance only for the number of days allowed, capped at 30", async () => {
    const store = memoryStore()
    const p = provider(route("google"))
    const env = { GOOGLE_ROUTE_CACHE_DAYS: "7" }
    expect((await routeBetween(p, A, B, { store, now, env }))?.cached).toBe(false)
    expect((await routeBetween(p, A, B, { store, now: new Date(now.getTime() + 6 * day), env }))?.cached).toBe(true)
    expect(p.route).toHaveBeenCalledTimes(1)
    expect((await routeBetween(p, A, B, { store, now: new Date(now.getTime() + 8 * day), env }))?.cached).toBe(false) // expired
    expect(ttlMs("google", { GOOGLE_ROUTE_CACHE_DAYS: "90" })).toBe(30 * day)
  })

  it("keeps free-router results for 30 days", async () => {
    const store = memoryStore()
    const p = provider(route("osrm"))
    await routeBetween(p, A, B, { store, now, env: {} })
    expect((await routeBetween(p, A, B, { store, now: new Date(now.getTime() + 29 * day), env: {} }))?.cached).toBe(true)
    expect((await routeBetween(p, A, B, { store, now: new Date(now.getTime() + 31 * day), env: {} }))?.cached).toBe(false)
  })

  it("prefers a distance the operator entered, however old", async () => {
    const store = memoryStore([{ ...route("manual", 148_000), fetchedAt: new Date(now.getTime() - 900 * day) }, { ...route("osrm", 152_000), fetchedAt: now }])
    const p = provider(route("osrm"))
    const r = await routeBetween(p, A, B, { store, now, env: {} })
    expect(r).toMatchObject({ cached: true, route: { distanceM: 148_000, source: "manual" } })
    expect(p.route).not.toHaveBeenCalled()
  })

  it("picks the freshest of several valid answers", async () => {
    const store = memoryStore([{ ...route("osrm", 1), fetchedAt: new Date(now.getTime() - 5 * day) }, { ...route("osrm", 2), fetchedAt: new Date(now.getTime() - 1 * day) }])
    expect((await routeBetween(provider(null), A, B, { store, now, env: {} }))?.route.distanceM).toBe(2)
  })

  it("returns null when there is nothing cached and the provider has no route", async () => {
    expect(await routeBetween(provider(null), A, B, { store: memoryStore(), now, env: {} })).toBeNull()
  })

  it("never fails a lookup because the cache is broken", async () => {
    const broken: RouteStore = { find: async () => { throw new Error("db down") }, save: async () => { throw new Error("db down") } }
    expect((await routeBetween(provider(route("osrm")), A, B, { store: broken, now, env: {} }))?.route.distanceM).toBe(150_000)
  })
})

describe("the server key stays on the server", () => {
  const roots = ["app", "components", "hooks", "lib", "workers"]
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) {
        if (name !== "node_modules") walk(path)
      } else if (/\.(ts|tsx|mjs)$/.test(name)) files.push(path)
    }
  }
  roots.forEach(walk)

  it("is read in exactly one place, and never in a file that runs in the browser", () => {
    const users = files.filter((f) => readFileSync(f, "utf8").includes("GOOGLE_MAPS_SERVER_KEY"))
    expect(users).toEqual(["lib/core/geo/places-provider.ts"])
    for (const f of files) {
      const src = readFileSync(f, "utf8")
      if (/^\s*["']use client["']/m.test(src.split("\n").slice(0, 3).join("\n"))) {
        expect(src, f).not.toMatch(/GOOGLE_MAPS_SERVER_KEY|places\.googleapis\.com|routes\.googleapis\.com/)
      }
    }
  })

  it("is never given a NEXT_PUBLIC_ name, which Next would ship to every browser", () => {
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/NEXT_PUBLIC_GOOGLE_MAPS_SERVER/)
  })
})
