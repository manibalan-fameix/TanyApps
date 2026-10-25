"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Navigation03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Circle as LCircle, Map as LMap, Marker as LMarker } from "leaflet"
import "leaflet/dist/leaflet.css"

import { GOOGLE_KEY, loadGoogle } from "@/components/restaurant/google-map"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Without a Google key: a clean light basemap (CARTO Positron). NEXT_PUBLIC_MAP_TILES_URL swaps in any other tile host.
const TILES = process.env.NEXT_PUBLIC_MAP_TILES_URL || "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
const ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_TILES_URL ? "" : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const USER_ZOOM = 15

/**
 * The map centre that puts (lat, lng) `dy` pixels above the middle of the screen at this zoom (Web Mercator). The sheet covers the
 * middle of a phone screen, so the customer's dot has to sit higher up. Worked out here, not with `panBy`, because both map
 * libraries apply a pan asynchronously after a zoom change and the offset got lost.
 */
function centreBelow(lat: number, lng: number, zoom: number, dy: number): [number, number] {
  const size = 256 * 2 ** zoom
  const y = (0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)) * size + dy
  const n = Math.PI - (2 * Math.PI * y) / size
  return [(180 / Math.PI) * Math.atan(Math.sinh(n)), lng]
}

/** What the two map engines (Google, Leaflet) have in common, so the locate logic is written once. */
type Engine = {
  /** Centre the map on a point, then shift it up so the point shows above the bottom sheet rather than behind it. */
  show: (lat: number, lng: number, accuracyM: number, dy: number) => void
}

/**
 * The map behind the booking sheet, shown in the real Google Maps light style (or a light OpenStreetMap-based basemap when no
 * Google key is set). It opens on the customer's current location when the browser allows it, and otherwise on the operator's city.
 * It is only a backdrop: no place is chosen on it.
 */
export function BackdropMap({ centre, zoom, label, locateLabel, className }: { centre: [number, number]; zoom: number; label: string; locateLabel: string; className?: string }) {
  const el = useRef<HTMLDivElement>(null)
  const engine = useRef<Engine | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    let cleanup = () => {}
    const done = (e: Engine, undo: () => void) => {
      if (cancelled) return undo()
      engine.current = e
      cleanup = undo
      setReady(true)
    }

    if (GOOGLE_KEY) {
      void loadGoogle().then(() => {
        if (cancelled || !el.current) return
        // Google's own default style is the light "live map" look; only the clutter that fights the sheet is switched off.
        const map = new google.maps.Map(el.current, { center: { lat: centre[0], lng: centre[1] }, zoom, disableDefaultUI: true, gestureHandling: "greedy", clickableIcons: false, keyboardShortcuts: false })
        let dot: google.maps.Marker | null = null
        let halo: google.maps.Circle | null = null
        done(
          {
            show(lat, lng, accuracyM, dy) {
              const at = { lat, lng }
              const [cLat, cLng] = centreBelow(lat, lng, USER_ZOOM, dy)
              map.setZoom(USER_ZOOM)
              map.setCenter({ lat: cLat, lng: cLng })
              if (dot) dot.setPosition(at)
              else dot = new google.maps.Marker({ map, position: at, clickable: false, zIndex: 2, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#4285F4", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 } })
              if (halo) {
                halo.setCenter(at)
                halo.setRadius(Math.max(accuracyM, 30))
              } else halo = new google.maps.Circle({ map, center: at, radius: Math.max(accuracyM, 30), fillColor: "#4285F4", fillOpacity: 0.14, strokeWeight: 0, clickable: false })
            },
          },
          () => {
            dot?.setMap(null)
            halo?.setMap(null)
          },
        )
      })
    } else {
      let observer: ResizeObserver | null = null
      let map: LMap | null = null
      void import("leaflet").then((L) => {
        if (cancelled || !el.current) return
        map = L.map(el.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false }).setView(centre, zoom)
        L.tileLayer(TILES, { maxZoom: 19, subdomains: "abcd" }).addTo(map)
        if (ATTRIBUTION) L.control.attribution({ position: "bottomleft", prefix: false }).addAttribution(ATTRIBUTION).addTo(map)
        observer = new ResizeObserver(() => map?.invalidateSize())
        observer.observe(el.current)
        let dot: LMarker | null = null
        let halo: LCircle | null = null
        const icon = L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11], html: '<div style="width:22px;height:22px;border-radius:9999px;background:#4285F4;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>' })
        done(
          {
            show(lat, lng, accuracyM, dy) {
              if (!map) return
              map.setView(centreBelow(lat, lng, USER_ZOOM, dy), USER_ZOOM, { animate: false })
              if (dot) dot.setLatLng([lat, lng])
              else dot = L.marker([lat, lng], { icon, interactive: false, keyboard: false }).addTo(map)
              if (halo) halo.setLatLng([lat, lng]).setRadius(Math.max(accuracyM, 30))
              else halo = L.circle([lat, lng], { radius: Math.max(accuracyM, 30), stroke: false, fillColor: "#4285F4", fillOpacity: 0.14, interactive: false }).addTo(map)
            },
          },
          () => {
            observer?.disconnect()
            map?.remove()
            map = null
          },
        )
      })
    }

    return () => {
      cancelled = true
      engine.current = null
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once; the centre only matters at the start
  }, [])

  /** Asks the browser where the customer is and moves the map there. `finished` runs when the answer (or a refusal) arrives. */
  const requestFix = useCallback((finished?: () => void) => {
    if (!navigator.geolocation) return finished?.()
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        finished?.()
        const box = el.current?.getBoundingClientRect()
        // The sheet rests over the lower part of the screen, so the visible map is a band near the top: put the dot in the middle of that band.
        const height = box?.height ?? window.innerHeight
        const narrow = window.matchMedia("(max-width: 767px)").matches
        const visibleCentre = narrow ? (64 + height * 0.4 + 56) / 2 : height / 2
        engine.current?.show(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, height / 2 - visibleCentre)
      },
      () => finished?.(),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [])

  // Open on where the customer is. If they decline or the browser cannot say, the map simply stays on the operator's city.
  useEffect(() => {
    if (ready) requestFix()
  }, [ready, requestFix])

  return (
    <div className={cn("absolute inset-0 isolate z-0 bg-muted", className)}>
      <div ref={el} role="application" aria-label={label} className="size-full" />
      <Button type="button" variant="secondary" size="icon" aria-label={locateLabel} disabled={busy} onClick={() => (setBusy(true), requestFix(() => setBusy(false)))} className="absolute top-[calc(var(--safe-area-inset-top,0px)+4.75rem)] right-3 z-10 size-10 rounded-xl shadow-md">
        <HugeiconsIcon icon={Navigation03Icon} strokeWidth={2} className="size-5" />
      </Button>
    </div>
  )
}
