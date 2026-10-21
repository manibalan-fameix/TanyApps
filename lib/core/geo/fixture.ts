import type { PlaceDetail, PlaceRef, PlacesProvider, PlaceSuggestion, RouteResult } from "./places"

/**
 * A fake map service for automated tests: a handful of Tamil Nadu places and straight-line distances. Never used in production
 * (getPlacesProvider checks NODE_ENV) and never talks to the network, so browser tests do not depend on Google or OpenStreetMap.
 */
const PLACES: Record<string, PlaceDetail> = {
  "fixture-maa": { placeId: "fixture-maa", name: "Chennai International Airport", address: "Meenambakkam, Chennai, Tamil Nadu", lat: 12.9941, lng: 80.1709, stateCode: "TN", gstStateCode: "33" },
  "fixture-t-nagar": { placeId: "fixture-t-nagar", name: "T Nagar", address: "T Nagar, Chennai, Tamil Nadu", lat: 13.0418, lng: 80.2341, stateCode: "TN", gstStateCode: "33" },
  "fixture-mdu": { placeId: "fixture-mdu", name: "Madurai Junction", address: "Madurai, Tamil Nadu", lat: 9.9195, lng: 78.1193, stateCode: "TN", gstStateCode: "33" },
  "fixture-pondy": { placeId: "fixture-pondy", name: "Puducherry", address: "Puducherry", lat: 11.9416, lng: 79.8083, stateCode: "PY", gstStateCode: "34" },
}

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export const fixtureProvider: PlacesProvider = {
  name: "osm",
  async autocomplete(query): Promise<PlaceSuggestion[]> {
    const q = query.toLowerCase()
    return Object.values(PLACES)
      .filter((p) => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q))
      .map((p) => ({ placeId: p.placeId, primary: p.name, secondary: p.address }))
  },
  async details(placeId) {
    return PLACES[placeId] ?? null
  },
  async route(from: PlaceRef, to: PlaceRef): Promise<RouteResult | null> {
    const a = PLACES[from.placeId]
    const b = PLACES[to.placeId]
    if (!a || !b) return null
    // Roads wind: a straight line is stretched by a third, to the nearest 100 m.
    const km = haversineKm(a, b) * 1.3
    return { distanceM: Math.round((km * 1000) / 100) * 100, durationS: Math.round((km / 50) * 3600), tollEstimatePaise: null, source: "osrm" }
  },
}
