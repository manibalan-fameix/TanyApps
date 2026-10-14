import { distanceKm } from "@/lib/restaurant/service-area"

export type RoadRoute = {
  /** The road path from the rider to the guest, as [lat, lng] pairs. */
  points: [number, number][]
  km: number
  minutes: number
}

type Point = { lat: number; lng: number }

// OSRM's public demo server by default (free, no key, no live traffic, meant for light use). Point OSRM_URL at your
// own OSRM, Mapbox-compatible or Valhalla-compatible service for production volume.
const BASE = process.env.OSRM_URL || "https://router.project-osrm.org"
// Plain road time ignores traffic, junctions and stops, so a scooter in a city takes longer.
const REAL_WORLD_FACTOR = 1.25
const REUSE_MS = 45_000
const REUSE_KM = 0.12
const MAX_POINTS = 160

const cache = new Map<string, { at: number; from: Point; to: Point; route: RoadRoute | null }>()

/** Keeps the line light for the browser: every nth point, always including the last. */
export function thin(points: [number, number][], max = MAX_POINTS): [number, number][] {
  if (points.length <= max) return points
  const step = Math.ceil(points.length / max)
  const out = points.filter((_, i) => i % step === 0)
  const last = points[points.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

/**
 * The road route from `from` to `to`, or null when the routing service is down (callers then fall back to the
 * straight-line estimate). Remembered per order so a page polling every few seconds does not call the service each time.
 */
export async function roadRoute(key: string, from: Point, to: Point): Promise<RoadRoute | null> {
  const hit = cache.get(key)
  const same = hit && distanceKm(hit.to, to) < 0.01
  if (hit && same && Date.now() - hit.at < REUSE_MS && distanceKm(hit.from, from) < REUSE_KM) return hit.route
  if (cache.size > 500) cache.clear()
  try {
    const url = `${BASE}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { "User-Agent": "TanyApps-delivery-tracking/1.0" } })
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] }
    const r = data.routes?.[0]
    const route: RoadRoute | null = r
      ? {
          points: thin(r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])),
          km: Math.round((r.distance / 1000) * 10) / 10,
          minutes: Math.max(1, Math.ceil((r.duration * REAL_WORLD_FACTOR) / 60)),
        }
      : null
    cache.set(key, { at: Date.now(), from, to, route })
    return route
  } catch {
    // Remember the failure briefly too, so an outage does not make every poll wait for the timeout.
    cache.set(key, { at: Date.now() - REUSE_MS + 10_000, from, to, route: null })
    return null
  }
}
