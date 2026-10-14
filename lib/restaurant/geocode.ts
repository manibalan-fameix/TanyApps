import { type Geocoded, parseNominatim, validCoords } from "./location"

// OpenStreetMap's public Nominatim service. Its policy asks for an identifying User-Agent, at most one request per
// second, and no heavy use, so answers are cached and calls are spaced out. For serious traffic point GEOCODER_URL at
// your own Nominatim or any compatible provider.
const ENDPOINT = process.env.GEOCODER_URL?.trim() || "https://nominatim.openstreetmap.org/reverse"
const USER_AGENT = `TanyApps/1.0 (${process.env.GEOCODER_CONTACT?.trim() || "manibalan.fameix@gmail.com"})`
const MIN_GAP_MS = 1100
const CACHE_MS = 30 * 60_000

const cache = new Map<string, { at: number; value: Geocoded | null }>()
let nextSlot = 0

/** One polite outbound call at a time: spaced out, identified, and time-limited. */
async function getJson(url: string): Promise<unknown> {
  const wait = Math.max(0, nextSlot - Date.now())
  nextSlot = Date.now() + wait + MIN_GAP_MS
  if (wait) await new Promise((r) => setTimeout(r, wait))
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, "accept-language": "en" }, signal: AbortSignal.timeout(7000) })
  if (!res.ok) throw new Error(`geocoder ${res.status}`)
  return res.json()
}
const SEARCH = ENDPOINT.replace(/\/reverse$/, "/search")
const placeCache = new Map<string, { at: number; value: unknown }>()
const remember = <T,>(key: string, value: T, ms = CACHE_MS) => {
  if (placeCache.size > 500) placeCache.clear()
  placeCache.set(key, { at: Date.now(), value })
  return ms && value
}
const recall = <T,>(key: string, ms = CACHE_MS): T | undefined => {
  const hit = placeCache.get(key)
  return hit && Date.now() - hit.at < ms ? (hit.value as T) : undefined
}

export type Place = { label: string; lat: number; lng: number; pincode: string }

/** Finds places in India that match what the owner typed, for choosing the restaurant's location. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim().slice(0, 120)
  if (q.length < 3) return []
  const cached = recall<Place[]>(`s:${q.toLowerCase()}`)
  if (cached) return cached
  try {
    const raw = (await getJson(`${SEARCH}?format=jsonv2&addressdetails=1&countrycodes=in&limit=5&q=${encodeURIComponent(q)}`)) as { lat?: string; lon?: string; display_name?: string; address?: Record<string, string> }[]
    const places = (Array.isArray(raw) ? raw : [])
      .map((r) => ({ label: r.display_name ?? "", lat: Number(r.lat), lng: Number(r.lon), pincode: (r.address?.postcode ?? "").replace(/\s+/g, "") }))
      .filter((p) => p.label && validCoords(p.lat, p.lng))
      .map((p) => ({ ...p, pincode: /^[1-9]\d{5}$/.test(p.pincode) ? p.pincode : "" }))
    remember(`s:${q.toLowerCase()}`, places)
    return places
  } catch (error) {
    console.error(`place search failed: ${error instanceof Error ? error.message : "unknown"}`)
    return []
  }
}

/**
 * The middle of a pincode, for guests who typed a pincode instead of sharing their location. It is an estimate, good
 * enough to tell 3 km from 30 km. Null when it cannot be found, in which case the radius cannot be checked.
 */
export async function pincodeCentre(pincode: string): Promise<{ lat: number; lng: number } | null> {
  if (!/^[1-9]\d{5}$/.test(pincode)) return null
  const cached = recall<{ lat: number; lng: number } | null>(`p:${pincode}`, 24 * 3_600_000)
  if (cached !== undefined) return cached
  try {
    const raw = (await getJson(`${SEARCH}?format=jsonv2&countrycodes=in&limit=1&postalcode=${pincode}`)) as { lat?: string; lon?: string }[]
    const p = Array.isArray(raw) && raw[0] ? { lat: Number(raw[0].lat), lng: Number(raw[0].lon) } : null
    const value = p && validCoords(p.lat, p.lng) ? p : null
    remember(`p:${pincode}`, value, 24 * 3_600_000)
    return value
  } catch (error) {
    console.error(`pincode lookup failed: ${error instanceof Error ? error.message : "unknown"}`)
    return null
  }
}

/** Finds the address and pincode for a point. Returns null when the point is outside India or nothing is found. */
export async function reverseGeocode(lat: number, lng: number): Promise<Geocoded | null> {
  if (!validCoords(lat, lng)) return null
  // About 100 m: nearby guests share an answer, which keeps the number of outbound calls small.
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value

  try {
    const value = parseNominatim(await getJson(`${ENDPOINT}?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`))
    if (cache.size > 500) cache.clear()
    cache.set(key, { at: Date.now(), value })
    return value
  } catch (error) {
    console.error(`reverse geocode failed: ${error instanceof Error ? error.message : "unknown"}`)
    return null
  }
}
