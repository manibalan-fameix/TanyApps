"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import type { ColDef } from "ag-grid-community"
import type { CustomCellRendererProps } from "ag-grid-react"
import { Car01Icon, CheckmarkBadge01Icon, File02Icon } from "@hugeicons/core-free-icons"

import { optionsFilter } from "@/components/cars/cars-grid"
import { DocumentUpload, ExpiryBadge, ExpirySummary, FileLink, SelectField, TextField, istDateTime, localToIst, useAction } from "@/components/cabs/kit"
import type { BlockedRow, ClassOption, ClassRow, DocRow, VehicleRow } from "@/components/cabs/types"
import { DataGrid } from "@/components/restaurant/data-grid"
import { ImageUpload } from "@/components/restaurant/image-upload"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { addBlockedPeriod, addVehicleDocument, deleteBlockedPeriod, deleteVehicle, deleteVehicleClass, deleteVehicleDocument, requestClassImageUpload, saveVehicle, saveVehicleClass, setVehicleStatus } from "@/lib/cabs/admin-actions"
import { VEHICLE_DOC_LABEL, VEHICLE_DOC_TYPES } from "@/lib/cabs/schemas"

const digits = (v: string) => v.replace(/\D/g, "")

// ---------- vehicle classes ----------

const emptyClass = { name: "", seats: "4", bags: "2", ac: true, description: "", imageUrl: "", sortOrder: "0", active: true }

function ClassForm({ initial, id, onDone }: { initial: typeof emptyClass; id: string | null; onDone: () => void }) {
  const { run, pending, fieldErrors } = useAction()
  const [v, setV] = useState(initial)
  return (
    <FieldGroup>
      <TextField id="vc-name" label="Class name" value={v.name} onChange={(name) => setV({ ...v, name })} error={fieldErrors.name} placeholder="Sedan" />
      <div className="grid grid-cols-2 gap-3">
        <TextField id="vc-seats" label="Seats" value={v.seats} onChange={(s) => setV({ ...v, seats: digits(s) })} error={fieldErrors.seats} inputMode="numeric" />
        <TextField id="vc-bags" label="Bags" value={v.bags} onChange={(b) => setV({ ...v, bags: digits(b) })} error={fieldErrors.bags} inputMode="numeric" />
      </div>
      <Field orientation="horizontal">
        <Checkbox id="vc-ac" checked={v.ac} onCheckedChange={(c) => setV({ ...v, ac: c === true })} />
        <FieldLabel htmlFor="vc-ac">Air conditioned</FieldLabel>
      </Field>
      <Field>
        <FieldLabel htmlFor="vc-desc">Description (optional)</FieldLabel>
        <Textarea id="vc-desc" value={v.description} maxLength={300} placeholder="Examples: Toyota Etios, Maruti Dzire" onChange={(e) => setV({ ...v, description: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel>Picture customers see (optional)</FieldLabel>
        <ClassPicture value={v.imageUrl} onChange={(imageUrl) => setV({ ...v, imageUrl })} />
      </Field>
      <TextField id="vc-sort" label="Order in the list" value={v.sortOrder} onChange={(s) => setV({ ...v, sortOrder: digits(s) })} inputMode="numeric" hint="Smaller numbers come first." />
      <Field orientation="horizontal">
        <Checkbox id="vc-active" checked={v.active} onCheckedChange={(c) => setV({ ...v, active: c === true })} />
        <FieldLabel htmlFor="vc-active">Offer this class to customers</FieldLabel>
      </Field>
      <Button
        className="w-fit"
        disabled={pending}
        onClick={() => run(() => saveVehicleClass(id, { ...v, seats: Number(v.seats), bags: Number(v.bags || 0), sortOrder: Number(v.sortOrder || 0) }), { success: id ? "Class saved." : "Class added.", onOk: onDone })}
      >
        {id ? "Save class" : "Add class"}
      </Button>
    </FieldGroup>
  )
}

/** The picture of a class is a public photo, uploaded like a dish photo but through the cab action. */
function ClassPicture({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  return <ImageUpload kind="cab-class" label="picture" value={value} onChange={onChange} requestUpload={requestClassImageUpload} />
}

export function ClassesManager({ rows }: { rows: ClassRow[] }) {
  const { run } = useAction()
  const [open, setOpen] = useState<ClassRow | "new" | null>(null)
  const editing = open && open !== "new" ? open : null
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen("new")}>Add vehicle class</Button>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead>Bags</TableHead>
              <TableHead>AC</TableHead>
              <TableHead>Vehicles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.seats}</TableCell>
                <TableCell>{r.bags}</TableCell>
                <TableCell>{r.ac ? "Yes" : "No"}</TableCell>
                <TableCell>{r.vehicles}</TableCell>
                <TableCell>{r.active ? <Badge>Offered</Badge> : <Badge variant="secondary">Hidden</Badge>}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => setOpen(r)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => run(() => deleteVehicleClass(r.id), { success: "Class deleted.", confirm: `Delete ${r.name}?` })}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? `Edit ${editing.name}` : "Add vehicle class"}</SheetTitle>
            <SheetDescription>What a customer chooses: seats, bags and a picture. The vehicles and the prices are set separately.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            {open ? (
              <ClassForm
                key={editing?.id ?? "new"}
                id={editing?.id ?? null}
                initial={editing ? { name: editing.name, seats: String(editing.seats), bags: String(editing.bags), ac: editing.ac, description: editing.description, imageUrl: editing.imageUrl, sortOrder: String(editing.sortOrder), active: editing.active } : emptyClass}
                onDone={() => setOpen(null)}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ---------- vehicles ----------

const FUELS = [{ value: "", label: "Not set" }, ...["petrol", "diesel", "cng", "electric", "hybrid"].map((f) => ({ value: f, label: f.toUpperCase() === "CNG" ? "CNG" : f[0].toUpperCase() + f.slice(1) }))]
const OWNERSHIP = [{ value: "own", label: "Owned" }, { value: "attached", label: "Attached (owner-driver)" }]
const VEHICLE_STATUS = [{ value: "active", label: "Active" }, { value: "maintenance", label: "In maintenance" }, { value: "inactive", label: "Inactive" }]

export function VehicleForm({ initial, id, classes, onDone }: { initial?: VehicleRow; id: string | null; classes: ClassOption[]; onDone: (id?: string) => void }) {
  const { run, pending, fieldErrors } = useAction()
  const [v, setV] = useState({
    classId: initial?.classId ?? classes[0]?.id ?? "",
    reg: initial?.reg ?? "",
    makeModel: initial?.makeModel ?? "",
    year: initial?.year ? String(initial.year) : "",
    colour: initial?.colour ?? "",
    fuel: initial?.fuel ?? "",
    ownership: initial?.ownership ?? "own",
    odometerKm: String(initial?.odometerKm ?? 0),
    status: initial?.status ?? "active",
  })
  if (classes.length === 0) return <Alert><AlertTitle>Add a vehicle class first</AlertTitle><AlertDescription>Every vehicle belongs to a class such as Sedan or SUV.</AlertDescription></Alert>
  return (
    <FieldGroup>
      <SelectField id="vh-class" label="Class" value={v.classId} onChange={(classId) => setV({ ...v, classId })} options={classes.map((c) => ({ value: c.id, label: c.name }))} error={fieldErrors.classId} />
      <TextField id="vh-reg" label="Registration number" value={v.reg} onChange={(reg) => setV({ ...v, reg: reg.toUpperCase() })} error={fieldErrors.reg} placeholder="TN 09 AB 1234" autoCapitalize="characters" />
      <TextField id="vh-make" label="Make and model" value={v.makeModel} onChange={(makeModel) => setV({ ...v, makeModel })} error={fieldErrors.makeModel} placeholder="Toyota Etios" />
      <div className="grid grid-cols-2 gap-3">
        <TextField id="vh-year" label="Year (optional)" value={v.year} onChange={(y) => setV({ ...v, year: digits(y).slice(0, 4) })} error={fieldErrors.year} inputMode="numeric" />
        <TextField id="vh-colour" label="Colour (optional)" value={v.colour} onChange={(colour) => setV({ ...v, colour })} error={fieldErrors.colour} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField id="vh-fuel" label="Fuel" value={v.fuel} onChange={(fuel) => setV({ ...v, fuel })} options={FUELS} />
        <SelectField id="vh-own" label="Ownership" value={v.ownership} onChange={(ownership) => setV({ ...v, ownership: ownership as "own" | "attached" })} options={OWNERSHIP} />
      </div>
      <TextField id="vh-odo" label="Odometer (km)" value={v.odometerKm} onChange={(o) => setV({ ...v, odometerKm: digits(o) })} error={fieldErrors.odometerKm} inputMode="numeric" />
      <SelectField id="vh-status" label="Status" value={v.status} onChange={(status) => setV({ ...v, status: status as VehicleRow["status"] })} options={VEHICLE_STATUS} />
      <Button
        className="w-fit"
        disabled={pending}
        onClick={() =>
          run(() => saveVehicle(id, { ...v, year: v.year ? Number(v.year) : null, fuel: v.fuel || null, odometerKm: Number(v.odometerKm || 0) }), {
            success: id ? "Vehicle saved." : "Vehicle added.",
            onOk: (r) => onDone((r as { id?: string }).id),
          })
        }
      >
        {id ? "Save vehicle" : "Add vehicle"}
      </Button>
    </FieldGroup>
  )
}

const STATUS_BADGE: Record<VehicleRow["status"], "default" | "secondary" | "outline"> = { active: "default", maintenance: "secondary", inactive: "outline" }

export function VehiclesGrid({ rows, classes, usage }: { rows: VehicleRow[]; classes: ClassOption[]; usage: { used: number; limit: number } }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const full = usage.used >= usage.limit
  const columns = useMemo<ColDef<VehicleRow>[]>(
    () => [
      {
        field: "makeModel",
        headerName: "Vehicle",
        headerClass: "hdr-icon hdr-car",
        minWidth: 200,
        flex: 1,
        cellRenderer: ({ data }: CustomCellRendererProps<VehicleRow>) =>
          data ? (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">{data.makeModel}</span>
              <span className="font-mono text-xs text-muted-foreground">{data.reg}</span>
            </div>
          ) : null,
      },
      { field: "className", headerName: "Class", headerClass: "hdr-icon hdr-car", width: 140 },
      { field: "ownership", headerName: "Ownership", headerClass: "hdr-icon hdr-car", width: 120, valueFormatter: (p) => (p.value === "own" ? "Owned" : "Attached") },
      { field: "odometerKm", headerName: "Odometer", headerClass: "hdr-icon hdr-car", width: 120, valueFormatter: (p) => `${Number(p.value).toLocaleString("en-IN")} km` },
      { field: "docs", headerName: "Documents", headerClass: "hdr-icon hdr-doc", width: 220, sortable: false, cellRenderer: ({ data }: CustomCellRendererProps<VehicleRow>) => (data ? <ExpirySummary {...data.docs} /> : null) },
      {
        field: "status",
        headerName: "Status",
        headerClass: "hdr-icon hdr-status",
        width: 140,
        cellRenderer: ({ data }: CustomCellRendererProps<VehicleRow>) => (data ? <Badge variant={STATUS_BADGE[data.status]} className="capitalize">{data.status}</Badge> : null),
        ...(optionsFilter({ options: ["active", "maintenance", "inactive"] }) as Partial<ColDef<VehicleRow>>),
      },
    ],
    [],
  )
  return (
    <div className="flex flex-col gap-3">
      {full ? (
        <Alert>
          <AlertTitle>You are using all {usage.limit} vehicles on your plan</AlertTitle>
          <AlertDescription>
            Upgrade to add more. <Link className="font-medium underline" href="/settings/billing">See plans</Link>
          </AlertDescription>
        </Alert>
      ) : null}
      <DataGrid<VehicleRow>
        rows={rows}
        columns={columns}
        icons={{ car: Car01Icon, doc: File02Icon, status: CheckmarkBadge01Icon }}
        tabs={[{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "maintenance", label: "Maintenance" }, { key: "inactive", label: "Inactive" }]}
        searchPlaceholder="Search vehicles…"
        noMatches="No vehicles match your filters."
        rowHeight={60}
        onRowClick={(r) => router.push(`/cabs/vehicles/${r.id}`)}
        toolbar={
          <Button disabled={full} onClick={() => setAdding(true)}>
            Add vehicle
          </Button>
        }
      />
      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add vehicle</SheetTitle>
            <SheetDescription>{usage.used} of {usage.limit} vehicles used on your plan. Add documents after saving.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{adding ? <VehicleForm id={null} classes={classes} onDone={(id) => { setAdding(false); if (id) router.push(`/cabs/vehicles/${id}`) }} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function VehicleActions({ id, status, name }: { id: string; status: VehicleRow["status"]; name: string }) {
  const router = useRouter()
  const { run } = useAction()
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "maintenance" ? <Button variant="outline" size="sm" onClick={() => run(() => setVehicleStatus(id, "maintenance"), { success: "Marked as in maintenance." })}>Mark in maintenance</Button> : null}
      {status !== "active" ? <Button variant="outline" size="sm" onClick={() => run(() => setVehicleStatus(id, "active"), { success: "Marked active." })}>Mark active</Button> : null}
      <Button variant="ghost" size="sm" onClick={() => run(() => deleteVehicle(id), { success: "Vehicle deleted.", confirm: `Delete ${name}? Its documents are deleted too.`, onOk: () => router.push("/cabs/vehicles") })}>Delete vehicle</Button>
    </div>
  )
}

// ---------- documents ----------

const DOC_OPTIONS = VEHICLE_DOC_TYPES.map((t) => ({ value: t, label: VEHICLE_DOC_LABEL[t] }))

export function VehicleDocuments({ vehicleId, docs, storageReady }: { vehicleId: string; docs: DocRow[]; storageReady: boolean }) {
  const { run, pending, fieldErrors } = useAction()
  const [adding, setAdding] = useState(false)
  const [v, setV] = useState({ type: "insurance", number: "", validFrom: "", validTill: "", fileKey: "" })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Documents</h2>
        <Button size="sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "Add document"}</Button>
      </div>
      {!storageReady ? <Alert><AlertTitle>File uploads are not set up yet</AlertTitle><AlertDescription>You can still record numbers and expiry dates. Scans need a private storage bucket (R2_PRIVATE_BUCKET).</AlertDescription></Alert> : null}
      {adding ? (
        <div className="rounded-lg border p-4">
          <FieldGroup>
            <SelectField id="vd-type" label="Document" value={v.type} onChange={(type) => setV({ ...v, type })} options={DOC_OPTIONS} error={fieldErrors.type} />
            <TextField id="vd-number" label="Number (optional)" value={v.number} onChange={(number) => setV({ ...v, number })} error={fieldErrors.number} placeholder="Policy or certificate number" />
            <div className="grid grid-cols-2 gap-3">
              <TextField id="vd-from" label="Valid from (optional)" type="date" value={v.validFrom} onChange={(validFrom) => setV({ ...v, validFrom })} error={fieldErrors.validFrom} />
              <TextField id="vd-till" label="Valid till" type="date" value={v.validTill} onChange={(validTill) => setV({ ...v, validTill })} error={fieldErrors.validTill} hint="Leave blank if it does not expire." />
            </div>
            {storageReady ? <DocumentUpload kind="vehicle-doc" value={v.fileKey} onChange={(fileKey) => setV({ ...v, fileKey })} error={fieldErrors.fileKey} /> : null}
            <Button className="w-fit" disabled={pending} onClick={() => run(() => addVehicleDocument(vehicleId, v), { success: "Document added.", onOk: () => { setAdding(false); setV({ type: "insurance", number: "", validFrom: "", validTill: "", fileKey: "" }) } })}>Save document</Button>
          </FieldGroup>
        </div>
      ) : null}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Valid till</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>File</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground">No documents yet. Add the RC, insurance, permit and fitness certificate so you hear before they expire.</TableCell></TableRow>
            ) : (
              docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.typeLabel}</TableCell>
                  <TableCell>{d.number || "—"}</TableCell>
                  <TableCell>{d.validTill ?? "—"}</TableCell>
                  <TableCell><ExpiryBadge status={d.status} /></TableCell>
                  <TableCell><FileLink fileKey={d.fileKey} /></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => run(() => deleteVehicleDocument(d.id), { success: "Document deleted.", confirm: `Delete the ${d.typeLabel}?` })}>Delete</Button></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ---------- blocked periods ----------

export function BlockedPeriods({ resourceType, resourceId, rows }: { resourceType: "vehicle" | "driver"; resourceId: string; rows: BlockedRow[] }) {
  const { run, pending, fieldErrors } = useAction()
  const [adding, setAdding] = useState(false)
  const [v, setV] = useState({ startsAt: "", endsAt: "", reason: "" })
  const label = resourceType === "vehicle" ? "Maintenance and unavailable times" : "Leave and unavailable times"
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{label}</h2>
        <Button size="sm" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "Block a time"}</Button>
      </div>
      {adding ? (
        <div className="rounded-lg border p-4">
          <FieldGroup>
            <div className="grid grid-cols-2 gap-3">
              <TextField id="bp-from" label="From (India time)" type="datetime-local" value={v.startsAt} onChange={(startsAt) => setV({ ...v, startsAt })} error={fieldErrors.startsAt} />
              <TextField id="bp-to" label="Until (India time)" type="datetime-local" value={v.endsAt} onChange={(endsAt) => setV({ ...v, endsAt })} error={fieldErrors.endsAt} />
            </div>
            <TextField id="bp-reason" label="Reason (optional)" value={v.reason} onChange={(reason) => setV({ ...v, reason })} placeholder={resourceType === "vehicle" ? "Service, accident repair" : "Leave"} />
            <Button className="w-fit" disabled={pending} onClick={() => run(() => addBlockedPeriod({ resourceType, resourceId, startsAt: localToIst(v.startsAt), endsAt: localToIst(v.endsAt), reason: v.reason }), { success: "Time blocked.", onOk: () => { setAdding(false); setV({ startsAt: "", endsAt: "", reason: "" }) } })}>Block this time</Button>
          </FieldGroup>
        </div>
      ) : null}
      <div className="rounded-lg border">
        <Table>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell className="text-muted-foreground">Nothing blocked. Trips can be given at any time.</TableCell></TableRow>
            ) : (
              rows.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{istDateTime(b.startsAt)} → {istDateTime(b.endsAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{b.reason || "—"}</TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => run(() => deleteBlockedPeriod(b.id), { success: "Removed." })}>Remove</Button></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}


/** The edit form on a vehicle's own page. Saving refreshes the page's data (useAction does that), so nothing else is needed. */
export function VehicleEditCard({ vehicle, classes }: { vehicle: VehicleRow; classes: ClassOption[] }) {
  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-3 text-base font-semibold">Details</h2>
      <VehicleForm id={vehicle.id} initial={vehicle} classes={classes} onDone={() => {}} />
    </div>
  )
}
