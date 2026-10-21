import { distanceKm } from "../geo/distance"

type Point = { lat: number; lng: number }

export type RoadRoute = {
  /** The road path from the rider to the guest, as [lat, lng] pairs. */
  points: [number, number][]
  km: number
  minutes: number
}

/** A route as kept for the whole delivery: the road plus when it was fetched and where it leads. */
export type StoredRoute = RoadRoute & { at: number; to: Point }

/** A rider further than this from the stored road has left it (a detour, a wrong turn), so the road is fetched again. */
export const OFF_ROUTE_KM = 0.2
/** Even a rider who stays on the road gets a fresh route now and then, since the best road can change. */
export const MAX_ROUTE_AGE_MS = 10 * 60_000

const KM_PER_DEG_LAT = 110.57
const KM_PER_DEG_LNG = 111.32

/** Closest point on the road to `p`: which segment, how far along it, and how far `p` is from the road. */
export function nearestOnRoute(points: [number, number][], p: Point): { index: number; t: number; offKm: number; at: Point } {
  const kx = KM_PER_DEG_LNG * Math.cos((p.lat * Math.PI) / 180)
  const xy = (lat: number, lng: number): [number, number] => [(lng - p.lng) * kx, (lat - p.lat) * KM_PER_DEG_LAT]
  let best = { index: 0, t: 0, offKm: Infinity, at: { lat: points[0][0], lng: points[0][1] } }
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = xy(points[i][0], points[i][1])
    const [bx, by] = xy(points[i + 1][0], points[i + 1][1])
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    // p is the origin of this little flat map, so the projection of the origin onto segment a-b is -a·d / |d|².
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
    const off = Math.hypot(ax + t * dx, ay + t * dy)
    if (off < best.offKm) {
      best = {
        index: i,
        t,
        offKm: off,
        at: { lat: points[i][0] + t * (points[i + 1][0] - points[i][0]), lng: points[i][1] + t * (points[i + 1][1] - points[i][1]) },
      }
    }
  }
  return best
}

const pathKm = (points: [number, number][]) => {
  let km = 0
  for (let i = 0; i < points.length - 1; i++) km += distanceKm({ lat: points[i][0], lng: points[i][1] }, { lat: points[i + 1][0], lng: points[i + 1][1] })
  return km
}

/**
 * The part of a stored route still ahead of the rider, worked out on this server with no call to any map service.
 * Returns null when the stored route cannot be reused: wrong destination, too old, too short, or the rider is off it.
 */
export function remainingRoute(stored: StoredRoute | null, from: Point, to: Point, now = Date.now()): RoadRoute | null {
  if (!stored || stored.points.length < 2) return null
  if (distanceKm(stored.to, to) > 0.01) return null
  if (now - stored.at > MAX_ROUTE_AGE_MS) return null
  const near = nearestOnRoute(stored.points, from)
  if (near.offKm > OFF_ROUTE_KM) return null

  const ahead: [number, number][] = [[near.at.lat, near.at.lng], ...stored.points.slice(near.index + 1)]
  const totalKm = pathKm(stored.points)
  const leftKm = pathKm(ahead)
  const share = totalKm > 0 ? Math.min(1, leftKm / totalKm) : 0
  return { points: ahead, km: Math.round(leftKm * 10) / 10, minutes: Math.max(1, Math.ceil(stored.minutes * share)) }
}
