import { z } from "zod"

import { distanceKm, type Point } from "../core/geo/distance"
import { validCoords } from "./location"

// Distance helpers moved to lib/core/geo; re-exported so existing imports keep working.
export { distanceKm, formatKm } from "../core/geo/distance"

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
