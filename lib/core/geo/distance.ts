export type Point = { lat: number; lng: number }

/** Straight-line distance over the Earth's surface, in kilometres (haversine). Roads are longer, which is why owners set a radius. */
export function distanceKm(a: Point, b: Point): number {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export const formatKm = (km: number) => (km < 10 ? km.toFixed(1) : String(Math.round(km))).replace(/\.0$/, "")
