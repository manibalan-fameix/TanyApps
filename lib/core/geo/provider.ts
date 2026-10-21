import { type Place, pincodeCentre, reverseGeocode, searchPlaces } from "./geocode"
import type { Geocoded } from "./nominatim"

/**
 * What the app needs from a maps service. Today only OpenStreetMap's Nominatim implements it (fine for development and
 * light use; its usage policy rules out production traffic). Phase 1 adds a Google Places/Routes implementation behind this
 * same interface and chooses between them with GEO_PROVIDER.
 */
export interface GeoProvider {
  readonly name: string
  /** Places in India matching what the user typed. */
  searchPlaces(query: string): Promise<Place[]>
  /** The address and pincode for a point, or null outside India / when nothing is found. */
  reverseGeocode(lat: number, lng: number): Promise<Geocoded | null>
  /** The middle of a pincode, or null when it cannot be found. */
  pincodeCentre(pincode: string): Promise<{ lat: number; lng: number } | null>
}

export const nominatimProvider: GeoProvider = { name: "nominatim", searchPlaces, reverseGeocode, pincodeCentre }

const providers: Record<string, GeoProvider> = { nominatim: nominatimProvider }

/** The provider named by GEO_PROVIDER (default "nominatim"). An unknown name is an error, not a silent fallback. */
export function getGeoProvider(name = process.env.GEO_PROVIDER?.trim() || "nominatim"): GeoProvider {
  const provider = providers[name]
  if (!provider) throw new Error(`Unknown GEO_PROVIDER "${name}". Known: ${Object.keys(providers).join(", ")}`)
  return provider
}
