"use client"

import { useEffect, useRef } from "react"
import type { DivIcon, Map as LMap, Marker, Polyline } from "leaflet"
import "leaflet/dist/leaflet.css"

import { GLYPH, type LiveMapProps, type MapMarker } from "@/components/restaurant/map-types"
import { cn } from "@/lib/utils"

const TILES = process.env.NEXT_PUBLIC_MAP_TILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"

/**
 * A live map: markers are moved in place as new positions arrive, so a rider glides instead of the map redrawing.
 * Built on Leaflet with OpenStreetMap tiles (no account or key; set NEXT_PUBLIC_MAP_TILES_URL for another provider).
 */
export function LeafletMap({ markers, routes = [], focusId, className, label }: LiveMapProps) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<LMap | null>(null)
  const leaflet = useRef<typeof import("leaflet") | null>(null)
  const placed = useRef(new Map<string, Marker>())
  const lines = useRef(new Map<string, Polyline>())
  const fitted = useRef("")
  const latest = useRef({ markers, routes, focusId })
  useEffect(() => {
    latest.current = { markers, routes, focusId }
  })

  const icon = (L: typeof import("leaflet"), m: MapMarker): DivIcon =>
    L.divIcon({
      className: "",
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      html: `<div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:9999px;font-size:20px;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff;background:${m.kind === "rider" ? "var(--primary,#15803d)" : "#fff"};opacity:${m.stale ? 0.45 : 1}">${GLYPH[m.kind]}</div>`,
    })

  const sync = () => {
    const L = leaflet.current
    const mp = map.current
    if (!L || !mp) return
    const { markers: list, routes: paths, focusId: focus } = latest.current
    const drawn = new Set<string>()
    for (const r of paths) {
      if (r.points.length < 2) continue
      drawn.add(r.id)
      const line = lines.current.get(r.id)
      if (line) line.setLatLngs(r.points)
      else {
        const created = L.polyline(r.points, { weight: 5, opacity: 0.85, lineCap: "round", lineJoin: "round" }).addTo(mp)
        // Theme colour: Leaflet writes colours as attributes, which cannot hold a CSS variable, so set it as a style.
        const path = created.getElement() as SVGElement | undefined
        if (path) path.style.stroke = "var(--primary, #15803d)"
        lines.current.set(r.id, created)
      }
      const el2 = lines.current.get(r.id)?.getElement() as SVGElement | undefined
      if (el2) el2.style.opacity = r.stale ? "0.4" : "0.85"
    }
    for (const [id, line] of lines.current) {
      if (!drawn.has(id)) {
        line.remove()
        lines.current.delete(id)
      }
    }
    const seen = new Set<string>()
    for (const m of list) {
      seen.add(m.id)
      const existing = placed.current.get(m.id)
      if (existing) {
        existing.setLatLng([m.lat, m.lng])
        existing.setIcon(icon(L, m))
        existing.getElement()?.setAttribute("aria-label", m.label)
      } else {
        const marker = L.marker([m.lat, m.lng], { icon: icon(L, m), title: m.label, alt: m.label, keyboard: false }).addTo(mp)
        placed.current.set(m.id, marker)
      }
    }
    for (const [id, marker] of placed.current) {
      if (!seen.has(id)) {
        marker.remove()
        placed.current.delete(id)
      }
    }
    if (list.length === 0) return
    const key = list.map((m) => m.id).sort().join("|")
    const points = list.map((m) => [m.lat, m.lng] as [number, number])
    if (focus) {
      const f = list.find((m) => m.id === focus)
      if (f && fitted.current !== `${key}@${focus}`) {
        fitted.current = `${key}@${focus}`
        mp.setView([f.lat, f.lng], Math.max(mp.getZoom(), 15))
        return
      }
    }
    // Fit when the set of markers changes, and again if one drifts out of view. Otherwise leave the map where the viewer put it.
    const out = points.some((p) => !mp.getBounds().contains(p))
    if (fitted.current !== key || out) {
      fitted.current = key
      if (points.length === 1) mp.setView(points[0], Math.max(mp.getZoom(), 15))
      else mp.fitBounds(points, { padding: [48, 48], maxZoom: 16 })
    }
  }

  useEffect(() => {
    let cancelled = false
    void import("leaflet").then((L) => {
      if (cancelled || !el.current || map.current) return
      leaflet.current = L
      const mp = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([20.5937, 78.9629], 5)
      L.tileLayer(TILES, { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(mp)
      map.current = mp
      sync()
    })
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
      placed.current.clear()
      lines.current.clear()
      fitted.current = ""
    }
    // The map is built once; later changes arrive through the sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(sync)

  // `isolate` keeps Leaflet's high z-index layers beneath dialogs and the sticky header.
  return <div ref={el} role="region" aria-label={label} className={cn("isolate z-0 h-72 w-full overflow-hidden rounded-xl border bg-muted", className)} />
}
