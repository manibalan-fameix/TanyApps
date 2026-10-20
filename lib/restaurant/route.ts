import { readRoute, saveRoute } from "@/lib/restaurant/live-location"
import { remainingRoute, type RoadRoute, type StoredRoute } from "@/lib/restaurant/route-plan"

export type { RoadRoute } from "@/lib/restaurant/route-plan"

type Point = { lat: number; lng: number }

// OSRM's public demo server by default (free, no key, no live traffic, meant for light use). Point OSRM_URL at your
// own OSRM, Mapbox-compatible or Valhalla-compatible service for production volume.
const BASE = process.env.OSRM_URL || "https://router.project-osrm.org"
// Plain road time ignores traffic, junctions and stops, so a scooter in a city takes longer.
const REAL_WORLD_FACTOR = 1.25
/** After a failed lookup, wait this long before asking again, so an outage does not make every poll wait for the timeout. */
const RETRY_AFTER_FAIL_MS = 10_000
const MAX_POINTS = 160

// This server's own memory: a first stop before the shared copy, and the only copy when there is no Cloudflare store.
const memory = new Map<string, StoredRoute>()
const failedAt = new Map<string, number>()
const inFlight = new Map<string, Promise<StoredRoute | null>>()

/** Keeps the line light for the browser: every nth point, always including the last. */
export function thin(points: [number, number][], max = MAX_POINTS): [number, number][] {
  if (points.length <= max) return points
  const step = Math.ceil(points.length / max)
  const out = points.filter((_, i) => i % step === 0)
  const last = points[points.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

async function lookup(from: Point, to: Point): Promise<StoredRoute | null> {
  const url = `${BASE}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { "User-Agent": "TanyApps-delivery-tracking/1.0" } })
  if (!res.ok) throw new Error(String(res.status))
  const data = (await res.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] }
  const r = data.routes?.[0]
  if (!r) return null
  return {
    points: thin(r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])),
    km: Math.round((r.distance / 1000) * 10) / 10,
    minutes: Math.max(1, Math.ceil((r.duration * REAL_WORLD_FACTOR) / 60)),
    at: Date.now(),
    to,
  }
}

/**
 * The road route from `from` to `to` for one delivery, or null when the routing service is down (callers then fall back
 * to the straight-line estimate).
 *
 * The routing service is asked once per delivery, not once per viewer or per poll. The route is kept with the order
 * (in its Cloudflare object, and in this server's memory), and every later call just works out how much of it is left
 * from the rider's position. It is looked up again only if the rider leaves the road, the destination changes, or the
 * route is ten minutes old. Rider, customer and restaurant all share the same copy.
 */
export async function roadRoute(dealerId: string, orderId: string, from: Point, to: Point): Promise<RoadRoute | null> {
  const key = `${dealerId}:${orderId}`
  const mine = memory.get(key) ?? null
  let left = remainingRoute(mine, from, to)
  if (left) return left
  // Another server may have refreshed it since: check the shared copy before asking the routing service.
  const shared = await readRoute(dealerId, orderId)
  left = shared && shared !== mine ? remainingRoute(shared, from, to) : null
  if (left) {
    memory.set(key, shared!)
    return left
  }

  if (Date.now() - (failedAt.get(key) ?? 0) < RETRY_AFTER_FAIL_MS) return null
  // Many viewers can need the same new route at the same instant; they all wait for one lookup.
  let pending = inFlight.get(key)
  if (!pending) {
    pending = lookup(from, to)
      .then(async (fresh) => {
        if (fresh) {
          if (memory.size > 500) memory.clear()
          memory.set(key, fresh)
          failedAt.delete(key)
          await saveRoute(dealerId, orderId, fresh)
        } else failedAt.set(key, Date.now())
        return fresh
      })
      .catch(() => {
        failedAt.set(key, Date.now())
        return null
      })
      .finally(() => inFlight.delete(key))
    inFlight.set(key, pending)
  }
  const fresh = await pending
  return fresh ? { points: fresh.points, km: fresh.km, minutes: fresh.minutes } : null
}
