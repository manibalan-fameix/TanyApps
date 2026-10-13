export type MapMarker = {
  id: string
  kind: "rider" | "guest" | "restaurant"
  lat: number
  lng: number
  label: string
  /** The last position is old: shown faded so nobody trusts it as live. */
  stale?: boolean
}

export type MapRoute = { id: string; points: [number, number][]; stale?: boolean }

export type LiveMapProps = {
  markers: MapMarker[]
  routes?: MapRoute[]
  focusId?: string | null
  className?: string
  label: string
}

export const GLYPH: Record<MapMarker["kind"], string> = { rider: "🛵", guest: "🏠", restaurant: "🍽️" }
