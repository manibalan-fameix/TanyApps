"use client"

import { useEffect, useRef } from "react"
import type { Map as LMap, Marker } from "leaflet"
import "leaflet/dist/leaflet.css"

import type { PinMapProps } from "@/components/restaurant/store/pin-map"
import { cn } from "@/lib/utils"

const TILES = process.env.NEXT_PUBLIC_MAP_TILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"

/**
 * A map with one pin the guest can drag, or move by tapping the map. `point` is where the pin should be; when it is
 * changed from outside (a search result, "use my current location") the pin and map follow. `onPick` is called when the
 * guest finishes moving the pin, not on every pixel of the drag.
 */
export function LeafletPinMap({ point, onPick, className, label }: PinMapProps) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<LMap | null>(null)
  const pin = useRef<Marker | null>(null)
  const latest = useRef({ point, onPick })
  useEffect(() => {
    latest.current = { point, onPick }
  })

  useEffect(() => {
    let cancelled = false
    let observer: ResizeObserver | null = null
    void import("leaflet").then((L) => {
      if (cancelled || !el.current || map.current) return
      const start = latest.current.point
      const mp = L.map(el.current, { zoomControl: true, scrollWheelZoom: true }).setView([start.lat, start.lng], 16)
      L.tileLayer(TILES, { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(mp)
      const icon = L.divIcon({
        className: "",
        iconSize: [40, 48],
        iconAnchor: [20, 46],
        html: '<div style="font-size:38px;line-height:1;filter:drop-shadow(0 3px 4px rgba(0,0,0,.4))">📍</div>',
      })
      const marker = L.marker([start.lat, start.lng], { icon, draggable: true, title: "Drag to set your delivery spot", alt: "Delivery pin" }).addTo(mp)
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLatLng()
        latest.current.onPick({ lat, lng })
      })
      mp.on("click", (e) => {
        marker.setLatLng(e.latlng)
        latest.current.onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
      })
      map.current = mp
      pin.current = marker
      // The dialog animates open, so the map may be measured at the wrong size at first.
      observer = new ResizeObserver(() => mp.invalidateSize())
      observer.observe(el.current)
    })
    return () => {
      cancelled = true
      observer?.disconnect()
      map.current?.remove()
      map.current = null
      pin.current = null
    }
  }, [])

  // Follow a change made outside the map (search result, current location).
  useEffect(() => {
    const m = pin.current
    const mp = map.current
    if (!m || !mp) return
    const at = m.getLatLng()
    if (Math.abs(at.lat - point.lat) > 1e-7 || Math.abs(at.lng - point.lng) > 1e-7) {
      m.setLatLng([point.lat, point.lng])
      mp.setView([point.lat, point.lng], Math.max(mp.getZoom(), 16))
    }
  }, [point.lat, point.lng])

  return <div ref={el} role="application" aria-label={label} className={cn("isolate z-0 h-72 w-full overflow-hidden rounded-xl border bg-muted", className)} />
}
