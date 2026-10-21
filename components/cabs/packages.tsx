"use client"

import { useState } from "react"

import { MoneyField, TextField, useAction } from "@/components/cabs/kit"
import type { ClassOption } from "@/components/cabs/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { deletePackage, savePackage } from "@/lib/cabs/admin-actions"
import { formatPaise, paiseToRupeesText } from "@/lib/cabs/money"

export type PackageRow = { id: string; name: string; slug: string; description: string; days: number; itinerary: { day: number; title: string; description: string }[]; vehicleClassPrices: Record<string, number>; active: boolean }

type PkgForm = { name: string; description: string; days: string; itinerary: { day: number; title: string; description: string }[]; prices: Record<string, string>; active: boolean }

const blank = (classes: ClassOption[]): PkgForm => ({ name: "", description: "", days: "2", itinerary: [], prices: Object.fromEntries(classes.map((c) => [c.id, ""])), active: true })
const fromRow = (p: PackageRow, classes: ClassOption[]): PkgForm => ({ name: p.name, description: p.description, days: String(p.days), itinerary: p.itinerary, prices: Object.fromEntries(classes.map((c) => [c.id, paiseToRupeesText(p.vehicleClassPrices[c.id] ?? null)])), active: p.active })

function PackageForm({ initial, id, classes, onDone }: { initial: PkgForm; id: string | null; classes: ClassOption[]; onDone: () => void }) {
  const { run, pending, fieldErrors } = useAction()
  const [v, setV] = useState(initial)
  const setDay = (i: number, patch: Partial<PkgForm["itinerary"][number]>) => setV((x) => ({ ...x, itinerary: x.itinerary.map((d, k) => (k === i ? { ...d, ...patch } : d)) }))
  return (
    <FieldGroup>
      <TextField id="pk-name" label="Package name" value={v.name} onChange={(name) => setV({ ...v, name })} error={fieldErrors.name} placeholder="Pondicherry weekend" />
      <TextField id="pk-days" label="Days" value={v.days} onChange={(d) => setV({ ...v, days: d.replace(/\D/g, "") })} error={fieldErrors.days} inputMode="numeric" />
      <Field>
        <FieldLabel htmlFor="pk-desc">Description (optional)</FieldLabel>
        <Textarea id="pk-desc" value={v.description} maxLength={1000} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Price for each vehicle class (₹)</legend>
        <p className="text-xs text-muted-foreground">Leave a class blank if you do not offer this package in it.</p>
        {classes.map((c) => (
          <MoneyField key={c.id} id={`pk-price-${c.id}`} label={c.name} value={v.prices[c.id] ?? ""} onChange={(x) => setV({ ...v, prices: { ...v.prices, [c.id]: x } })} />
        ))}
        {fieldErrors.prices ? <p className="text-sm text-destructive">{fieldErrors.prices}</p> : null}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Itinerary</legend>
        {v.itinerary.map((d, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="grid grid-cols-[4rem_1fr] gap-2">
              <TextField id={`pk-d-${i}`} label="Day" value={String(d.day)} onChange={(x) => setDay(i, { day: Number(x.replace(/\D/g, "") || 1) })} inputMode="numeric" />
              <TextField id={`pk-t-${i}`} label="Title" value={d.title} onChange={(title) => setDay(i, { title })} />
            </div>
            <Textarea aria-label={`Day ${d.day} details`} value={d.description} maxLength={500} placeholder="What happens on this day" onChange={(e) => setDay(i, { description: e.target.value })} />
            <Button type="button" size="xs" variant="ghost" className="w-fit" onClick={() => setV({ ...v, itinerary: v.itinerary.filter((_, k) => k !== i) })}>Remove day</Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setV({ ...v, itinerary: [...v.itinerary, { day: v.itinerary.length + 1, title: "", description: "" }] })}>Add a day</Button>
      </fieldset>
      <Field orientation="horizontal">
        <Checkbox id="pk-active" checked={v.active} onCheckedChange={(c) => setV({ ...v, active: c === true })} />
        <FieldLabel htmlFor="pk-active">Offer this package</FieldLabel>
      </Field>
      <Button className="w-fit" disabled={pending} onClick={() => run(() => savePackage(id, { name: v.name, description: v.description, days: Number(v.days || 0), itinerary: v.itinerary, prices: v.prices, active: v.active }), { success: id ? "Package saved." : "Package added.", onOk: onDone })}>
        {id ? "Save package" : "Add package"}
      </Button>
    </FieldGroup>
  )
}

export function PackagesManager({ rows, classes, owner }: { rows: PackageRow[]; classes: ClassOption[]; owner: boolean }) {
  const { run } = useAction()
  const [open, setOpen] = useState<PackageRow | "new" | null>(null)
  const editing = open && open !== "new" ? open : null
  return (
    <div className="flex flex-col gap-3">
      {owner ? <div className="flex justify-end"><Button onClick={() => setOpen("new")}>Add package</Button></div> : <p className="text-sm text-muted-foreground">Only the owner can change prices.</p>}
      <div className="rounded-lg border">
        <Table>
          <TableHeader><TableRow><TableHead>Package</TableHead><TableHead>Days</TableHead><TableHead>Prices</TableHead><TableHead>Status</TableHead>{owner ? <TableHead className="text-right">Actions</TableHead> : null}</TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground">No tour packages yet.</TableCell></TableRow>
            ) : (
              rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.days}</TableCell>
                  <TableCell className="text-muted-foreground">{classes.filter((c) => p.vehicleClassPrices[c.id] !== undefined).map((c) => `${c.name} ${formatPaise(p.vehicleClassPrices[c.id])}`).join(" · ") || "No prices set"}</TableCell>
                  <TableCell>{p.active ? <Badge>Offered</Badge> : <Badge variant="secondary">Hidden</Badge>}</TableCell>
                  {owner ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setOpen(p)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => run(() => deletePackage(p.id), { success: "Package deleted.", confirm: `Delete ${p.name}?` })}>Delete</Button>
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
            <SheetTitle>{editing ? `Edit ${editing.name}` : "Add tour package"}</SheetTitle>
            <SheetDescription>A multi-day tour sold at a fixed price for each vehicle class.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{open ? <PackageForm key={editing?.id ?? "new"} id={editing?.id ?? null} classes={classes} initial={editing ? fromRow(editing, classes) : blank(classes)} onDone={() => setOpen(null)} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
