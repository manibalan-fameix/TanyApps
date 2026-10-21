import { createGoogleProvider } from "./google"
import { fixtureProvider } from "./fixture"
import { osmProvider } from "./osm"
import type { PlacesProvider } from "./places"

/**
 * Google when GOOGLE_MAPS_SERVER_KEY is set. Without a key, the free OpenStreetMap services are used outside production only;
 * in production no key means no place search (null), never a silent fallback to services whose usage policy forbids it.
 */
export function getPlacesProvider(env: Record<string, string | undefined> = process.env): PlacesProvider | null {
  // Test seam: a fake service for browser tests. Refused in production, whatever the variable says.
  if (env.GEO_FIXTURE === "1" && env.NODE_ENV !== "production") return fixtureProvider
  const apiKey = env.GOOGLE_MAPS_SERVER_KEY?.trim()
  if (apiKey) return createGoogleProvider({ apiKey, tolls: env.GOOGLE_ROUTES_TOLLS === "1" })
  return env.NODE_ENV === "production" ? null : osmProvider
}
