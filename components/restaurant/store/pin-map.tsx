"use client"

import { GooglePinMap } from "@/components/restaurant/store/google-pin-map"
import { LeafletPinMap } from "@/components/restaurant/store/leaflet-pin-map"

export type PinMapProps = {
  point: { lat: number; lng: number }
  onPick: (p: { lat: number; lng: number }) => void
  className?: string
  label: string
}

/** The draggable-pin map for choosing a delivery spot: Google Maps when NEXT_PUBLIC_GOOGLE_MAPS_KEY is set, otherwise OpenStreetMap. */
export function PinMap(props: PinMapProps) {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ? <GooglePinMap {...props} /> : <LeafletPinMap {...props} />
}
