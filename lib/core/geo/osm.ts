import { findState } from "../../cabs/states"
import { reverseGeocode, searchPlaces } from "./geocode"
import type { PlaceDetail, PlaceRef, PlaceSuggestion, PlacesProvider, RouteResult } from "./places"
import { validCoords } from "./validate"

/**
 * The free fallback for development and demos: OpenStreetMap's Nominatim for places and the public OSRM server for roads.
 * Both services forbid heavy or commercial use, so getPlacesProvider() offers this only outside production.
 *
 * A place is identified as `osm:<lat>,<lng>` (Nominatim has no stable id we can keep), which carries everything the route
 * lookup needs.
 */
const OSRM = process.env.OSRM_URL || "https://router.project-osrm.org"

const idFor = (lat: number, lng: number) => `osm:${lat.toFixed(5)},${lng.toFixed(5)}`

export function parseOsmId(id: string): { lat: number; lng: number } | null {
  const m = /^osm:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(id)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  return validCoords(lat, lng) ? { lat, lng } : null
}

export const osmProvider: PlacesProvider = {
  name: "osm",

  async autocomplete(query): Promise<PlaceSuggestion[]> {
    const places = await searchPlaces(query)
    return places.map((p) => {
      const [first, ...rest] = p.label.split(",")
      return { placeId: idFor(p.lat, p.lng), primary: first.trim(), secondary: rest.join(",").trim() }
    })
  },

  async details(placeId): Promise<PlaceDetail | null> {
    const at = parseOsmId(placeId)
    if (!at) return null
    const g = await reverseGeocode(at.lat, at.lng)
    const state = findState(g?.state)
    return { placeId, name: g?.area || g?.city || "Selected place", address: g?.address ?? "", lat: at.lat, lng: at.lng, stateCode: state?.code ?? null, gstStateCode: state?.gst ?? null }
  },

  async route(from, to): Promise<RouteResult | null> {
    const a = from.lat !== undefined && from.lng !== undefined ? { lat: from.lat, lng: from.lng } : parseOsmId(from.placeId)
    const b = to.lat !== undefined && to.lng !== undefined ? { lat: to.lat, lng: to.lng } : parseOsmId(to.placeId)
    if (!a || !b) return null
    try {
      const res = await fetch(`${OSRM}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`, { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "TanyApps-cabs/1.0" } })
      if (!res.ok) return null
      const data = (await res.json()) as { routes?: { distance?: number; duration?: number }[] }
      const r = data.routes?.[0]
      if (!r || typeof r.distance !== "number" || typeof r.duration !== "number") return null
      return { distanceM: Math.round(r.distance), durationS: Math.round(r.duration), tollEstimatePaise: null, source: "osrm" }
    } catch {
      return null
    }
  },
}
