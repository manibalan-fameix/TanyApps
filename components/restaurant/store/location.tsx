"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Briefcase01Icon, Gps01Icon, Home01Icon, Location01Icon, Navigation03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { type AreaCheck, checkPincode, locateGuest } from "@/app/(tenant)/sites/[dealer]/actions"
import { myDeliveryAddresses } from "@/app/(tenant)/sites/[dealer]/address-actions"
import { AddressFormDialog } from "@/components/restaurant/store/address-form-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useIsMobile } from "@/hooks/use-mobile"
import { ROUGH_ACCURACY_M, accuratePosition } from "@/lib/core/geo/accurate-position"
import { MAX_SAVED_ADDRESSES, type SavedAddress } from "@/lib/restaurant/saved-address"
import { type GuestLocation, parseStoredLocation } from "@/lib/restaurant/location"
import { formatKm } from "@/lib/restaurant/service-area"
import { cn } from "@/lib/utils"

const LOCATION_KEY = "tany-location"
const ASKED_KEY = "tany-location-asked"
// Pages where a pop-up would get in the way: a rider's own page and the guest's order tracking.
const NO_PROMPT = [/^\/delivery(\/|$)/, /^\/o\//, /^\/checkout/, /^\/addresses/]

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
  /** Delivers to one of the signed-in customer's saved addresses. */
  chooseSaved: (address: SavedAddress) => Promise<void>
  /** Saves a spot chosen on the map. */
  choose: (location: GuestLocation, check: AreaCheck) => void
  /** Asks the phone where it is, then works out the address and whether this restaurant delivers there. */
  locate: () => Promise<void>
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
  if (code === 1) return "Location is blocked for this site. Allow it in your browser's address bar, then try again."
  if (code === 3) return "Finding your location took too long. Please try again."
  return "We could not get your location. Please try again."
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

  const remember = useCallback((l: GuestLocation, c: AreaCheck | null, stayOpen = false) => {
    setLocation(l)
    setCheck(c)
    write(LOCATION_KEY, JSON.stringify(l))
    write(ASKED_KEY, "1")
    // Nothing left to say when we deliver there. Otherwise the pop-up stays to explain why not.
    if (c?.deliverable && !stayOpen) setOpen(false)
  }, [])

  const chooseSaved = useCallback(
    async (a: SavedAddress) => {
      setError(null)
      setStatus("checking")
      const r = await locateGuest(a.lat, a.lng).catch(() => null)
      const check = r?.ok ? r : await checkPincode(a.pincode).catch(() => null)
      setStatus("idle")
      if (!check) return setError("Something went wrong. Please try again.")
      if (!check.ok) return setError(check.error)
      remember({ lat: a.lat, lng: a.lng, pincode: a.pincode, area: check.area.slice(0, 80), city: check.city.slice(0, 80), address: a.line.slice(0, 300), source: "map" }, check)
    },
    [remember],
  )

  const locate = useCallback(async () => {
    setError(null)
    if (!navigator.geolocation) return setError("This browser cannot share your location.")
    setStatus("locating")
    const fix = await accuratePosition(navigator.geolocation, { maxWaitMs: 12_000 }).catch((e: { code?: number }) => ({ failed: e.code }))
    if ("failed" in fix) {
      setStatus("idle")
      return setError(geoMessage(fix.failed))
    }
    // Too rough to find a door: nothing is saved, and the map opens so the guest can place the pin themselves.
    if (fix.accuracy > ROUGH_ACCURACY_M) {
      setStatus("idle")
      setOpen(false)
      setPickerOpen(true)
      return
    }
    setStatus("checking")
    const r = await locateGuest(fix.lat, fix.lng).catch(() => null)
    setStatus("idle")
    if (!r) return setError("Something went wrong. Please try again.")
    if (!r.ok) return setError(r.error)
    remember({ lat: fix.lat, lng: fix.lng, pincode: r.pincode, area: r.area, city: r.city, address: r.address, source: "gps" }, r, true)
  }, [remember, setPickerOpen])

  const choose = useCallback(
    (l: GuestLocation, c: AreaCheck) => {
      remember(l, c)
      setPickerOpen(false)
      setOpen(false)
      setError(null)
    },
    [remember, setPickerOpen],
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
    () => ({ location, check, open: open && !hidden, setOpen, status, error, ready, pickerOpen, setPickerOpen, chooseSaved, choose, locate, skip, clear }),
    [location, check, open, hidden, status, error, ready, pickerOpen, setPickerOpen, chooseSaved, choose, locate, skip, clear],
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

const addressIcon = (label: string) => (/home/i.test(label) ? Home01Icon : /work|office/i.test(label) ? Briefcase01Icon : Navigation03Icon)
// How many saved addresses the pop-up lists; the rest are behind "See all".
const SHOWN_ADDRESSES = 3

/** The location pop-up: use the phone's location, or pick a saved address. Opens on the first visit and from the header. */
export function LocationDialog({ restaurant, themeVars, centre }: { restaurant: string; themeVars: React.CSSProperties; /** Where the map starts for a new address: the shop. */ centre: { lat: number; lng: number } | null }) {
  const { open, setOpen, skip } = useGuestLocation()
  const currentButton = useRef<HTMLButtonElement>(null)
  const isMobile = useIsMobile()

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : skip())}>
      {/* The dialog is drawn outside the themed page, so it carries the restaurant's colours itself. */}
      {/* A bottom sheet on phones: data-side makes it slide up. It stays a Dialog so the address form can open on top of it. */}
      <DialogContent
        data-side={isMobile ? "bottom" : undefined}
        className="max-h-[calc(100svh-2rem)] grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:max-h-[calc(100svh-1.5rem)] max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-t-3xl max-md:rounded-b-none max-md:pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-none sm:max-w-none md:max-w-xl"
        style={themeVars}
        initialFocus={currentButton}
      >
        {/* Mounted only while open, so the saved addresses are fresh each time. */}
        <LocationChoices restaurant={restaurant} themeVars={themeVars} centre={centre} currentButton={currentButton} />
      </DialogContent>
    </Dialog>
  )
}

function LocationChoices({ restaurant, themeVars, centre, currentButton }: { restaurant: string; themeVars: React.CSSProperties; centre: { lat: number; lng: number } | null; currentButton: React.RefObject<HTMLButtonElement | null> }) {
  const { location, check, setOpen, status, error, locate, chooseSaved, skip } = useGuestLocation()
  const [saved, setSaved] = useState<Awaited<ReturnType<typeof myDeliveryAddresses>> | null>(null)
  const busy = status !== "idle"
  // The result is shown only after the guest chooses something here, not for the spot saved on an earlier visit.
  const [picked, setPicked] = useState(false)
  const current = location && check ? check : null
  // The address form: closed, starting at the current spot ("current"), or empty ("new").
  const [adding, setAdding] = useState<"current" | "new" | null>(null)
  const spot = location && location.lat !== null && location.lng !== null ? { lat: location.lat, lng: location.lng } : null
  const room = saved?.signedIn ? saved.addresses.length < MAX_SAVED_ADDRESSES : false
  // About 10 m: the same door, so there is nothing new to save.
  const alreadySaved = Boolean(spot && saved?.signedIn && saved.addresses.some((a) => Math.abs(a.lat - spot.lat) < 0.0001 && Math.abs(a.lng - spot.lng) < 0.0001))

  useEffect(() => {
    void myDeliveryAddresses().then(setSaved).catch(() => {})
  }, [])

  return (
    <>
      <DialogHeader className="text-center">
        {/* Runs edge to edge across the top of the pop-up, and fades into it at the bottom. */}
        <div className="relative -mx-6 -mt-6 mb-4 aspect-[3/2] sm:aspect-[12/5]">
          <Image src="/storefront/location-shop-v3.webp" alt="" fill unoptimized priority className="object-cover" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-popover to-transparent" />
          <div aria-hidden className="absolute inset-x-0 top-2 mx-auto h-1.5 w-10 rounded-full bg-foreground/20 md:hidden" />
        </div>
        <DialogTitle className="text-2xl font-bold tracking-tight [-webkit-text-stroke:0.6px_currentColor]">Welcome to {restaurant}</DialogTitle>
        <DialogDescription>Choose where we should deliver. Your location is used only for your delivery.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Button
          ref={currentButton}
          className="h-12 w-full gap-2 rounded-xl"
          disabled={busy}
          onClick={() => {
            setPicked(true)
            void locate()
          }}
        >
          <HugeiconsIcon icon={Gps01Icon} strokeWidth={2} className="size-5 shrink-0" />
          {status === "locating" ? "Finding you…" : "Use current location"}
        </Button>
        {status === "checking" ? <p role="status" className="text-sm text-muted-foreground">Checking delivery…</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {picked && !busy && !error && location && current ? (
          <div className={cn("rounded-xl border p-3.5 text-sm", current.deliverable ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5")}>
            <p className="font-medium">{[location.area, location.city].filter(Boolean).join(", ") || "Your location"}{location.pincode ? ` · ${location.pincode}` : ""}</p>
            <p className={cn("mt-1 font-medium", current.deliverable ? "text-primary" : "text-destructive")}>
              {current.deliverable
                ? `${current.zone ? `We deliver here (${current.zone} zone)${current.etaMinutes ? ` in about ${current.etaMinutes} min` : ""}${current.fee !== null ? ` · ₹${current.fee} delivery` : ""}${current.minOrder ? ` · minimum order ₹${current.minOrder}` : ""}.` : "We deliver here."}${current.radius?.distanceKm != null ? ` You are about ${formatKm(current.radius.distanceKm)} km away.` : ""}`
                : current.reason === "radius" && current.radius
                  ? `Sorry, you are ${current.radius.distanceKm !== null ? `about ${formatKm(current.radius.distanceKm)} km` : "too far"} from us and we deliver up to ${formatKm(current.radius.km)} km. You can still order for pickup.`
                  : "Sorry, we do not deliver to this area yet. You can still order for pickup."}
            </p>
            {current.deliverable ? null : <Button size="sm" className="mt-3 mr-2" onClick={() => setOpen(false)}>Order for pickup</Button>}
            {room && !alreadySaved ? <Button size="sm" variant="outline" className="mt-3" onClick={() => setAdding("current")}>Save this address</Button> : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3 text-xs font-semibold text-muted-foreground">
        <span className="flex-1 border-t border-dashed" /> OR <span className="flex-1 border-t border-dashed" />
      </div>

      {saved === null ? (
        <p className="py-2 text-center text-sm text-muted-foreground">Loading…</p>
      ) : !saved.signedIn ? (
        // Same height as "Use current location".
        // eslint-disable-next-line @next/next/no-html-link-for-pages -- API route that redirects to another host; <Link> cannot follow it
        <a href="/api/t/auth/start?next=%2F" className={cn(buttonVariants({ variant: "outline" }), "h-12 w-full rounded-xl")}>Sign in for saved address</a>
      ) : (
        <section className="grid grid-cols-[minmax(0,1fr)] gap-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-bold">Select from saved address</h3>
            {saved?.signedIn && saved.addresses.length > 0 ? (
              <Link href="/addresses" onClick={() => setOpen(false)} className="shrink-0 text-sm font-semibold text-primary underline underline-offset-4">See all</Link>
            ) : null}
          </div>
          {saved.addresses.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No saved addresses yet.</p>
          ) : (
            <ul className="divide-y">
              {saved.addresses.slice(0, SHOWN_ADDRESSES).map((a) => (
                <li key={a.id}>
                  <button type="button" disabled={busy} onClick={() => {
                    setPicked(true)
                    void chooseSaved(a)
                  }} className="flex w-full items-center gap-3 rounded-lg py-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-60">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border text-primary">
                      <HugeiconsIcon icon={addressIcon(a.label)} strokeWidth={2} className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{a.label}</span>
                      <span className="block truncate text-muted-foreground">{a.line} · {a.pincode}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {room ? <Button type="button" variant="outline" className="mt-2" onClick={() => setAdding("new")}>Add a new address</Button> : null}
        </section>
      )}

      <AddressFormDialog
        open={adding !== null}
        onOpenChange={(next) => !next && setAdding(null)}
        editing={null}
        centre={spot ?? centre}
        start={adding === "current" ? spot : null}
        themeVars={themeVars}
        onSaved={(addresses) => setSaved({ signedIn: true, addresses })}
      />

      {location ? null : <Button variant="link" size="sm" className="justify-self-center text-muted-foreground underline underline-offset-4" onClick={skip}>Skip for now</Button>}
    </>
  )
}
