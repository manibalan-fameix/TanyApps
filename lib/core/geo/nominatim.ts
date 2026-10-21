export type Geocoded = { pincode: string; area: string; city: string; address: string; /** The state's name, e.g. "Tamil Nadu"; empty when unknown. */ state: string }

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
  return { pincode: /^[1-9]\d{5}$/.test(pin) ? pin : "", area, city, address: address || (j?.display_name ?? ""), state: a.state ?? "" }
}
