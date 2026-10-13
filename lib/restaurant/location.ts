import { z } from "zod"

/** Roughly the box around India. A fix outside it is a mistake, a spoofed value, or someone abroad we cannot deliver to. */
export const INDIA_BOUNDS = { minLat: 6, maxLat: 38, minLng: 68, maxLng: 98 } as const

export function validCoords(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= INDIA_BOUNDS.minLat &&
    lat <= INDIA_BOUNDS.maxLat &&
    lng >= INDIA_BOUNDS.minLng &&
    lng <= INDIA_BOUNDS.maxLng
  )
}

/** What the browser keeps about where the guest wants their order. Coordinates are absent when they typed a pincode. */
export const guestLocationSchema = z.object({
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  pincode: z.string().regex(/^[1-9]\d{5}$/).or(z.literal("")),
  area: z.string().max(80),
  city: z.string().max(80),
  address: z.string().max(300),
  // gps: where the phone is; map: a spot the guest pinned or searched for; pincode: only a pincode was given.
  source: z.enum(["gps", "map", "pincode"]),
})
export type GuestLocation = z.infer<typeof guestLocationSchema>

/** Reads what was saved in the browser, ignoring anything damaged or tampered with. */
export function parseStoredLocation(raw: string | null): GuestLocation | null {
  if (!raw) return null
  try {
    const parsed = guestLocationSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    const l = parsed.data
    if (l.lat !== null && l.lng !== null && !validCoords(l.lat, l.lng)) return null
    return l
  } catch {
    return null
  }
}

export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

export type Geocoded = { pincode: string; area: string; city: string; address: string }

type NominatimAddress = Record<string, string | undefined>

/**
 * Turns an OpenStreetMap reverse-geocode answer into a pincode, a short area name and a street address.
 * Returns null when it does not describe a place in India.
 */
export function parseNominatim(json: unknown): Geocoded | null {
  const j = json as { address?: NominatimAddress; display_name?: string } | null
  const a = j?.address
  if (!a || (a.country_code && a.country_code.toLowerCase() !== "in")) return null
  const pin = (a.postcode ?? "").replace(/\s+/g, "")
  const area = a.suburb ?? a.neighbourhood ?? a.city_district ?? a.quarter ?? a.village ?? a.town ?? ""
  const city = a.city ?? a.town ?? a.county ?? a.state_district ?? ""
  const street = [a.house_number, a.road ?? a.pedestrian].filter(Boolean).join(", ")
  const address = [street, area, city, /^[1-9]\d{5}$/.test(pin) ? pin : ""].filter(Boolean).join(", ")
  return { pincode: /^[1-9]\d{5}$/.test(pin) ? pin : "", area, city, address: address || (j?.display_name ?? "") }
}
