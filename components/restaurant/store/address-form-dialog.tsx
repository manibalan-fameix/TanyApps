"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Location01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { saveDeliveryAddress } from "@/app/(tenant)/sites/[dealer]/address-actions"
import { locateGuest, searchGuestPlaces } from "@/app/(tenant)/sites/[dealer]/actions"
import { PinMap } from "@/components/restaurant/store/pin-map"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ROUGH_ACCURACY_M, accuratePosition } from "@/lib/core/geo/accurate-position"
import type { Place } from "@/lib/restaurant/geocode"
import { ADDRESS_LABELS, type SavedAddress } from "@/lib/restaurant/saved-address"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"

type Point = { lat: number; lng: number }
// Used only until the phone, a search or a tap says where to look: the middle of India.
const INDIA: Point = { lat: 20.5937, lng: 78.9629 }

/** How the pin got where it is. Only a spot the customer set, or a tight GPS reading, is good enough to save. */
type PinFrom = "saved" | "hand" | "gps" | "search"

export type AddressFormProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The address being changed, or null to add a new one. */
  editing: SavedAddress | null
  /** Where the map starts for a new address: the shop. */
  centre: Point | null
  /** A spot the customer has already set, to save as a new address: the pin starts there. */
  start?: Point | null
  /** The dialog is drawn outside the themed page, so it carries the shop's colours itself. */
  themeVars: React.CSSProperties
  onSaved: (addresses: SavedAddress[], id: string) => void
}

export function AddressFormDialog({ open, onOpenChange, ...rest }: AddressFormProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The title and the Cancel / Save buttons stay put; only the fields between them scroll. */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col gap-4 overflow-hidden sm:max-w-2xl" style={rest.themeVars}>
        <DialogHeader className="pr-10">
          <DialogTitle>{rest.editing ? "Edit address" : "Add a delivery address"}</DialogTitle>
          <DialogDescription>Put the pin on your door. The delivery partner navigates to that exact spot.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every opening starts from the address being edited. */}
        {open ? <AddressForm key={rest.editing?.id ?? "new"} onOpenChange={onOpenChange} {...rest} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function AddressForm({ editing, centre, start = null, onSaved, onOpenChange }: Omit<AddressFormProps, "open" | "themeVars">) {
  const [pin, setPin] = useState<Point | null>(editing ? { lat: editing.lat, lng: editing.lng } : start)
  const [pinFrom, setPinFrom] = useState<PinFrom | null>(editing ? "saved" : start ? "hand" : null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [outside, setOutside] = useState(false)
  const [query, setQuery] = useState("")
  const [places, setPlaces] = useState<Place[]>([])
  const [label, setLabel] = useState(editing?.label ?? "Home")
  const [house, setHouse] = useState(editing?.house ?? "")
  const [street, setStreet] = useState(editing?.street ?? "")
  const [landmark, setLandmark] = useState(editing?.landmark ?? "")
  const [pincode, setPincode] = useState(editing?.pincode ?? "")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  // Each new pin gets a number. A slow GPS reading or address lookup for an older pin is ignored.
  const latestPin = useRef(0)
  const latestDescribe = useRef(0)
  // What was filled in from the map. Anything the customer typed is never overwritten.
  const filled = useRef({ street: "", pincode: "" })

  useEffect(() => {
    const pins = latestPin
    return () => {
      pins.current++
    }
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) return
    const t = setTimeout(() => {
      void searchGuestPlaces(q)
        .then((r) => setPlaces(r.ok ? r.places : []))
        .catch(() => setPlaces([]))
    }, 450)
    return () => clearTimeout(t)
  }, [query])

  /** Fills the street and pincode from the map, and notes when the shop does not deliver to the spot. */
  async function describe(p: Point) {
    const id = ++latestDescribe.current
    const r = await locateGuest(p.lat, p.lng).catch(() => null)
    if (id !== latestDescribe.current || !r?.ok) return
    setOutside(!r.deliverable)
    const found = { street: r.address.replace(/,?\s*[1-9]\d{5}$/, "").slice(0, 150), pincode: r.pincode }
    const before = filled.current
    if (found.street) setStreet((s) => (!s || s === before.street ? found.street : s))
    if (found.pincode) setPincode((v) => (!v || v === before.pincode ? found.pincode : v))
    filled.current = { street: found.street || before.street, pincode: found.pincode || before.pincode }
  }

  // A starting spot fills in its street and pincode, as a pin placed by hand does.
  useEffect(() => {
    if (!editing && start) void describe(start)
    // Runs once, when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function place(p: Point, from: PinFrom) {
    latestPin.current++
    setLocating(false)
    setPin(p)
    setPinFrom(from)
    setAccuracy(null)
    setNotice(null)
    setErrors((e) => ({ ...e, lat: "" }))
    void describe(p)
  }

  async function fromPhone() {
    if (!navigator.geolocation) return setNotice("This browser cannot share your location. Search for your place, then tap your door on the map.")
    const id = ++latestPin.current
    setLocating(true)
    setNotice(null)
    const show = (f: { lat: number; lng: number; accuracy: number }) => {
      if (id !== latestPin.current) return
      setPin({ lat: f.lat, lng: f.lng })
      setPinFrom("gps")
      setAccuracy(Math.round(f.accuracy))
    }
    try {
      const fix = await accuratePosition(navigator.geolocation, { onProgress: show })
      if (id !== latestPin.current) return
      show(fix)
      setLocating(false)
      void describe(fix)
    } catch (error) {
      if (id !== latestPin.current) return
      setLocating(false)
      setNotice((error as { code?: number }).code === 1 ? "Location is blocked for this site. Allow it in your browser's address bar, or search for your place." : "We could not get your location. Search for your place, then tap your door on the map.")
    }
  }

  const rough = pinFrom === "gps" && accuracy !== null && accuracy > ROUGH_ACCURACY_M
  const exact = pin !== null && !locating && pinFrom !== "search" && !rough

  function save() {
    setErrors({})
    if (!pin || !exact) return setErrors({ lat: "Put the pin on your door first: drag it, or tap the map." })
    startSave(async () => {
      const res = await saveDeliveryAddress({ label, house, street, landmark, pincode, lat: pin.lat, lng: pin.lng }, editing?.id ?? null).catch(() => null)
      if (!res) return void toast.error("Could not save the address. Please try again.")
      if (!res.ok) {
        setErrors({ [res.field || "form"]: res.error })
        return
      }
      toast.success("Address saved.")
      onSaved(res.addresses, res.id)
      onOpenChange(false)
    })
  }

  const text = (id: string, title: string, value: string, set: (v: string) => void, props: React.ComponentProps<typeof Input> = {}) => (
    <Field data-invalid={Boolean(errors[id])}>
      <FieldLabel htmlFor={`addr-${id}`}>{title}</FieldLabel>
      <Input id={`addr-${id}`} value={value} onChange={(e) => set(e.target.value)} {...props} />
      {errors[id] ? <FieldError>{errors[id]}</FieldError> : null}
    </Field>
  )

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      {/* Reaches the pop-up's edges, so the scrollbar sits there and focus rings are not clipped. */}
      <div className="-mx-6 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 overflow-x-hidden overflow-y-auto border-y px-6 py-4">
        <Button type="button" size="lg" variant="outline" className="h-auto min-h-11 gap-2 py-2 text-center whitespace-normal" disabled={locating} onClick={() => void fromPhone()}>
          <HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="size-5" />
          {locating ? "Getting a precise location…" : "I am at this address: use my current location"}
        </Button>

        <div className="grid gap-1.5">
          <Input aria-label="Search for a place" placeholder="Or search your area, street or landmark" value={query} autoComplete="off" onChange={(e) => { setQuery(e.target.value); if (e.target.value.trim().length < 3) setPlaces([]) }} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
          {places.length > 0 ? (
            <ul className="max-h-44 overflow-auto rounded-xl border bg-popover p-1">
              {places.map((p) => (
                <li key={`${p.lat},${p.lng}`}>
                  <button type="button" className="w-full rounded-lg px-3 py-2 text-left hover:bg-muted" onClick={() => { setQuery(""); setPlaces([]); place({ lat: p.lat, lng: p.lng }, "search") }}>
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <PinMap point={pin ?? centre ?? INDIA} onPick={(p) => place(p, "hand")} label="Map: drag the pin to your door" className="h-64" />
          <p role="status" className={cn("text-sm", exact ? "text-success" : "text-muted-foreground")}>
            {locating
              ? `Finding your exact spot${accuracy !== null ? ` · accurate to about ${accuracy} m so far` : ""}…`
              : rough
                ? `Your location is only accurate to about ${accuracy} m. Drag the pin, or tap the map, on your door.`
                : pinFrom === "search"
                  ? "That is the general area. Now drag the pin, or tap the map, on your door."
                  : pinFrom === "gps"
                    ? `Accurate to about ${accuracy} m. Drag the pin if it is not on your door.`
                    : pin
                      ? "Pin set. Drag it if it is not on your door."
                      : "Drag the pin, or tap the map, on your door."}
          </p>
          {notice ? <p role="alert" className="text-sm text-destructive">{notice}</p> : null}
          {errors.lat ? <p role="alert" className="text-sm text-destructive">{errors.lat}</p> : null}
          {outside ? <p role="alert" className="text-sm text-destructive">We do not deliver to this spot yet. You can still save it.</p> : null}
        </div>

        <FieldGroup>
          {text("house", "Flat, house or door number", house, setHouse, { maxLength: 60, autoComplete: "address-line1" })}
          <Field data-invalid={Boolean(errors.street)}>
            <FieldLabel htmlFor="addr-street">Building, street and area</FieldLabel>
            <Textarea id="addr-street" rows={2} maxLength={150} value={street} autoComplete="address-line2" onChange={(e) => setStreet(e.target.value)} />
            {errors.street ? <FieldError>{errors.street}</FieldError> : null}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("landmark", "Landmark (optional)", landmark, setLandmark, { maxLength: 70 })}
            {text("pincode", "Pincode", pincode, (v) => setPincode(v.replace(/\D/g, "")), { maxLength: 6, inputMode: "numeric", autoComplete: "postal-code" })}
          </div>
          <Field data-invalid={Boolean(errors.label)}>
            <FieldLabel id="addr-label">Save as</FieldLabel>
            <div role="group" aria-labelledby="addr-label" className="flex flex-wrap gap-2">
              {ADDRESS_LABELS.map((l) => (
                <Button key={l} type="button" size="sm" variant={label === l ? "default" : "outline"} aria-pressed={label === l} onClick={() => setLabel(l)}>{l}</Button>
              ))}
            </div>
            {errors.label ? <FieldError>{errors.label}</FieldError> : null}
          </Field>
        </FieldGroup>

        {errors.form ? <p role="alert" className="text-sm text-destructive">{errors.form}</p> : null}

      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" disabled={saving || !exact}>{saving ? "Saving…" : "Save address"}</Button>
      </DialogFooter>
    </form>
  )
}
