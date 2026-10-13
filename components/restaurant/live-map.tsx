"use client"

import { GoogleMap } from "@/components/restaurant/google-map"
import { LeafletMap } from "@/components/restaurant/leaflet-map"
import type { LiveMapProps } from "@/components/restaurant/map-types"

export type { MapMarker, MapRoute } from "@/components/restaurant/map-types"

/**
 * The live map used everywhere. Google Maps when NEXT_PUBLIC_GOOGLE_MAPS_KEY is set, otherwise OpenStreetMap (Leaflet),
 * so nothing breaks without a key. Both take the same props and move markers in place as positions arrive.
 */
export function LiveMap(props: LiveMapProps) {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ? <GoogleMap {...props} /> : <LeafletMap {...props} />
}
