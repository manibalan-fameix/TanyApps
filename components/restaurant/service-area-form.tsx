"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Location01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "@/lib/toast"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { describeSpot, findPlaces, saveServiceArea } from "@/lib/restaurant/admin-actions"
import type { Place } from "@/lib/restaurant/geocode"
import { mapsUrl, validCoords } from "@/lib/restaurant/location"
import { MAX_RADIUS_KM, MIN_RADIUS_KM, type ServiceArea, formatKm, osmEmbedUrl } from "@/lib/restaurant/service-area"

const DEFAULT_RADIUS = 5

/** Where the restaurant is and how far it delivers. The owner can use this device's location, search an address, or type coordinates. */
export function ServiceAreaForm({ initial, disabled }: { initial: ServiceArea | null; disabled: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [lat, setLat] = useState<number | null>(initial?.lat ?? null)
  const [lng, setLng] = useState<number | null>(initial?.lng ?? null)
  const [address, setAddress] = useState(initial?.address ?? "")
  const [limit, setLimit] = useState(initial ? initial.radiusKm !== null : true)
  const [radius, setRadius] = useState(initial?.radiusKm ?? DEFAULT_RADIUS)
  const [query, setQuery] = useState("")
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [busy, setBusy] = useState<"gps" | "search" | null>(null)
  const [manual, setManual] = useState({ lat: initial ? String(initial.lat) : "", lng: initial ? String(initial.lng) : "" })

  const has = lat !== null && lng !== null && validCoords(lat, lng)

  function choose(la: number, ln: number, label: string) {
    setLat(la)
    setLng(ln)
    setAddress(label)
    setManual({ lat: la.toFixed(6), lng: ln.toFixed(6) })
    setPlaces(null)
  }

  async function pinThisDevice() {
    if (!navigator.geolocation) return void toast.error("This browser cannot share its location.")
    setBusy("gps")
    const pos = await new Promise<GeolocationPosition | GeolocationPositionError>((r) => navigator.geolocation.getCurrentPosition(r, r, { enableHighAccuracy: true, timeout: 12_000 }))
    if (!("coords" in pos)) {
      setBusy(null)
      return void toast.error(pos.code === 1 ? "Location is blocked for this site. Allow it in the address bar, or search for the address." : "Could not get this device's location.")
    }
    const { latitude, longitude } = pos.coords
    if (!validCoords(latitude, longitude)) {
      setBusy(null)
      return void toast.error("That location is outside India.")
    }
    const spot = await describeSpot(latitude, longitude).catch(() => null)
    choose(latitude, longitude, spot && spot.ok ? spot.address : "")
    setBusy(null)
  }

  async function search() {
    if (query.trim().length < 3) return void toast.error("Type at least 3 letters of the address.")
    setBusy("search")
    const res = await findPlaces(query).catch(() => null)
    setBusy(null)
    if (!res || !res.ok) return void toast.error(res ? res.error : "Search failed. Try again.")
    setPlaces(res.places)
    if (res.places.length === 0) toast.error("No places found. Try the area and city, or use your current location.")
  }

  function applyManual() {
    const la = Number(manual.lat)
    const ln = Number(manual.lng)
    if (!validCoords(la, ln)) return void toast.error("Enter latitude and longitude for a place in India, like 13.0418 and 80.2341.")
    choose(la, ln, address)
  }

  function save() {
    if (!has) return void toast.error("Choose the restaurant's location first.")
    start(async () => {
      const res = await saveServiceArea({ lat, lng, address, radiusKm: limit ? radius : null })
      if (res.ok) {
        toast.success("Location and range saved.")
        router.refresh()
      } else toast.error(res.error)
    })
  }

  return (
    <FieldGroup className="max-w-xl">
      <Field>
        <FieldLabel>Restaurant location</FieldLabel>
        <FieldDescription>Delivery distance is measured from here. Guests also get a Get directions link.</FieldDescription>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={disabled || busy !== null} onClick={() => void pinThisDevice()}>
            <HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="size-4" />
            {busy === "gps" ? "Finding this device…" : "Use my current location"}
          </Button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void search()
          }}
        >
          <Input aria-label="Search for the restaurant's address" placeholder="Or search an address, e.g. South Usman Road, T. Nagar" value={query} disabled={disabled} onChange={(e) => setQuery(e.target.value)} />
          <Button type="submit" variant="outline" size="icon" aria-label="Search" disabled={disabled || busy !== null}>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </Button>
        </form>
        {places && places.length > 0 ? (
          <ul className="divide-y overflow-hidden rounded-xl border text-sm" aria-label="Search results">
            {places.map((p, i) => (
              <li key={`${p.lat},${p.lng},${i}`}>
                <button type="button" className="w-full p-3 text-left transition-colors hover:bg-muted" onClick={() => choose(p.lat, p.lng, p.label)}>
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Field>

      {has ? (
        <div className="grid gap-2">
          <div className="overflow-hidden rounded-xl border">
            <iframe title="Map of the restaurant's location" src={osmEmbedUrl(lat, lng, limit ? radius : null)} className="h-56 w-full" loading="lazy" referrerPolicy="no-referrer" />
          </div>
          <p className="text-sm">
            <span className="font-medium">{address || "Your pinned location"}</span>
            <span className="text-muted-foreground"> · {lat.toFixed(5)}, {lng.toFixed(5)} · </span>
            <a className="underline" target="_blank" rel="noreferrer" href={mapsUrl(lat, lng)}>Open in Maps</a>
          </p>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No location set yet. Use your current location or search for the address above.</p>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Type coordinates instead</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input aria-label="Latitude" inputMode="decimal" placeholder="Latitude, 13.0418" value={manual.lat} disabled={disabled} onChange={(e) => setManual({ ...manual, lat: e.target.value })} />
          <Input aria-label="Longitude" inputMode="decimal" placeholder="Longitude, 80.2341" value={manual.lng} disabled={disabled} onChange={(e) => setManual({ ...manual, lng: e.target.value })} />
          <Button type="button" variant="outline" disabled={disabled} onClick={applyManual}>Set</Button>
        </div>
      </details>

      <Field>
        <div className="flex items-center gap-3">
          <Checkbox id="sa-limit" checked={limit} disabled={disabled} onCheckedChange={(v) => setLimit(Boolean(v))} />
          <FieldLabel htmlFor="sa-limit">Limit delivery to a distance</FieldLabel>
        </div>
        <FieldDescription>On: anyone inside the distance can order delivery, and your delivery zones only set the charge and time. Off: only pincodes inside your delivery zones can order. Pickup and dine in are never limited.</FieldDescription>
      </Field>

      {limit ? (
        <Field>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor="sa-radius">Maximum delivery distance</FieldLabel>
            <div className="flex items-center gap-2">
              <Input id="sa-radius" className="w-24" inputMode="decimal" value={String(radius)} disabled={disabled} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setRadius(Math.min(MAX_RADIUS_KM, Math.max(0, n))) }} onBlur={() => setRadius((r) => Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, r)))} />
              <span className="text-sm text-muted-foreground">km</span>
            </div>
          </div>
          <Slider aria-label="Maximum delivery distance in kilometres" min={1} max={50} step={0.5} value={[Math.min(50, Math.max(1, radius))]} disabled={disabled} onValueChange={(v) => setRadius(Array.isArray(v) ? v[0] : v)} />
          <FieldDescription>
            {has
              ? `Guests more than ${formatKm(radius)} km in a straight line from ${address ? "this address" : "your location"} cannot order delivery. Roads are longer than the straight line, so keep some margin.`
              : "Set the location first. The distance is measured from it."}
          </FieldDescription>
        </Field>
      ) : null}

      <Button type="button" className="w-fit" disabled={pending || disabled} onClick={save}>
        {pending ? "Saving…" : "Save location and range"}
      </Button>
    </FieldGroup>
  )
}
