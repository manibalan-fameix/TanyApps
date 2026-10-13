"use client"

import { useEffect, useRef } from "react"

import { loadGoogle } from "@/components/restaurant/google-map"
import type { PinMapProps } from "@/components/restaurant/store/pin-map"
import { cn } from "@/lib/utils"

/** Google Maps version of the delivery-spot picker: one draggable pin, or tap the map to move it. */
export function GooglePinMap({ point, onPick, className, label }: PinMapProps) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.Map | null>(null)
  const pin = useRef<google.maps.Marker | null>(null)
  const latest = useRef({ point, onPick })
  useEffect(() => {
    latest.current = { point, onPick }
  })

  useEffect(() => {
    let cancelled = false
    void loadGoogle().then(() => {
      if (cancelled || !el.current || map.current) return
      const start = latest.current.point
      const mp = new google.maps.Map(el.current, { center: start, zoom: 16, disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy", clickableIcons: false })
      const marker = new google.maps.Marker({ map: mp, position: start, draggable: true, title: "Drag to set your delivery spot" })
      marker.addListener("dragend", () => {
        const at = marker.getPosition()
        if (at) latest.current.onPick({ lat: at.lat(), lng: at.lng() })
      })
      mp.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return
        marker.setPosition(e.latLng)
        latest.current.onPick({ lat: e.latLng.lat(), lng: e.latLng.lng() })
      })
      map.current = mp
      pin.current = marker
    })
    return () => {
      cancelled = true
      pin.current?.setMap(null)
      pin.current = null
      map.current = null
    }
  }, [])

  // Follow a change made outside the map (search result, current location).
  useEffect(() => {
    const m = pin.current
    const mp = map.current
    const at = m?.getPosition()
    if (!m || !mp || !at) return
    if (Math.abs(at.lat() - point.lat) > 1e-7 || Math.abs(at.lng() - point.lng) > 1e-7) {
      m.setPosition(point)
      mp.setCenter(point)
      mp.setZoom(Math.max(mp.getZoom() ?? 0, 16))
    }
  }, [point])

  return <div ref={el} role="application" aria-label={label} className={cn("isolate z-0 h-72 w-full overflow-hidden rounded-xl border bg-muted", className)} />
}
