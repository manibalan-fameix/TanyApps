"use client"

import { useEffect, useRef } from "react"

import { GLYPH, type LiveMapProps, type MapMarker } from "@/components/restaurant/map-types"
import { cn } from "@/lib/utils"

export const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ""

let loading: Promise<void> | null = null
/** Loads the Google Maps script once per page, however many maps are shown. A map load is what Google bills, so there is exactly one. */
export function loadGoogle(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"))
  if (window.google?.maps) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const cb = "__tanyGoogleReady"
    ;(window as unknown as Record<string, () => void>)[cb] = () => resolve()
    const s = document.createElement("script")
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_KEY)}&callback=${cb}&v=weekly`
    s.async = true
    s.onerror = () => {
      loading = null
      reject(new Error("Google Maps failed to load"))
    }
    document.head.appendChild(s)
  })
  return loading
}

/** The theme's primary colour as plain rgb: Google cannot read oklch() and other modern colour syntax. */
function themeColor(el: HTMLElement): string {
  try {
    const raw = getComputedStyle(el).getPropertyValue("--primary").trim()
    const c = document.createElement("canvas")
    c.width = c.height = 1
    const ctx = c.getContext("2d")
    if (!raw || !ctx) return "#15803d"
    ctx.fillStyle = raw
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return `rgb(${r},${g},${b})`
  } catch {
    return "#15803d"
  }
}

function iconFor(m: MapMarker): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="white" stroke="#d4d4d8" stroke-width="2"/><text x="20" y="27" font-size="20" text-anchor="middle">${GLYPH[m.kind]}</text></svg>`
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20) }
}

/**
 * The Google Maps version of the live map. The map is created once. After that a rider's new position only calls
 * `marker.setPosition(...)`: no new map load, no redraw, no extra Google request. Positions themselves never touch Google;
 * they come over the tracker's WebSocket (or polling) and are applied here.
 */
export function GoogleMap({ markers, routes = [], focusId, className, label }: LiveMapProps) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.Map | null>(null)
  const placed = useRef(new Map<string, google.maps.Marker>())
  const lines = useRef(new Map<string, google.maps.Polyline>())
  const color = useRef("#15803d")
  const fitted = useRef("")
  const latest = useRef({ markers, routes, focusId })
  useEffect(() => {
    latest.current = { markers, routes, focusId }
  })

  const sync = () => {
    const mp = map.current
    if (!mp) return
    const { markers: list, routes: paths, focusId: focus } = latest.current

    const seen = new Set<string>()
    for (const m of list) {
      seen.add(m.id)
      const existing = placed.current.get(m.id)
      if (existing) {
        existing.setPosition({ lat: m.lat, lng: m.lng })
        existing.setOpacity(m.stale ? 0.45 : 1)
      } else {
        placed.current.set(m.id, new google.maps.Marker({ map: mp, position: { lat: m.lat, lng: m.lng }, icon: iconFor(m), title: m.label, opacity: m.stale ? 0.45 : 1 }))
      }
    }
    for (const [id, marker] of placed.current) {
      if (!seen.has(id)) {
        marker.setMap(null)
        placed.current.delete(id)
      }
    }

    const drawn = new Set<string>()
    for (const r of paths) {
      if (r.points.length < 2) continue
      drawn.add(r.id)
      const path = r.points.map(([lat, lng]) => ({ lat, lng }))
      const line = lines.current.get(r.id)
      if (line) {
        line.setPath(path)
        line.setOptions({ strokeOpacity: r.stale ? 0.4 : 0.85 })
      } else lines.current.set(r.id, new google.maps.Polyline({ map: mp, path, strokeColor: color.current, strokeOpacity: r.stale ? 0.4 : 0.85, strokeWeight: 5 }))
    }
    for (const [id, line] of lines.current) {
      if (!drawn.has(id)) {
        line.setMap(null)
        lines.current.delete(id)
      }
    }

    if (list.length === 0) return
    const key = list.map((m) => m.id).sort().join("|")
    if (focus) {
      const f = list.find((m) => m.id === focus)
      if (f && fitted.current !== `${key}@${focus}`) {
        fitted.current = `${key}@${focus}`
        mp.setCenter({ lat: f.lat, lng: f.lng })
        mp.setZoom(Math.max(mp.getZoom() ?? 0, 15))
        return
      }
    }
    // Fit when the set of markers changes, and again if one drifts out of view. Otherwise leave the map where the viewer put it.
    const view = mp.getBounds()
    const out = !!view && list.some((m) => !view.contains({ lat: m.lat, lng: m.lng }))
    if (fitted.current !== key || out) {
      fitted.current = key
      if (list.length === 1) {
        mp.setCenter({ lat: list[0].lat, lng: list[0].lng })
        mp.setZoom(Math.max(mp.getZoom() ?? 0, 15))
      } else {
        const b = new google.maps.LatLngBounds()
        for (const m of list) b.extend({ lat: m.lat, lng: m.lng })
        mp.fitBounds(b, 48)
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    const markersMap = placed.current
    const linesMap = lines.current
    void loadGoogle().then(() => {
      if (cancelled || !el.current || map.current) return
      color.current = themeColor(el.current)
      map.current = new google.maps.Map(el.current, { center: { lat: 20.5937, lng: 78.9629 }, zoom: 5, disableDefaultUI: true, zoomControl: true, gestureHandling: "cooperative", clickableIcons: false })
      sync()
    })
    return () => {
      cancelled = true
      for (const m of markersMap.values()) m.setMap(null)
      for (const l of linesMap.values()) l.setMap(null)
      markersMap.clear()
      linesMap.clear()
      map.current = null
      fitted.current = ""
    }
    // The map is built once; later changes arrive through the sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(sync)

  return <div ref={el} role="region" aria-label={label} className={cn("isolate z-0 h-72 w-full overflow-hidden rounded-xl border bg-muted", className)} />
}
