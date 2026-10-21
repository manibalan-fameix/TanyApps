"use client"

import { useState } from "react"

import { MoneyField, SelectField, TextField, useAction } from "@/components/cabs/kit"
import type { ClassOption } from "@/components/cabs/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { deleteRateCard, deleteSurcharge, saveRateCard, saveSurcharge, setRateCardActive, setSurchargeActive } from "@/lib/cabs/admin-actions"
import type { FareSurcharge } from "@/lib/cabs/fare"
import { formatPaise, paiseToRupeesText, bpsToPercentText } from "@/lib/cabs/money"
import type { StoredRateCard } from "@/lib/cabs/rate-cards"
import { TRIP_TYPE_LABEL } from "@/lib/cabs/schemas"
import { STATES } from "@/lib/cabs/states"

const digits = (v: string) => v.replace(/\D/g, "")
const RATE_TRIP_TYPES = ["airport", "outstation_one_way", "outstation_round", "local_hourly"] as const
type RateTrip = (typeof RATE_TRIP_TYPES)[number]

// ---------- rate cards ----------

type CardForm = { vehicleClassId: string; tripType: RateTrip; basePaise: string; perKmPaise: string; minKmPerDay: string; bataPerDayPaise: string; packageHours: string; packageKm: string; extraKmPaise: string; extraHourPaise: string; validFrom: string; validTo: string; active: boolean }

const blankCard = (classId: string): CardForm => ({ vehicleClassId: classId, tripType: "airport", basePaise: "", perKmPaise: "", minKmPerDay: "", bataPerDayPaise: "", packageHours: "", packageKm: "", extraKmPaise: "", extraHourPaise: "", validFrom: "", validTo: "", active: true })

const fromCard = (c: StoredRateCard): CardForm => ({
  vehicleClassId: c.vehicleClassId,
  tripType: c.tripType as RateTrip,
  basePaise: paiseToRupeesText(c.basePaise),
  perKmPaise: paiseToRupeesText(c.perKmPaise),
  minKmPerDay: c.minKmPerDay?.toString() ?? "",
  bataPerDayPaise: paiseToRupeesText(c.bataPerDayPaise),
  packageHours: c.packageHours?.toString() ?? "",
  packageKm: c.packageKm?.toString() ?? "",
  extraKmPaise: paiseToRupeesText(c.extraKmPaise),
  extraHourPaise: paiseToRupeesText(c.extraHourPaise),
  validFrom: c.validFrom ?? "",
  validTo: c.validTo ?? "",
  active: c.active,
})

function RateCardForm({ initial, id, classes, onDone }: { initial: CardForm; id: string | null; classes: ClassOption[]; onDone: () => void }) {
  const { run, pending, fieldErrors } = useAction()
  const [v, setV] = useState(initial)
  const set = (patch: Partial<CardForm>) => setV((x) => ({ ...x, ...patch }))
  const t = v.tripType
  const num = (s: string) => (s === "" ? undefined : Number(s))
  return (
    <FieldGroup>
      <SelectField id="rc-class" label="Vehicle class" value={v.vehicleClassId} onChange={(vehicleClassId) => set({ vehicleClassId })} options={classes.map((c) => ({ value: c.id, label: c.name }))} error={fieldErrors.vehicleClassId} />
      <SelectField id="rc-type" label="Trip type" value={t} onChange={(tripType) => set({ tripType: tripType as RateTrip })} options={RATE_TRIP_TYPES.map((x) => ({ value: x, label: TRIP_TYPE_LABEL[x] }))} />

      {t === "airport" ? (
        <>
          <MoneyField id="rc-base" label="Base fare (₹)" optional value={v.basePaise} onChange={(basePaise) => set({ basePaise })} error={fieldErrors.basePaise} hint="Charged on every airport trip, before the distance." />
          <MoneyField id="rc-km" label="Rate per km (₹)" value={v.perKmPaise} onChange={(perKmPaise) => set({ perKmPaise })} error={fieldErrors.perKmPaise} />
        </>
      ) : null}
      {t === "outstation_one_way" || t === "outstation_round" ? (
        <>
          <MoneyField id="rc-km" label="Rate per km (₹)" value={v.perKmPaise} onChange={(perKmPaise) => set({ perKmPaise })} error={fieldErrors.perKmPaise} />
          <TextField id="rc-min" label="Minimum km per day" value={v.minKmPerDay} onChange={(m) => set({ minKmPerDay: digits(m) })} error={fieldErrors.minKmPerDay} inputMode="numeric" hint="Each day of the trip is billed for at least this many km." />
          <MoneyField id="rc-bata" label="Driver allowance per day (₹)" optional value={v.bataPerDayPaise} onChange={(bataPerDayPaise) => set({ bataPerDayPaise })} error={fieldErrors.bataPerDayPaise} />
        </>
      ) : null}
      {t === "local_hourly" ? (
        <>
          <MoneyField id="rc-pkg" label="Package price (₹)" value={v.basePaise} onChange={(basePaise) => set({ basePaise })} error={fieldErrors.basePaise} />
          <div className="grid grid-cols-2 gap-3">
            <TextField id="rc-hrs" label="Hours included" value={v.packageHours} onChange={(h) => set({ packageHours: digits(h) })} error={fieldErrors.packageHours} inputMode="numeric" />
            <TextField id="rc-pkm" label="Km included" value={v.packageKm} onChange={(k) => set({ packageKm: digits(k) })} error={fieldErrors.packageKm} inputMode="numeric" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MoneyField id="rc-xkm" label="Extra km (₹ per km)" optional value={v.extraKmPaise} onChange={(extraKmPaise) => set({ extraKmPaise })} error={fieldErrors.extraKmPaise} />
            <MoneyField id="rc-xhr" label="Extra hour (₹ per hour)" optional value={v.extraHourPaise} onChange={(extraHourPaise) => set({ extraHourPaise })} error={fieldErrors.extraHourPaise} />
          </div>
        </>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <TextField id="rc-from" label="Valid from (optional)" type="date" value={v.validFrom} onChange={(validFrom) => set({ validFrom })} error={fieldErrors.validFrom} />
        <TextField id="rc-to" label="Valid to (optional)" type="date" value={v.validTo} onChange={(validTo) => set({ validTo })} error={fieldErrors.validTo} />
      </div>
      <Field orientation="horizontal">
        <Checkbox id="rc-active" checked={v.active} onCheckedChange={(c) => set({ active: c === true })} />
        <FieldLabel htmlFor="rc-active">In use</FieldLabel>
      </Field>
      <Button
        className="w-fit"
        disabled={pending}
        onClick={() =>
          run(
            () =>
              saveRateCard(id, {
                vehicleClassId: v.vehicleClassId,
                tripType: t,
                basePaise: v.basePaise,
                perKmPaise: v.perKmPaise,
                minKmPerDay: num(v.minKmPerDay),
                bataPerDayPaise: v.bataPerDayPaise,
                packageHours: num(v.packageHours),
                packageKm: num(v.packageKm),
                extraKmPaise: v.extraKmPaise,
                extraHourPaise: v.extraHourPaise,
                validFrom: v.validFrom,
                validTo: v.validTo,
                active: v.active,
              }),
            { success: id ? "Rate card saved." : "Rate card added.", onOk: onDone },
          )
        }
      >
        {id ? "Save rate card" : "Add rate card"}
      </Button>
    </FieldGroup>
  )
}

function summary(c: StoredRateCard): string {
  const bits: string[] = []
  if (c.tripType === "airport") {
    if (c.basePaise) bits.push(`${formatPaise(c.basePaise)} base`)
    bits.push(`${formatPaise(c.perKmPaise)}/km`)
  } else if (c.tripType === "local_hourly") {
    bits.push(`${c.packageHours} hr / ${c.packageKm} km for ${formatPaise(c.basePaise)}`)
    if (c.extraKmPaise !== null) bits.push(`${formatPaise(c.extraKmPaise)}/extra km`)
    if (c.extraHourPaise !== null) bits.push(`${formatPaise(c.extraHourPaise)}/extra hr`)
  } else {
    bits.push(`${formatPaise(c.perKmPaise)}/km`, `min ${c.minKmPerDay} km/day`)
    if (c.bataPerDayPaise) bits.push(`${formatPaise(c.bataPerDayPaise)}/day allowance`)
  }
  return bits.join(" · ")
}

export function RateCardsManager({ cards, classes, owner }: { cards: StoredRateCard[]; classes: ClassOption[]; owner: boolean }) {
  const { run } = useAction()
  const [open, setOpen] = useState<StoredRateCard | "new" | null>(null)
  const editing = open && open !== "new" ? open : null
  const className = new Map(classes.map((c) => [c.id, c.name]))
  if (classes.length === 0) return <Alert><AlertTitle>Add a vehicle class first</AlertTitle><AlertDescription>Prices belong to a class such as Sedan or SUV.</AlertDescription></Alert>
  return (
    <div className="flex flex-col gap-3">
      {owner ? <div className="flex justify-end"><Button onClick={() => setOpen("new")}>Add rate card</Button></div> : <p className="text-sm text-muted-foreground">Only the owner can change prices.</p>}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Class</TableHead><TableHead>Trip type</TableHead><TableHead>Rates</TableHead><TableHead>Valid</TableHead><TableHead>Status</TableHead>{owner ? <TableHead className="text-right">Actions</TableHead> : null}</TableRow>
          </TableHeader>
          <TableBody>
            {cards.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground">No rate cards yet. Nothing can be priced until you add one: this app never assumes a price.</TableCell></TableRow>
            ) : (
              cards.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{className.get(c.vehicleClassId) ?? "—"}</TableCell>
                  <TableCell>{TRIP_TYPE_LABEL[c.tripType]}</TableCell>
                  <TableCell className="text-muted-foreground">{summary(c)}</TableCell>
                  <TableCell className="text-muted-foreground">{c.validFrom || c.validTo ? `${c.validFrom ?? "…"} to ${c.validTo ?? "…"}` : "Always"}</TableCell>
                  <TableCell>{c.active ? <Badge>In use</Badge> : <Badge variant="secondary">Off</Badge>}</TableCell>
                  {owner ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setOpen(c)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => run(() => setRateCardActive(c.id, !c.active), { success: c.active ? "Switched off." : "Switched on." })}>{c.active ? "Switch off" : "Switch on"}</Button>
                        <Button size="sm" variant="ghost" onClick={() => run(() => deleteRateCard(c.id), { success: "Rate card deleted.", confirm: "Delete this rate card?" })}>Delete</Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit rate card" : "Add rate card"}</SheetTitle>
            <SheetDescription>One card per vehicle class and trip type. Tour packages are priced under Tour packages.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{open ? <RateCardForm key={editing?.id ?? "new"} id={editing?.id ?? null} classes={classes} initial={editing ? fromCard(editing) : blankCard(classes[0].id)} onDone={() => setOpen(null)} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ---------- extra charges ----------

const KINDS = [
  { value: "night", label: "Night charge" },
  { value: "hill", label: "Hill / ghat charge" },
  { value: "permit", label: "State permit" },
  { value: "airport", label: "Airport entry / parking" },
  { value: "festival", label: "Festival / peak season" },
]
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label]))

type ChargeForm = { kind: string; label: string; mode: "flat" | "percent"; amount: string; states: string[]; places: string; nightStart: string; nightEnd: string; from: string; to: string; classIds: string[]; active: boolean }

const blankCharge: ChargeForm = { kind: "night", label: "", mode: "flat", amount: "", states: [], places: "", nightStart: "", nightEnd: "", from: "", to: "", classIds: [], active: true }
const fromCharge = (s: FareSurcharge & { active: boolean }): ChargeForm => ({
  kind: s.kind,
  label: s.label,
  mode: s.amountPaise !== null ? "flat" : "percent",
  amount: s.amountPaise !== null ? paiseToRupeesText(s.amountPaise) : bpsToPercentText(s.bps),
  states: s.scope.states ?? [],
  places: (s.scope.places ?? []).join(", "),
  nightStart: s.scope.window?.start ?? "",
  nightEnd: s.scope.window?.end ?? "",
  from: s.scope.dateRanges?.[0]?.from ?? "",
  to: s.scope.dateRanges?.[0]?.to ?? "",
  classIds: s.scope.vehicleClassIds ?? [],
  active: s.active,
})

function ChargeFormView({ initial, id, classes, onDone }: { initial: ChargeForm; id: string | null; classes: ClassOption[]; onDone: () => void }) {
  const { run, pending, fieldErrors } = useAction()
  const [v, setV] = useState(initial)
  const set = (patch: Partial<ChargeForm>) => setV((x) => ({ ...x, ...patch }))
  const toggle = (list: string[], x: string) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x])
  return (
    <FieldGroup>
      <SelectField id="sc-kind" label="Kind of charge" value={v.kind} onChange={(kind) => set({ kind })} options={KINDS} />
      <TextField id="sc-label" label="Name shown on the fare" value={v.label} onChange={(label) => set({ label })} error={fieldErrors.label} placeholder={KIND_LABEL[v.kind]} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField id="sc-mode" label="Charged as" value={v.mode} onChange={(mode) => set({ mode: mode as "flat" | "percent" })} options={[{ value: "flat", label: "A flat amount (₹)" }, { value: "percent", label: "A percentage of the fare" }]} />
        <TextField id="sc-amount" label={v.mode === "flat" ? "Amount (₹)" : "Percent"} value={v.amount} onChange={(a) => set({ amount: a.replace(/[^\d.]/g, "") })} error={fieldErrors.amount} inputMode="decimal" />
      </div>
      {v.kind === "night" ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField id="sc-ns" label="Night starts (optional)" value={v.nightStart} onChange={(nightStart) => set({ nightStart })} placeholder="22:00" hint="Blank uses your fare settings." />
          <TextField id="sc-ne" label="Night ends (optional)" value={v.nightEnd} onChange={(nightEnd) => set({ nightEnd })} placeholder="06:00" error={fieldErrors.scope} />
        </div>
      ) : null}
      {v.kind === "permit" ? (
        <Field>
          <FieldLabel>Charged when the trip enters (none picked = any other state)</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {STATES.map((s) => (
              <Button key={s.code} type="button" size="xs" variant={v.states.includes(s.code) ? "default" : "outline"} aria-pressed={v.states.includes(s.code)} onClick={() => set({ states: toggle(v.states, s.code) })}>{s.code}</Button>
            ))}
          </div>
        </Field>
      ) : null}
      {v.kind === "hill" ? <TextField id="sc-places" label="Places it applies to" value={v.places} onChange={(places) => set({ places })} placeholder="Kodaikanal, Ooty, Yercaud" hint="Separate places with commas. The charge applies when the trip goes to one of them." /> : null}
      {v.kind === "festival" ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField id="sc-from" label="From date" type="date" value={v.from} onChange={(from) => set({ from })} error={fieldErrors.scope} />
          <TextField id="sc-to" label="To date" type="date" value={v.to} onChange={(to) => set({ to })} />
        </div>
      ) : null}
      <Field>
        <FieldLabel>Only for these vehicle classes (none picked = all)</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {classes.map((c) => (
            <Button key={c.id} type="button" size="xs" variant={v.classIds.includes(c.id) ? "default" : "outline"} aria-pressed={v.classIds.includes(c.id)} onClick={() => set({ classIds: toggle(v.classIds, c.id) })}>{c.name}</Button>
          ))}
        </div>
      </Field>
      <Field orientation="horizontal">
        <Checkbox id="sc-active" checked={v.active} onCheckedChange={(c) => set({ active: c === true })} />
        <FieldLabel htmlFor="sc-active">In use</FieldLabel>
      </Field>
      <Button
        className="w-fit"
        disabled={pending}
        onClick={() =>
          run(
            () =>
              saveSurcharge(id, {
                kind: v.kind,
                label: v.label,
                mode: v.mode,
                amount: v.amount,
                active: v.active,
                scope: {
                  states: v.kind === "permit" ? v.states : [],
                  places: v.kind === "hill" ? v.places.split(",").map((p) => p.trim()).filter(Boolean) : [],
                  window: v.kind === "night" && v.nightStart && v.nightEnd ? { start: v.nightStart, end: v.nightEnd } : null,
                  dateRanges: v.kind === "festival" && v.from ? [{ from: v.from, to: v.to || v.from }] : [],
                  vehicleClassIds: v.classIds,
                },
              }),
            { success: id ? "Charge saved." : "Charge added.", onOk: onDone },
          )
        }
      >
        {id ? "Save charge" : "Add charge"}
      </Button>
    </FieldGroup>
  )
}

export type ChargeRow = FareSurcharge & { active: boolean }

export function SurchargesManager({ rows, classes, owner }: { rows: ChargeRow[]; classes: ClassOption[]; owner: boolean }) {
  const { run } = useAction()
  const [open, setOpen] = useState<ChargeRow | "new" | null>(null)
  const editing = open && open !== "new" ? open : null
  const describe = (s: ChargeRow) => {
    const bits: string[] = []
    if (s.scope.states?.length) bits.push(`entering ${s.scope.states.join(", ")}`)
    if (s.scope.places?.length) bits.push(`to ${s.scope.places.join(", ")}`)
    if (s.scope.window) bits.push(`${s.scope.window.start} to ${s.scope.window.end}`)
    if (s.scope.dateRanges?.length) bits.push(s.scope.dateRanges.map((r) => `${r.from} to ${r.to}`).join(", "))
    if (s.scope.vehicleClassIds?.length) bits.push(s.scope.vehicleClassIds.map((id) => classes.find((c) => c.id === id)?.name ?? "?").join(", "))
    return bits.join(" · ") || "Applies to every trip of its kind"
  }
  return (
    <div className="flex flex-col gap-3">
      {owner ? <div className="flex justify-end"><Button onClick={() => setOpen("new")}>Add charge</Button></div> : <p className="text-sm text-muted-foreground">Only the owner can change prices.</p>}
      <div className="rounded-lg border">
        <Table>
          <TableHeader><TableRow><TableHead>Charge</TableHead><TableHead>Amount</TableHead><TableHead>When</TableHead><TableHead>Status</TableHead>{owner ? <TableHead className="text-right">Actions</TableHead> : null}</TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground">No extra charges. Night, hill, permit, airport and festival charges you add here are applied to fares automatically.</TableCell></TableRow>
            ) : (
              rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><div className="font-medium">{s.label}</div><div className="text-xs text-muted-foreground">{KIND_LABEL[s.kind]}</div></TableCell>
                  <TableCell>{s.amountPaise !== null ? formatPaise(s.amountPaise) : `${bpsToPercentText(s.bps)}%`}</TableCell>
                  <TableCell className="text-muted-foreground">{describe(s)}</TableCell>
                  <TableCell>{s.active ? <Badge>In use</Badge> : <Badge variant="secondary">Off</Badge>}</TableCell>
                  {owner ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setOpen(s)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => run(() => setSurchargeActive(s.id, !s.active), { success: s.active ? "Switched off." : "Switched on." })}>{s.active ? "Switch off" : "Switch on"}</Button>
                        <Button size="sm" variant="ghost" onClick={() => run(() => deleteSurcharge(s.id), { success: "Charge deleted.", confirm: `Delete ${s.label}?` })}>Delete</Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit charge" : "Add charge"}</SheetTitle>
            <SheetDescription>Added to the fare when the trip matches. You always see it as its own line.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{open ? <ChargeFormView key={editing?.id ?? "new"} id={editing?.id ?? null} classes={classes} initial={editing ? fromCharge(editing) : blankCharge} onDone={() => setOpen(null)} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
