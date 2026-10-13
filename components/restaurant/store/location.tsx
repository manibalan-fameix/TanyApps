"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { Location01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { type AreaCheck, checkPincode, locateGuest } from "@/app/(tenant)/sites/[dealer]/actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { type GuestLocation, parseStoredLocation } from "@/lib/restaurant/location"
import { formatKm } from "@/lib/restaurant/service-area"
import { cn } from "@/lib/utils"

const LOCATION_KEY = "showmoto-location"
const ASKED_KEY = "showmoto-location-asked"
// Pages where a pop-up would get in the way: a rider's own page and the guest's order tracking.
const NO_PROMPT = [/^\/delivery(\/|$)/, /^\/o\//, /^\/checkout/]

type Status = "idle" | "locating" | "checking"
type Ctx = {
  location: GuestLocation | null
  check: AreaCheck | null
  open: boolean
  setOpen: (open: boolean) => void
  status: Status
  error: string | null
  /** The saved choice has been read from this browser; before that, `location` is still null. */
  ready: boolean
  /** The map where the guest searches, drags a pin and confirms the exact spot. */
  pickerOpen: boolean
  setPickerOpen: (open: boolean) => void
  /** Saves a spot chosen on the map. */
  choose: (location: GuestLocation, check: AreaCheck) => void
  /** Asks the phone where it is, then works out the address and whether this restaurant delivers there. */
  locate: () => Promise<void>
  submitPincode: (pincode: string) => Promise<void>
  /** Closes the prompt without choosing, and remembers not to ask again unprompted. */
  skip: () => void
  clear: () => void
}
const LocationContext = createContext<Ctx | null>(null)

export function useGuestLocation(): Ctx {
  const c = useContext(LocationContext)
  if (!c) throw new Error("useGuestLocation must be used inside LocationProvider")
  return c
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

function geoMessage(code: number | undefined): string {
  if (code === 1) return "Location is blocked for this site. Allow it in your browser's address bar, or enter your pincode below."
  if (code === 3) return "Finding your location took too long. Try again, or enter your pincode below."
  return "We could not get your location. Try again, or enter your pincode below."
}

/**
 * Remembers where the guest wants their order. The first visit opens a welcome prompt that asks to use their live
 * location; the answer is kept in this browser only, and is sent to the restaurant only with a delivery order.
 */
export function LocationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [location, setLocation] = useState<GuestLocation | null>(null)
  const [check, setCheck] = useState<AreaCheck | null>(null)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  // Read the saved choice after mount (not in initial state) so the server and first client render match.
  useEffect(() => {
    const saved = parseStoredLocation(read(LOCATION_KEY))
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocation(saved)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true)
    if (saved?.pincode) {
      // Zones can change, so the answer is checked again rather than trusted from the last visit.
      void checkPincode(saved.pincode).then((r) => r.ok && setCheck(r))
    } else if (!saved && read(ASKED_KEY) !== "1" && !NO_PROMPT.some((re) => re.test(window.location.pathname))) {
      setOpen(true)
    }
  }, [])

  const remember = useCallback((l: GuestLocation, c: AreaCheck | null) => {
    setLocation(l)
    setCheck(c)
    write(LOCATION_KEY, JSON.stringify(l))
    write(ASKED_KEY, "1")
  }, [])

  const locate = useCallback(async () => {
    setError(null)
    if (!navigator.geolocation) return setError("This browser cannot share your location. Enter your pincode below.")
    setStatus("locating")
    const pos = await new Promise<GeolocationPosition | GeolocationPositionError>((resolve) =>
      navigator.geolocation.getCurrentPosition(resolve, resolve, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 }),
    )
    if (!("coords" in pos)) {
      setStatus("idle")
      return setError(geoMessage(pos.code))
    }
    setStatus("checking")
    const r = await locateGuest(pos.coords.latitude, pos.coords.longitude).catch(() => null)
    setStatus("idle")
    if (!r) return setError("Something went wrong. Try again, or enter your pincode below.")
    if (!r.ok) return setError(r.error)
    remember({ lat: pos.coords.latitude, lng: pos.coords.longitude, pincode: r.pincode, area: r.area, city: r.city, address: r.address, source: "gps" }, r)
  }, [remember])

  const submitPincode = useCallback(
    async (pincode: string) => {
      setError(null)
      setStatus("checking")
      const r = await checkPincode(pincode).catch(() => null)
      setStatus("idle")
      if (!r) return setError("Something went wrong. Please try again.")
      if (!r.ok) return setError(r.error)
      remember({ lat: null, lng: null, pincode: r.pincode, area: r.area, city: r.city, address: "", source: "pincode" }, r)
    },
    [remember],
  )

  const choose = useCallback(
    (l: GuestLocation, c: AreaCheck) => {
      remember(l, c)
      setPickerOpen(false)
      setOpen(false)
      setError(null)
    },
    [remember],
  )

  const skip = useCallback(() => {
    write(ASKED_KEY, "1")
    setOpen(false)
    setError(null)
  }, [])
  const clear = useCallback(() => {
    write(LOCATION_KEY, null)
    setLocation(null)
    setCheck(null)
    setError(null)
  }, [])

  // Never ask on a page where the pop-up is in the way, even if the guest navigates there after the first load.
  const hidden = NO_PROMPT.some((re) => re.test(pathname))
  const value = useMemo<Ctx>(
    () => ({ location, check, open: open && !hidden, setOpen, status, error, ready, pickerOpen, setPickerOpen, choose, locate, submitPincode, skip, clear }),
    [location, check, open, hidden, status, error, ready, pickerOpen, setPickerOpen, choose, locate, submitPincode, skip, clear],
  )
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

/** The pill in the header: where we deliver to, and a way to change it. */
export function LocationChip({ className }: { className?: string }) {
  const { location, check, setOpen } = useGuestLocation()
  const label = location ? (location.pincode ? `${location.area || location.city || "Deliver to"} · ${location.pincode}` : "Location set") : "Set location"
  const bad = check ? !check.deliverable : false
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={location ? `Delivery location: ${label}. Change` : "Set your delivery location"}
      className={cn(
        "inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted",
        bad ? "border-destructive/50 text-destructive" : "text-foreground",
        className,
      )}
    >
      <HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="size-4 shrink-0 text-primary" />
      <span className="hidden truncate sm:inline">{label}</span>
    </button>
  )
}

/** The welcome prompt: use my live location, type a pincode, or skip. Also reopened from the header pill. */
export function LocationDialog({ restaurant, themeVars }: { restaurant: string; themeVars: React.CSSProperties }) {
  const { location, check, open, setOpen, status, error, locate, submitPincode, skip, clear } = useGuestLocation()
  const [pin, setPin] = useState("")
  const busy = status !== "idle"
  const done = location && check

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : skip())}>
      {/* The dialog is drawn outside the themed page, so it carries the restaurant's colours itself. */}
      <DialogContent className="max-w-md" style={themeVars}>
        <DialogHeader>
          <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="size-6" />
          </div>
          <DialogTitle>{done ? "Delivery location" : `Welcome to ${restaurant}`}</DialogTitle>
          <DialogDescription>
            {done
              ? "This is where we will deliver. You can change it any time."
              : "Share your live location so we can check we deliver to you, fill in your address and guide the rider to your door. It is used only for your delivery."}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="grid gap-3">
            <div className={cn("rounded-xl border p-4 text-sm", check.deliverable ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5")}>
              <p className="font-medium">{[location.area, location.city].filter(Boolean).join(", ") || "Your location"}{location.pincode ? ` · ${location.pincode}` : ""}</p>
              {location.address ? <p className="mt-1 text-muted-foreground">{location.address}</p> : null}
              <p className={cn("mt-2 font-medium", check.deliverable ? "text-primary" : "text-destructive")}>
                {check.deliverable
                  ? `${check.zone ? `We deliver here (${check.zone} zone)${check.etaMinutes ? ` in about ${check.etaMinutes} min` : ""}${check.fee !== null ? ` · ₹${check.fee} delivery` : ""}${check.minOrder ? ` · minimum order ₹${check.minOrder}` : ""}.` : "We deliver here."}${check.radius?.distanceKm != null ? ` You are about ${formatKm(check.radius.distanceKm)} km away.` : ""}`
                  : check.reason === "radius" && check.radius
                    ? `Sorry, you are ${check.radius.distanceKm !== null ? `about ${formatKm(check.radius.distanceKm)} km` : "too far"} from us and we deliver up to ${formatKm(check.radius.km)} km. You can still order for pickup.`
                    : "Sorry, we do not deliver to this area yet. You can still order for pickup."}
              </p>
            </div>
            <DialogFooter className="gap-2 sm:flex-col">
              <Button size="lg" onClick={() => setOpen(false)}>{check.deliverable ? "Continue" : "Order for pickup"}</Button>
              <Button variant="outline" onClick={() => { clear(); setPin("") }}>Change location</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <Button size="lg" className="gap-2" disabled={busy} onClick={() => void locate()}>
              <HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="size-5" />
              {status === "locating" ? "Finding your location…" : status === "checking" ? "Checking delivery…" : "Use my current location"}
            </Button>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void submitPincode(pin)
              }}
            >
              <Input aria-label="Pincode" inputMode="numeric" maxLength={6} placeholder="Enter your pincode" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
              <Button type="submit" variant="outline" disabled={busy || pin.length !== 6}>Check</Button>
            </form>
            <Button variant="ghost" size="sm" className="self-center" onClick={skip}>Skip for now</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
