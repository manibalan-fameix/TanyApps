"use server"

import { industrySession } from "@/lib/core/guards"
import { routeBetween } from "@/lib/core/geo/route-cache"
import { getPlacesProvider } from "@/lib/core/geo/places-provider"
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, type PlaceDetail, type PlaceSuggestion, type RouteResult, isSessionToken } from "@/lib/core/geo/places"
import { rateLimit } from "@/lib/core/rate-limit"

// Place search for the operator's screens. The browser never talks to Google and never sees the key: it calls these actions,
// which check who is asking, limit how often, and forward to the provider from the server.

type Fail = { ok: false; error: string }
const signedOut: Fail = { ok: false, error: "Please sign in again." }
const unavailable: Fail = { ok: false, error: "Place search is not set up yet." }
const busy: Fail = { ok: false, error: "Too many searches. Try again in a few minutes." }

// A Google place id, or the development fallback's osm:lat,lng.
const PLACE_ID = /^(?:[A-Za-z0-9_-]{10,200}|osm:-?\d{1,3}(?:\.\d+)?,-?\d{1,3}(?:\.\d+)?)$/

export async function searchPlaces(query: string, sessionToken: string): Promise<{ ok: true; suggestions: PlaceSuggestion[] } | Fail> {
  const s = await industrySession("cabs")
  if (!s) return signedOut
  const q = String(query ?? "").trim()
  if (!isSessionToken(sessionToken)) return { ok: false, error: "Invalid request." }
  if (q.length < MIN_QUERY_LENGTH) return { ok: true, suggestions: [] }
  if (q.length > MAX_QUERY_LENGTH) return { ok: false, error: "That is too long to search for." }
  const provider = getPlacesProvider()
  if (!provider) return unavailable
  if (!(await rateLimit(`cabs-places:${s.dealer.id}`, 240, 10 * 60_000))) return busy
  return { ok: true, suggestions: await provider.autocomplete(q, sessionToken) }
}

export async function placeDetails(placeId: string, sessionToken: string): Promise<{ ok: true; place: PlaceDetail } | Fail> {
  const s = await industrySession("cabs")
  if (!s) return signedOut
  if (!isSessionToken(sessionToken) || !PLACE_ID.test(String(placeId))) return { ok: false, error: "Invalid request." }
  const provider = getPlacesProvider()
  if (!provider) return unavailable
  if (!(await rateLimit(`cabs-place-details:${s.dealer.id}`, 120, 10 * 60_000))) return busy
  const place = await provider.details(placeId, sessionToken)
  return place ? { ok: true, place } : { ok: false, error: "We could not find that place." }
}

export async function distanceBetween(fromId: string, toId: string): Promise<{ ok: true; route: RouteResult; cached: boolean } | Fail> {
  const s = await industrySession("cabs")
  if (!s) return signedOut
  if (!PLACE_ID.test(String(fromId)) || !PLACE_ID.test(String(toId))) return { ok: false, error: "Invalid request." }
  const provider = getPlacesProvider()
  if (!provider) return unavailable
  if (!(await rateLimit(`cabs-route:${s.dealer.id}`, 120, 10 * 60_000))) return busy
  const found = await routeBetween(provider, { placeId: fromId }, { placeId: toId })
  return found ? { ok: true, ...found } : { ok: false, error: "We could not work out the distance." }
}
