"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { FareLines } from "@/components/cabs/book/fare-lines"
import { SelectField, TextField } from "@/components/cabs/kit"
import { PlacePicker } from "@/components/cabs/place-picker"
import type { ClassOption } from "@/components/cabs/types"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { createManualBooking, previewManualFare } from "@/lib/cabs/booking-admin-actions"
import type { FareLine, TripType } from "@/lib/cabs/fare"
import { formatPaise } from "@/lib/cabs/money"
import { TRIP_TYPE_LABEL } from "@/lib/cabs/schemas"
import type { PlaceDetail } from "@/lib/core/geo/places"

const TRIP_OPTIONS = (Object.keys(TRIP_TYPE_LABEL) as TripType[]).map((t) => ({ value: t, label: TRIP_TYPE_LABEL[t] }))
const toPlace = (p: PlaceDetail) => ({ placeId: p.placeId, name: p.name, address: p.address, lat: p.lat, lng: p.lng, stateCode: p.stateCode })

type Preview = { totalPaise: number; advanceDuePaise: number; lines: FareLine[]; notices: string[]; distanceKm: number | null }

/** A booking taken by phone or at the counter. The fare comes from the same engine as the website, so the customer is quoted the same number. */
export function ManualBookingForm({ classes, localPackages, tours }: { classes: ClassOption[]; localPackages: { hours: number; km: number }[]; tours: { id: string; name: string }[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [source, setSource] = useState<"phone" | "walk_in">("phone")
  const [phone, setPhone] = useState("")
  const [name, setName] = useState("")
  const [tripType, setTripType] = useState<TripType>("airport")
  const [pickup, setPickup] = useState<PlaceDetail | null>(null)
  const [drop, setDrop] = useState<PlaceDetail | null>(null)
  const [startAt, setStartAt] = useState("")
  const [returnAt, setReturnAt] = useState("")
  const [pax, setPax] = useState("2")
  const [bags, setBags] = useState("1")
  const [classId, setClassId] = useState(classes[0]?.id ?? "")
  const [localPkg, setLocalPkg] = useState("")
  const [packageId, setPackageId] = useState("")
  const [km, setKm] = useState("")
  const [notes, setNotes] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState("")

  const needsDrop = tripType === "airport" || tripType === "outstation_one_way" || tripType === "outstation_round"
  const body = () => {
    const [h, k] = localPkg.split(":").map(Number)
    return {
      source,
      phone,
      name,
      tripType,
      pickup: pickup ? toPlace(pickup) : null,
      drop: needsDrop && drop ? toPlace(drop) : null,
      startAt,
      returnAt: tripType === "outstation_round" ? returnAt || null : null,
      pax: Number(pax),
      bags: Number(bags),
      classId,
      localPackage: tripType === "local_hourly" && h && k ? { hours: h, km: k } : null,
      packageId: tripType === "package_tour" && packageId ? packageId : null,
      manualDistanceKm: km,
      notes,
    }
  }
  const ready = pickup && (!needsDrop || drop || km.trim() !== "") && startAt && phone.length === 10

  if (classes.length === 0) return <p className="text-sm text-muted-foreground">Add a vehicle class first.</p>

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <FieldGroup>
        <SelectField id="mb-source" label="Booking taken" value={source} onChange={(v) => setSource(v as "phone" | "walk_in")} options={[{ value: "phone", label: "By phone" }, { value: "walk_in", label: "At the counter" }]} />
        <TextField id="mb-phone" label="Customer mobile number" value={phone} inputMode="numeric" maxLength={10} onChange={(v) => setPhone(v.replace(/\D/g, ""))} />
        <TextField id="mb-name" label="Customer name" value={name} onChange={setName} />
        <SelectField id="mb-type" label="Trip type" value={tripType} onChange={(v) => { setTripType(v as TripType); setPreview(null) }} options={TRIP_OPTIONS} />
        <PlacePicker id="mb-from" label="Pickup" onPick={(p) => { setPickup(p); setPreview(null) }} />
        {needsDrop ? <PlacePicker id="mb-to" label="Drop" onPick={(p) => { setDrop(p); setPreview(null) }} /> : null}
        {needsDrop ? <TextField id="mb-km" label="Distance in km (only if the map cannot work it out)" value={km} inputMode="decimal" onChange={(v) => { setKm(v.replace(/[^\d.]/g, "")); setPreview(null) }} /> : null}
        <TextField id="mb-start" label="Pickup date and time" type="datetime-local" value={startAt} onChange={(v) => { setStartAt(v); setPreview(null) }} />
        {tripType === "outstation_round" ? <TextField id="mb-return" label="Return date and time" type="datetime-local" value={returnAt} onChange={(v) => { setReturnAt(v); setPreview(null) }} /> : null}
        {tripType === "local_hourly" ? <SelectField id="mb-local" label="Package" value={localPkg} onChange={(v) => { setLocalPkg(v); setPreview(null) }} options={localPackages.map((p) => ({ value: `${p.hours}:${p.km}`, label: `${p.hours} hours, ${p.km} km` }))} /> : null}
        {tripType === "package_tour" ? <SelectField id="mb-tour" label="Tour" value={packageId} onChange={(v) => { setPackageId(v); setPreview(null) }} options={tours.map((p) => ({ value: p.id, label: p.name }))} /> : null}
        <div className="grid grid-cols-2 gap-3">
          <TextField id="mb-pax" label="Passengers" value={pax} inputMode="numeric" onChange={(v) => { setPax(v.replace(/\D/g, "")); setPreview(null) }} />
          <TextField id="mb-bags" label="Bags" value={bags} inputMode="numeric" onChange={(v) => { setBags(v.replace(/\D/g, "")); setPreview(null) }} />
        </div>
        <SelectField id="mb-class" label="Vehicle class" value={classId} onChange={(v) => { setClassId(v); setPreview(null) }} options={classes.map((c) => ({ value: c.id, label: c.name }))} />
        <TextField id="mb-notes" label="Notes (optional)" value={notes} onChange={setNotes} />
      </FieldGroup>

      <div className="flex flex-col gap-4">
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={pending || !ready}
          data-testid="mb-preview"
          onClick={() =>
            start(async () => {
              setError("")
              const r = await previewManualFare(body())
              if (!r.ok) return void (setPreview(null), setError(r.error))
              setPreview(r)
            })
          }
        >
          See the fare
        </Button>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {preview ? (
          <>
            {preview.distanceKm !== null ? <p className="text-sm text-muted-foreground">About {preview.distanceKm} km one way.</p> : null}
            <FareLines lines={preview.lines} totalPaise={preview.totalPaise} advanceDuePaise={preview.advanceDuePaise} notices={preview.notices} lang="en" />
            <Button
              type="button"
              className="self-start"
              disabled={pending}
              data-testid="mb-create"
              onClick={() =>
                start(async () => {
                  const r = await createManualBooking(body())
                  if (!r.ok) return void setError(r.error)
                  toast.success(`Booking ${r.code} confirmed at ${formatPaise(preview.totalPaise)}.`)
                  router.push(`/cabs/bookings/${r.id}`)
                })
              }
            >
              Confirm booking
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
