"use client"

import { useState } from "react"

import { SelectField, TextField, useAction } from "@/components/cabs/kit"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { saveCabSettings } from "@/lib/cabs/admin-actions"
import { STATES } from "@/lib/cabs/states"

export type SettingsValues = {
  advancePercent: string
  gstPercent: string
  stateCode: string
  gstin: string
  sacCode: string
  invoicePrefix: string
  nightStart: string
  nightEnd: string
  minLeadMinutes: string
  bufferMinutes: string
  serviceCities: string
  tiers: { hoursBefore: string; feePercent: string }[]
}

/** The rules that are the operator's to set. Nothing is pre-filled with a guess: a blank stays blank until they decide. */
export function CabSettingsForm({ initial, owner }: { initial: SettingsValues; owner: boolean }) {
  const { run, pending, fieldErrors } = useAction()
  const [v, setV] = useState(initial)
  const set = (patch: Partial<SettingsValues>) => setV((x) => ({ ...x, ...patch }))
  const setTier = (i: number, patch: Partial<SettingsValues["tiers"][number]>) => setV((x) => ({ ...x, tiers: x.tiers.map((t, k) => (k === i ? { ...t, ...patch } : t)) }))
  const num = (s: string) => Number(s.replace(/\D/g, "") || 0)
  return (
    <FieldGroup>
      {!owner ? <Alert><AlertTitle>Only the owner can change these</AlertTitle><AlertDescription>You can see them, but not edit them.</AlertDescription></Alert> : null}
      <fieldset disabled={!owner} className="flex flex-col gap-5 disabled:opacity-80">
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">GST</h2>
          <div className="grid grid-cols-2 gap-3">
            <TextField id="cs-gst" label="GST on fares (%)" value={v.gstPercent} onChange={(gstPercent) => set({ gstPercent: gstPercent.replace(/[^\d.]/g, "") })} error={fieldErrors.gstPercent} inputMode="decimal" hint="Enter 0 if you do not charge GST. Fares cannot be quoted until this is set." />
            <SelectField id="cs-state" label="Your state" value={v.stateCode} onChange={(stateCode) => set({ stateCode })} options={[{ value: "", label: "Not set" }, ...STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.gst})` }))]} error={fieldErrors.stateCode} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField id="cs-gstin" label="GSTIN (optional)" value={v.gstin} onChange={(gstin) => set({ gstin: gstin.toUpperCase() })} error={fieldErrors.gstin} placeholder="33ABCDE1234F1Z5" />
            <TextField id="cs-sac" label="SAC code (optional)" value={v.sacCode} onChange={(sacCode) => set({ sacCode: sacCode.replace(/\D/g, "") })} error={fieldErrors.sacCode} inputMode="numeric" />
          </div>
          <TextField id="cs-prefix" label="Invoice prefix (optional)" value={v.invoicePrefix} onChange={(invoicePrefix) => set({ invoicePrefix: invoicePrefix.toUpperCase() })} placeholder="ANNA" hint="Invoices are numbered ANNA/2026-27/0001." />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Booking rules</h2>
          <TextField id="cs-adv" label="Advance to confirm a booking (%)" value={v.advancePercent} onChange={(advancePercent) => set({ advancePercent: advancePercent.replace(/[^\d.]/g, "") })} error={fieldErrors.advancePercent} inputMode="decimal" hint="Blank means you have not decided." />
          <div className="grid grid-cols-2 gap-3">
            <TextField id="cs-lead" label="Least notice for a booking (minutes)" value={v.minLeadMinutes} onChange={(minLeadMinutes) => set({ minLeadMinutes: minLeadMinutes.replace(/\D/g, "") })} error={fieldErrors.minLeadMinutes} inputMode="numeric" />
            <TextField id="cs-buffer" label="Gap between trips (minutes)" value={v.bufferMinutes} onChange={(bufferMinutes) => set({ bufferMinutes: bufferMinutes.replace(/\D/g, "") })} error={fieldErrors.bufferMinutes} inputMode="numeric" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField id="cs-ns" label="Night starts" value={v.nightStart} onChange={(nightStart) => set({ nightStart })} error={fieldErrors.nightStart} placeholder="22:00" />
            <TextField id="cs-ne" label="Night ends" value={v.nightEnd} onChange={(nightEnd) => set({ nightEnd })} error={fieldErrors.nightEnd} placeholder="06:00" />
          </div>
          <TextField id="cs-cities" label="Cities you serve (optional)" value={v.serviceCities} onChange={(serviceCities) => set({ serviceCities })} placeholder="Chennai, Madurai, Coimbatore" hint="Separate cities with commas." />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Cancellation fees</h2>
          <p className="text-sm text-muted-foreground">The fee, as a percentage of the fare, for cancelling at least this many hours before pickup. Add the longest notice first, for example 24 hours: 0%, then 4 hours: 50%.</p>
          {v.tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
              <TextField id={`cs-th-${i}`} label="Hours before pickup" value={t.hoursBefore} onChange={(h) => setTier(i, { hoursBefore: h.replace(/\D/g, "") })} inputMode="numeric" />
              <TextField id={`cs-tf-${i}`} label="Fee (%)" value={t.feePercent} onChange={(f) => setTier(i, { feePercent: f.replace(/[^\d.]/g, "") })} inputMode="decimal" />
              <Button type="button" variant="ghost" size="sm" onClick={() => setV((x) => ({ ...x, tiers: x.tiers.filter((_, k) => k !== i) }))}>Remove</Button>
            </div>
          ))}
          {fieldErrors.cancellationPolicy ? <p className="text-sm text-destructive">{fieldErrors.cancellationPolicy}</p> : null}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setV((x) => ({ ...x, tiers: [...x.tiers, { hoursBefore: "", feePercent: "" }] }))}>Add a tier</Button>
        </section>

        <Button
          className="w-fit"
          disabled={pending || !owner}
          onClick={() =>
            run(
              () =>
                saveCabSettings({
                  advancePercent: v.advancePercent,
                  gstPercent: v.gstPercent,
                  stateCode: v.stateCode,
                  gstin: v.gstin,
                  sacCode: v.sacCode,
                  invoicePrefix: v.invoicePrefix,
                  nightStart: v.nightStart,
                  nightEnd: v.nightEnd,
                  minLeadMinutes: num(v.minLeadMinutes),
                  bufferMinutes: num(v.bufferMinutes),
                  serviceCities: v.serviceCities.split(",").map((c) => c.trim()).filter(Boolean),
                  cancellationPolicy: v.tiers.map((t) => ({ hoursBefore: num(t.hoursBefore), feePercent: t.feePercent })),
                }),
              { success: "Settings saved." },
            )
          }
        >
          Save settings
        </Button>
      </fieldset>
    </FieldGroup>
  )
}
