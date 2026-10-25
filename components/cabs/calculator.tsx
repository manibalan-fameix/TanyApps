"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "@/lib/toast"

import { FareBreakdown } from "@/components/cabs/fare-breakdown"
import { SelectField, TextField } from "@/components/cabs/kit"
import { PlacePicker } from "@/components/cabs/place-picker"
import type { ClassOption } from "@/components/cabs/types"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { type CalcData, type CalcForm, blankForm, calculate } from "@/lib/cabs/calculator"
import type { TripType } from "@/lib/cabs/fare"
import { distanceBetween } from "@/lib/cabs/places-actions"
import { TRIP_TYPE_LABEL } from "@/lib/cabs/schemas"
import { STATES, findState } from "@/lib/cabs/states"
import { formatPaise } from "@/lib/cabs/money"
import type { PlaceDetail } from "@/lib/core/geo/places"

const TRIP_OPTIONS = (Object.keys(TRIP_TYPE_LABEL) as TripType[]).map((t) => ({ value: t, label: TRIP_TYPE_LABEL[t] }))

/**
 * Try a fare before a customer does. It runs the real fare engine in the browser with the rate cards, extra charges and settings
 * as saved, so the answer here is the answer a booking gets. Nothing on this panel is saved.
 */
export function FareCalculator({ classes, data, homeState }: { classes: ClassOption[]; data: CalcData; homeState: string | null }) {
  const [f, setF] = useState<CalcForm>(() => blankForm(classes[0]?.id ?? ""))
  const [from, setFrom] = useState<PlaceDetail | null>(null)
  const [to, setTo] = useState<PlaceDetail | null>(null)
  const [looking, setLooking] = useState(false)
  const set = (patch: Partial<CalcForm>) => setF((x) => ({ ...x, ...patch }))

  const localCards = data.cards.filter((c) => c.vehicleClassId === f.vehicleClassId && c.tripType === "local_hourly" && c.active)
  const out = useMemo(() => calculate(f, data), [f, data])
  const needsDistance = f.tripType === "airport" || f.tripType === "outstation_one_way" || f.tripType === "outstation_round"

  async function fetchRoute() {
    if (!from || !to) return
    setLooking(true)
    const res = await distanceBetween(from.placeId, to.placeId)
    setLooking(false)
    if (!res.ok) return void toast.error(res.error)
    const entered = [from, to].map((p) => p.stateCode).filter((c): c is string => Boolean(c) && c !== findState(homeState)?.code)
    set({
      distanceKm: (res.route.distanceM / 1000).toFixed(1),
      tollRupees: "", // tolls are off: they are never estimated, only billed as actual
      places: [from.name, to.name].filter(Boolean).join(", "),
      statesEntered: [...new Set(entered)],
      supplyState: from.gstStateCode ?? "",
    })
    toast.success(`${(res.route.distanceM / 1000).toFixed(1)} km by road${res.cached ? " (saved)" : ""}.`)
  }

  if (classes.length === 0) return <p className="text-sm text-muted-foreground">Add a vehicle class to try fares.</p>

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <FieldGroup>
        <SelectField id="fc-class" label="Vehicle class" value={f.vehicleClassId} onChange={(vehicleClassId) => set({ vehicleClassId, rateCardId: "" })} options={classes.map((c) => ({ value: c.id, label: c.name }))} />
        <SelectField id="fc-type" label="Trip type" value={f.tripType} onChange={(tripType) => set({ tripType: tripType as TripType, rateCardId: "" })} options={TRIP_OPTIONS} />

        {needsDistance ? (
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Distance by road</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <PlacePicker id="fc-from" label="From" onPick={setFrom} />
              <PlacePicker id="fc-to" label="To" onPick={setTo} />
            </div>
            <Button type="button" size="sm" variant="outline" className="w-fit" disabled={!from || !to || looking} onClick={() => void fetchRoute()}>
              {looking ? "Working it out…" : "Use this distance"}
            </Button>
            <TextField id="fc-km" label={f.tripType === "outstation_round" ? "Distance one way (km)" : "Distance (km)"} value={f.distanceKm} onChange={(distanceKm) => set({ distanceKm: distanceKm.replace(/[^\d.]/g, "") })} inputMode="decimal" hint={f.tripType === "outstation_round" ? "The fare uses there and back." : undefined} />
          </div>
        ) : null}

        {f.tripType === "local_hourly" ? (
          <SelectField
            id="fc-local"
            label="Package"
            value={f.rateCardId}
            onChange={(rateCardId) => set({ rateCardId })}
            options={localCards.map((c) => ({ value: c.id, label: `${c.packageHours} hr / ${c.packageKm} km · ${formatPaise(c.basePaise)}` }))}
            placeholder={localCards.length ? "Choose a package" : "No local packages for this class"}
          />
        ) : null}
        {f.tripType === "package_tour" ? (
          <SelectField id="fc-pkg" label="Tour package" value={f.packageId} onChange={(packageId) => set({ packageId })} options={data.packages.map((p) => ({ value: p.id, label: p.name }))} placeholder={data.packages.length ? "Choose a tour" : "No tour packages yet"} />
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField id="fc-start" label="Pickup (India time)" type="datetime-local" value={f.startAt} onChange={(startAt) => set({ startAt })} />
          {f.tripType === "outstation_round" ? <TextField id="fc-return" label="Vehicle released" type="datetime-local" value={f.returnAt} onChange={(returnAt) => set({ returnAt })} /> : null}
        </div>

        {f.tripType === "local_hourly" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField id="fc-ekm" label="Expected distance (km)" value={f.expectedKm} onChange={(expectedKm) => set({ expectedKm: expectedKm.replace(/[^\d.]/g, "") })} inputMode="decimal" hint="Shows a likely overrun. Optional." />
            <TextField id="fc-ehr" label="Expected hours" value={f.expectedHours} onChange={(expectedHours) => set({ expectedHours: expectedHours.replace(/[^\d.]/g, "") })} inputMode="decimal" />
          </div>
        ) : null}

        <TextField id="fc-places" label="Places on the trip (optional)" value={f.places} onChange={(places) => set({ places })} placeholder="Chennai, Kodaikanal" hint="Used by charges that name places, like a hill charge." />
        <Field>
          <FieldLabel>States entered beyond your own (for permits)</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {STATES.filter((s) => s.gst !== homeState).map((s) => (
              <Button key={s.code} type="button" size="xs" variant={f.statesEntered.includes(s.code) ? "default" : "outline"} aria-pressed={f.statesEntered.includes(s.code)} onClick={() => set({ statesEntered: f.statesEntered.includes(s.code) ? f.statesEntered.filter((c) => c !== s.code) : [...f.statesEntered, s.code] })}>
                {s.code}
              </Button>
            ))}
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField id="fc-supply" label="Service supplied in" value={f.supplyState} onChange={(supplyState) => set({ supplyState })} options={[{ value: "", label: "Your own state" }, ...STATES.map((s) => ({ value: s.code, label: s.name }))]} />
        </div>
      </FieldGroup>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Fare</h3>
        {out.ok ? (
          <>
            <FareBreakdown result={out.result} />
            <p className="text-xs text-muted-foreground">
              Uses {out.card ? "the rate card saved for this class" : "the package price"}, your extra charges and your GST settings, exactly as a booking would.
            </p>
          </>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <p>{out.error}</p>
            {out.fix ? <Link href={out.fix.href} className="mt-2 inline-block font-medium text-foreground underline">{out.fix.label}</Link> : null}
          </div>
        )}
      </div>
    </div>
  )
}
