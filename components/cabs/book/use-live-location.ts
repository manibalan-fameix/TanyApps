"use client"

import { useEffect, useState } from "react"

import { distanceKm, formatKm } from "@/lib/core/geo/distance"

export type LivePoint = { lat: number; lng: number }

/** Where the customer is now, or null until the browser says (or when it is refused). The map asks first, so this rarely prompts again. */
export function useLiveLocation(): LivePoint | null {
  const [point, setPoint] = useState<LivePoint | null>(null)
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    )
  }, [])
  return point
}

/** "850 m", "1.2 km" or "42 km" between the customer and a place, or null when either is unknown. */
export function distanceLabel(from: LivePoint | null, to: { lat?: number | null; lng?: number | null } | null | undefined): string | null {
  if (!from || !to || typeof to.lat !== "number" || typeof to.lng !== "number") return null
  return meters(distanceKm(from, { lat: to.lat, lng: to.lng }) * 1000)
}

export function meters(m: number): string {
  return m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${formatKm(m / 1000)} km`
}
