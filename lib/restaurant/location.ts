import { z } from "zod"

import { validCoords } from "../core/geo/validate"

// The generic parts moved to lib/core/geo; these re-exports keep the existing imports working.
export { INDIA_BOUNDS, validCoords } from "../core/geo/validate"
export { mapsUrl } from "../core/geo/links"
export { type Geocoded, parseNominatim } from "../core/geo/nominatim"

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
