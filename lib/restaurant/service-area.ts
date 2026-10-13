import { z } from "zod"

import { validCoords } from "./location"

export const MIN_RADIUS_KM = 0.5
export const MAX_RADIUS_KM = 100

/** The restaurant's own location and, when set, how far from it delivery goes. */
export const serviceAreaSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  /** A readable address for the pin, so the owner can recognise what they picked. */
  address: z.string().trim().max(300).default(""),
  /** Null means no distance limit: delivery is decided by delivery zones alone. */
  radiusKm: z.number().min(MIN_RADIUS_KM).max(MAX_RADIUS_KM).nullable().default(null),
})
export type ServiceArea = z.infer<typeof serviceAreaSchema>

/** Reads what was saved, ignoring anything damaged or outside India. */
export function readServiceArea(stored: unknown): ServiceArea | null {
  const parsed = serviceAreaSchema.safeParse(stored)
  return parsed.success && validCoords(parsed.data.lat, parsed.data.lng) ? parsed.data : null
}

type Point = { lat: number; lng: number }

/** Straight-line distance over the Earth's surface, in kilometres (haversine). Roads are longer, which is why owners set a radius. */
export function distanceKm(a: Point, b: Point): number {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export type RadiusCheck = { distanceKm: number; radiusKm: number; within: boolean }

/** Whether a guest's point is inside the radius. Null when no radius is set, so nothing is limited. */
export function checkRadius(area: ServiceArea | null, point: Point | null): RadiusCheck | null {
  if (!area || area.radiusKm === null || !point) return null
  const d = distanceKm(area, point)
  return { distanceKm: Math.round(d * 10) / 10, radiusKm: area.radiusKm, within: d <= area.radiusKm }
}

/** A small OpenStreetMap picture of the spot, sized to show roughly the whole radius. No account or key needed. */
export function osmEmbedUrl(lat: number, lng: number, radiusKm: number | null): string {
  const km = Math.max(radiusKm ?? 1.5, 0.8) * 1.3
  const dLat = km / 111
  const dLng = km / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2))
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((n) => n.toFixed(5)).join("%2C")
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`
}

export const formatKm = (km: number) => (km < 10 ? km.toFixed(1) : String(Math.round(km))).replace(/\.0$/, "")
