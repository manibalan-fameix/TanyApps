/**
 * Place search and routing for TanyCabs, behind one interface so the screens do not care whether Google or the free
 * OpenStreetMap services answer. Callers hold a place by its `placeId` (which Google lets us store indefinitely) and ask for
 * details only after the person has chosen.
 */
export type PlaceSuggestion = { placeId: string; primary: string; secondary: string; /** Straight-line metres from the `origin` given to autocomplete, when there was one. */ distanceM?: number }

/** Where the customer is now, to rank and measure suggestions from. */
export type Origin = { lat: number; lng: number }

export type PlaceDetail = {
  placeId: string
  name: string
  address: string
  lat: number
  lng: number
  /** Two-letter state code (TN), when the provider says which state the place is in. */
  stateCode: string | null
  /** Two-digit GST state code, from the same state. */
  gstStateCode: string | null
}

export type RouteResult = {
  distanceM: number
  durationS: number
  /** Estimated tolls in paise. Null means unknown, which is not the same as free. */
  tollEstimatePaise: number | null
  /** Where the figure came from. "manual" is a distance the operator entered; providers only ever return google or osrm. */
  source: "google" | "osrm" | "manual"
}

/** A place that is either known by id or by coordinates (a pin on a map, a saved address). */
export type PlaceRef = { placeId: string; lat?: number; lng?: number }

export interface PlacesProvider {
  readonly name: "google" | "osm"
  /** Suggestions for what the person has typed so far. `sessionToken` groups the typing and the final choice for billing. */
  autocomplete(query: string, sessionToken: string, origin?: Origin): Promise<PlaceSuggestion[]>
  /** The chosen place. Passing the same `sessionToken` ends the autocomplete session. */
  details(placeId: string, sessionToken: string): Promise<PlaceDetail | null>
  /** Road distance and time by car. Null when no route could be found or the service is unavailable. */
  route(from: PlaceRef, to: PlaceRef): Promise<RouteResult | null>
}

/** Google asks for a version 4 UUID per session. The browser makes one (crypto.randomUUID()) and the server checks its shape. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const isSessionToken = (v: unknown): v is string => typeof v === "string" && UUID_V4.test(v)

/** The least the server will search for: one or two letters make expensive, useless requests. */
export const MIN_QUERY_LENGTH = 3
export const MAX_QUERY_LENGTH = 120
