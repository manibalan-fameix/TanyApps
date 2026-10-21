import { findState } from "../../cabs/states"
import type { PlaceDetail, PlaceRef, PlaceSuggestion, PlacesProvider, RouteResult } from "./places"

const PLACES = "https://places.googleapis.com/v1"
const ROUTES = "https://routes.googleapis.com/directions/v2:computeRoutes"
const TIMEOUT_MS = 8000

type Fetch = typeof fetch

export type GoogleOptions = {
  apiKey: string
  /**
   * Ask Routes for toll prices. Off by default: Google's toll docs do not say India is covered, and toll requests are billed
   * at a higher rate. Turn it on (GOOGLE_ROUTES_TOLLS=1) only after checking a real India route returns a price.
   */
  tolls?: boolean
  fetchImpl?: Fetch
}

/**
 * Google Places API (New) autocomplete and details, and the Routes API for distance. The key is a SERVER key: it is read here
 * from the environment, sent only to Google, and never reaches a browser (the screens call our server actions instead).
 */
export function createGoogleProvider(opts: GoogleOptions): PlacesProvider {
  const f: Fetch = opts.fetchImpl ?? fetch
  const key = opts.apiKey

  async function call(url: string, init: RequestInit & { fieldMask?: string }): Promise<unknown | null> {
    try {
      const headers: Record<string, string> = { "X-Goog-Api-Key": key, ...(init.fieldMask ? { "X-Goog-FieldMask": init.fieldMask } : {}) }
      if (init.method === "POST") headers["Content-Type"] = "application/json"
      const res = await f(url, { method: init.method, body: init.body, headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!res.ok) {
        // The body can say why (quota, key restrictions) but never contains our key; log the status and Google's message only.
        const msg = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message
        console.error(`google maps ${res.status}: ${msg?.slice(0, 160) ?? "request failed"}`)
        return null
      }
      return await res.json()
    } catch (error) {
      console.error(`google maps unreachable: ${error instanceof Error ? error.message : "unknown"}`)
      return null
    }
  }

  return {
    name: "google",

    async autocomplete(query, sessionToken): Promise<PlaceSuggestion[]> {
      const json = (await call(`${PLACES}/places:autocomplete`, {
        method: "POST",
        fieldMask: "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.text",
        // India only; the session token is what makes the typing and the final choice one billed session.
        body: JSON.stringify({ input: query, sessionToken, includedRegionCodes: ["in"], languageCode: "en" }),
      })) as { suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }[] } | null
      const out: PlaceSuggestion[] = []
      for (const s of json?.suggestions ?? []) {
        const p = s.placePrediction
        if (!p?.placeId) continue
        out.push({ placeId: p.placeId, primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text ?? "" })
      }
      return out
    },

    async details(placeId, sessionToken): Promise<PlaceDetail | null> {
      const url = `${PLACES}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en`
      const j = (await call(url, { method: "GET", fieldMask: "id,displayName,formattedAddress,location,addressComponents" })) as {
        id?: string
        displayName?: { text?: string }
        formattedAddress?: string
        location?: { latitude?: number; longitude?: number }
        addressComponents?: { longText?: string; shortText?: string; types?: string[] }[]
      } | null
      const lat = j?.location?.latitude
      const lng = j?.location?.longitude
      if (!j || typeof lat !== "number" || typeof lng !== "number") return null
      const stateComponent = j.addressComponents?.find((c) => c.types?.includes("administrative_area_level_1"))
      const state = findState(stateComponent?.shortText) ?? findState(stateComponent?.longText)
      return { placeId: j.id ?? placeId, name: j.displayName?.text ?? "", address: j.formattedAddress ?? "", lat, lng, stateCode: state?.code ?? null, gstStateCode: state?.gst ?? null }
    },

    async route(from, to): Promise<RouteResult | null> {
      const waypoint = (p: PlaceRef) => (p.placeId.startsWith("osm:") || p.placeId === "" ? { location: { latLng: { latitude: p.lat, longitude: p.lng } } } : { placeId: p.placeId })
      const mask = ["routes.distanceMeters", "routes.duration", ...(opts.tolls ? ["routes.travelAdvisory.tollInfo"] : [])].join(",")
      const body: Record<string, unknown> = {
        origin: waypoint(from),
        destination: waypoint(to),
        travelMode: "DRIVE",
        // Plain road distance. Traffic-aware routing costs more and changes minute to minute; fares use distance, not time.
        routingPreference: "TRAFFIC_UNAWARE",
        units: "METRIC",
      }
      if (opts.tolls) {
        body.extraComputations = ["TOLLS"]
        body.routeModifiers = { vehicleInfo: { emissionType: "GASOLINE" } }
      }
      const j = (await call(ROUTES, { method: "POST", fieldMask: mask, body: JSON.stringify(body) })) as {
        routes?: { distanceMeters?: number; duration?: string; travelAdvisory?: { tollInfo?: { estimatedPrice?: { currencyCode?: string; units?: string; nanos?: number }[] } } }[]
      } | null
      const r = j?.routes?.[0]
      const seconds = /^(\d+)s$/.exec(r?.duration ?? "")
      if (!r || typeof r.distanceMeters !== "number" || !seconds) return null
      return { distanceM: r.distanceMeters, durationS: Number(seconds[1]), tollEstimatePaise: tollPaise(r.travelAdvisory?.tollInfo?.estimatedPrice), source: "google" }
    },
  }
}

/** Google gives the price as { currencyCode, units, nanos } per currency. Only rupees count; anything else is unknown. */
export function tollPaise(price: { currencyCode?: string; units?: string; nanos?: number }[] | undefined): number | null {
  const inr = price?.find((p) => p.currencyCode === "INR")
  if (!inr) return null
  const rupees = Number(inr.units ?? 0)
  const paise = Math.round((inr.nanos ?? 0) / 10_000_000)
  return Number.isFinite(rupees) ? rupees * 100 + paise : null
}
