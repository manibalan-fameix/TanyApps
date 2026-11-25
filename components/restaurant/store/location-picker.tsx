"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Location01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { type LocateResult, locateGuest, searchGuestPlaces } from "@/app/(tenant)/sites/[dealer]/actions"
import { PinMap } from "@/components/restaurant/store/pin-map"
import { useGuestLocation } from "@/components/restaurant/store/location"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ROUGH_ACCURACY_M, accuratePosition } from "@/lib/core/geo/accurate-position"
import type { Place } from "@/lib/restaurant/geocode"
import { formatKm } from "@/lib/restaurant/service-area"
import { cn } from "@/lib/utils"

type Point = { lat: number; lng: number }
// Used only when nothing is known yet: the middle of India, until the phone or a search says otherwise.
const INDIA: Point = { lat: 20.5937, lng: 78.9629 }

/**
 * "Update location": a map where the guest can search for a place, drag the pin (or tap the map) to the exact spot, or
 * use their phone's location. The spot is turned into an address and checked against the restaurant's delivery area
 * before it is confirmed.
 */
export function LocationPicker({ restaurant, themeVars, centre }: { restaurant: string; themeVars: React.CSSProperties; centre: Point | null }) {
  const { pickerOpen, setPickerOpen, location, check, choose } = useGuestLocation()
  const [point, setPoint] = useState<Point | null>(null)
  const [result, setResult] = useState<LocateResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [places, setPlaces] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const latestPick = useRef(0)
  /** Set while the pin is from a phone reading too rough to find a door, in metres. Cleared once the guest moves it. */
  const [roughM, setRoughM] = useState<number | null>(null)
  const latestFix = useRef(0)

  /** Works out the address and delivery answer for a spot. Only the newest request is used, so a quick second drag wins. */
  const resolve = useCallback(async (p: Point) => {
    const id = ++latestPick.current
    setBusy(true)
    setMessage(null)
    const r = await locateGuest(p.lat, p.lng).catch(() => null)
    if (id !== latestPick.current) return
    setBusy(false)
    if (!r) return setMessage("Something went wrong. Please try again.")
    if (!r.ok) {
      setResult(null)
      return setMessage(r.error)
    }
    setResult(r)
  }, [])

  const pick = useCallback(
    (p: Point) => {
      latestFix.current++
      setRoughM(null)
      setPoint(p)
      void resolve(p)
    },
    [resolve],
  )

  const fromPhone = useCallback(() => {
    if (!navigator.geolocation) return setMessage("This browser cannot share your location. Search for your place instead.")
    const id = ++latestFix.current
    setBusy(true)
    setMessage(null)
    accuratePosition(navigator.geolocation, { maxWaitMs: 12_000 }).then(
      (fix) => {
        // The guest moved the pin or searched while the phone was still looking: their choice stands.
        if (id !== latestFix.current) return
        pick({ lat: fix.lat, lng: fix.lng })
        setRoughM(fix.accuracy > ROUGH_ACCURACY_M ? Math.round(fix.accuracy) : null)
      },
      (err: { code?: number }) => {
        if (id !== latestFix.current) return
        setBusy(false)
        setMessage(err.code === 1 ? "Location is blocked for this site. Allow it in your browser's address bar, or search for your place." : "We could not get your location. Search for your place or drag the pin.")
      },
    )
  }, [pick])

  // Each time the picker opens: start from the saved spot, else the restaurant's area, and in either case when nothing is
  // saved also ask the phone, so the pin lands on the guest.
  /* eslint-disable react-hooks/set-state-in-effect -- resetting the picker's own state each time it opens */
  useEffect(() => {
    if (!pickerOpen) return
    setQuery("")
    setPlaces([])
    setMessage(null)
    setRoughM(null)
    if (location && location.lat !== null && location.lng !== null) {
      setPoint({ lat: location.lat, lng: location.lng })
      setResult(check ? { ok: true, pincode: location.pincode, area: location.area, city: location.city, address: location.address, ...check } : null)
      if (!check) void resolve({ lat: location.lat, lng: location.lng })
    } else {
      setPoint(centre ?? INDIA)
      setResult(null)
      fromPhone()
    }
    // Runs when the picker opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen])

  // Search as the guest types, after a short pause.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      setPlaces([])
      return
    }
    setSearching(true)
    const t = setTimeout(() => {
      void searchGuestPlaces(q)
        .then((r) => setPlaces(r.ok ? r.places : []))
        .catch(() => setPlaces([]))
        .finally(() => setSearching(false))
    }, 450)
    return () => {
      clearTimeout(t)
      setSearching(false)
    }
  }, [query])
  /* eslint-enable react-hooks/set-state-in-effect */

  const ok = result && result.ok ? result : null
  const deliverable = ok?.deliverable ?? false

  function confirm() {
    if (!ok || !point) return
    choose({ lat: point.lat, lng: point.lng, pincode: ok.pincode, area: ok.area, city: ok.city, address: ok.address, source: "map" }, ok)
  }

  return (
    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
      {/* The dialog is drawn outside the themed page, so it carries the restaurant's colours itself. */}
      <DialogContent className="max-w-2xl" style={themeVars}>
        <DialogHeader>
          <DialogTitle>Choose your delivery spot</DialogTitle>
          <DialogDescription>Search for your place, then drag the pin (or tap the map) to your exact door. {restaurant} delivers to that spot.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="relative">
            <Input aria-label="Search for a place" placeholder="Search your area, street or landmark" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
            {query.trim().length >= 3 && (places.length > 0 || searching) ? (
              <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-xl border bg-popover p-1 text-sm shadow-lg">
                {searching && places.length === 0 ? <li className="px-3 py-2 text-muted-foreground">Searching…</li> : null}
                {places.map((p) => (
                  <li key={`${p.lat},${p.lng}`}>
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left hover:bg-muted"
                      onClick={() => {
                        setQuery("")
                        setPlaces([])
                        pick({ lat: p.lat, lng: p.lng })
                      }}
                    >
                      {p.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <PinMap point={point ?? centre ?? INDIA} onPick={pick} label="Map: drag the pin to your delivery spot" />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-2" disabled={busy} onClick={fromPhone}>
              <HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="size-4" />
              Use my current location
            </Button>
            {busy ? <span className="text-sm text-muted-foreground" role="status">Checking this spot…</span> : null}
          </div>

          {roughM !== null && !busy ? <p role="alert" className="text-sm text-destructive">Your location is only accurate to about {roughM} m. Drag the pin, or tap the map, on your door.</p> : null}

          {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}

          {ok && !busy ? (
            <div className={cn("rounded-xl border p-3 text-sm", deliverable ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5")}>
              <p className="font-medium">{[ok.area, ok.city].filter(Boolean).join(", ") || "Your spot"}{ok.pincode ? ` · ${ok.pincode}` : ""}</p>
              {ok.address ? <p className="mt-0.5 text-muted-foreground">{ok.address}</p> : null}
              <p className={cn("mt-1.5 font-medium", deliverable ? "text-primary" : "text-destructive")}>
                {deliverable
                  ? `We deliver here${ok.etaMinutes ? ` in about ${ok.etaMinutes} min` : ""}${ok.fee !== null ? ` · ₹${ok.fee} delivery` : ""}${ok.radius?.distanceKm != null ? ` · ${formatKm(ok.radius.distanceKm)} km away` : ""}.`
                  : ok.reason === "radius" && ok.radius
                    ? `Sorry, this is ${ok.radius.distanceKm !== null ? `about ${formatKm(ok.radius.distanceKm)} km` : "too far"} away and we deliver up to ${formatKm(ok.radius.km)} km. You can still order for pickup.`
                    : "Sorry, we do not deliver to this area yet. You can still order for pickup."}
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setPickerOpen(false)}>Cancel</Button>
          <Button disabled={!ok || busy || roughM !== null} onClick={confirm}>{deliverable || !ok ? "Confirm this location" : "Use this spot anyway"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
