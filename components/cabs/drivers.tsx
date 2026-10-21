"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import type { ColDef } from "ag-grid-community"
import type { CustomCellRendererProps } from "ag-grid-react"
import { CheckmarkBadge01Icon, File02Icon, User02Icon } from "@hugeicons/core-free-icons"

import { optionsFilter } from "@/components/cars/cars-grid"
import { DocumentUpload, ExpiryBadge, ExpirySummary, FileLink, SelectField, TextField, istDateTime, useAction } from "@/components/cabs/kit"
import type { DocRow, DriverRow, DutyRow } from "@/components/cabs/types"
import { DataGrid } from "@/components/restaurant/data-grid"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { addDriverDocument, deleteDriver, deleteDriverDocument, saveDriver, setDriverStatus } from "@/lib/cabs/admin-actions"
import { DRIVER_DOC_LABEL, DRIVER_DOC_TYPES } from "@/lib/cabs/schemas"

const EMPLOYMENT = [{ value: "employee", label: "Employee" }, { value: "attached", label: "Attached (owner-driver)" }, { value: "freelance", label: "Freelance" }]
const STATUS = [{ value: "available", label: "Available" }, { value: "on_trip", label: "On a trip" }, { value: "off", label: "Off duty" }, { value: "inactive", label: "Inactive" }]
const STATUS_LABEL: Record<DriverRow["status"], string> = { available: "Available", on_trip: "On a trip", off: "Off duty", inactive: "Inactive" }
const LANGUAGES = ["Tamil", "English", "Hindi", "Telugu", "Kannada", "Malayalam"]

export function DriverForm({ initial, id, onDone }: { initial?: DriverRow; id: string | null; onDone: (id?: string) => void }) {
  const { run, pending, fieldErrors } = useAction()
  const [v, setV] = useState({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    licenceNo: initial?.licenceNo ?? "",
    licenceValidTill: initial?.licenceValidTill ?? "",
    badgeNo: initial?.badgeNo ?? "",
    employment: initial?.employment ?? "employee",
    languages: initial?.languages ?? ["Tamil"],
    status: initial?.status ?? "available",
  })
  const toggle = (l: string) => setV((x) => ({ ...x, languages: x.languages.includes(l) ? x.languages.filter((y) => y !== l) : [...x.languages, l] }))
  return (
    <FieldGroup>
      <TextField id="dr-name" label="Name" value={v.name} onChange={(name) => setV({ ...v, name })} error={fieldErrors.name} />
      <TextField id="dr-phone" label="Mobile number" value={v.phone} onChange={(phone) => setV({ ...v, phone })} error={fieldErrors.phone} inputMode="tel" placeholder="98765 43210" hint="Customers will see this number once a trip is assigned." />
      <TextField id="dr-lic" label="Driving licence number (optional)" value={v.licenceNo} onChange={(licenceNo) => setV({ ...v, licenceNo: licenceNo.toUpperCase() })} error={fieldErrors.licenceNo} hint="Stored encrypted." />
      <div className="grid grid-cols-2 gap-3">
        <TextField id="dr-lic-till" label="Licence valid till" type="date" value={v.licenceValidTill} onChange={(licenceValidTill) => setV({ ...v, licenceValidTill })} error={fieldErrors.licenceValidTill} />
        <TextField id="dr-badge" label="Badge number (optional)" value={v.badgeNo} onChange={(badgeNo) => setV({ ...v, badgeNo })} error={fieldErrors.badgeNo} />
      </div>
      <SelectField id="dr-emp" label="Employment" value={v.employment} onChange={(employment) => setV({ ...v, employment: employment as DriverRow["employment"] })} options={EMPLOYMENT} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Languages spoken</legend>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <Button key={l} type="button" size="sm" variant={v.languages.includes(l) ? "default" : "outline"} aria-pressed={v.languages.includes(l)} onClick={() => toggle(l)}>
              {l}
            </Button>
          ))}
        </div>
      </fieldset>
      <SelectField id="dr-status" label="Status" value={v.status} onChange={(status) => setV({ ...v, status: status as DriverRow["status"] })} options={STATUS} />
      <Button className="w-fit" disabled={pending} onClick={() => run(() => saveDriver(id, { ...v, licenceNo: v.licenceNo || null }), { success: id ? "Driver saved." : "Driver added.", onOk: (r) => onDone((r as { id?: string }).id) })}>
        {id ? "Save driver" : "Add driver"}
      </Button>
    </FieldGroup>
  )
}

export function DriversGrid({ rows, usage }: { rows: DriverRow[]; usage: { used: number; limit: number } }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const full = usage.used >= usage.limit
  const columns = useMemo<ColDef<DriverRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Driver",
        headerClass: "hdr-icon hdr-user",
        minWidth: 190,
        flex: 1,
        cellRenderer: ({ data }: CustomCellRendererProps<DriverRow>) =>
          data ? (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">{data.name}</span>
              <span className="text-xs text-muted-foreground">{data.phone}</span>
            </div>
          ) : null,
      },
      { field: "employment", headerName: "Employment", headerClass: "hdr-icon hdr-user", width: 130, cellClass: "capitalize" },
      { field: "licenceStatus", headerName: "Licence", headerClass: "hdr-icon hdr-doc", width: 150, cellRenderer: ({ data }: CustomCellRendererProps<DriverRow>) => (data ? <ExpiryBadge status={data.licenceStatus} /> : null) },
      { field: "docs", headerName: "Documents", headerClass: "hdr-icon hdr-doc", width: 200, sortable: false, cellRenderer: ({ data }: CustomCellRendererProps<DriverRow>) => (data ? <ExpirySummary {...data.docs} /> : null) },
      {
        field: "status",
        headerName: "Status",
        headerClass: "hdr-icon hdr-status",
        width: 140,
        cellRenderer: ({ data }: CustomCellRendererProps<DriverRow>) => (data ? <Badge variant={data.status === "available" ? "default" : "secondary"}>{STATUS_LABEL[data.status]}</Badge> : null),
        ...(optionsFilter({ options: ["available", "on_trip", "off", "inactive"] }) as Partial<ColDef<DriverRow>>),
      },
    ],
    [],
  )
  return (
    <div className="flex flex-col gap-3">
      {full ? (
        <Alert>
          <AlertTitle>You are using all {usage.limit} drivers on your plan</AlertTitle>
          <AlertDescription>
            Upgrade to add more. <Link className="font-medium underline" href="/settings/billing">See plans</Link>
          </AlertDescription>
        </Alert>
      ) : null}
      <DataGrid<DriverRow>
        rows={rows}
        columns={columns}
        icons={{ user: User02Icon, doc: File02Icon, status: CheckmarkBadge01Icon }}
        tabs={[{ key: "all", label: "All" }, { key: "available", label: "Available" }, { key: "on_trip", label: "On a trip" }, { key: "off", label: "Off duty" }]}
        searchPlaceholder="Search drivers…"
        noMatches="No drivers match your filters."
        rowHeight={60}
        onRowClick={(r) => router.push(`/cabs/drivers/${r.id}`)}
        toolbar={<Button disabled={full} onClick={() => setAdding(true)}>Add driver</Button>}
      />
      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add driver</SheetTitle>
            <SheetDescription>{usage.used} of {usage.limit} drivers used on your plan. Add documents after saving.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{adding ? <DriverForm id={null} onDone={(id) => { setAdding(false); if (id) router.push(`/cabs/drivers/${id}`) }} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function DriverActions({ id, status, name }: { id: string; status: DriverRow["status"]; name: string }) {
  const router = useRouter()
  const { run } = useAction()
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "off" ? <Button variant="outline" size="sm" onClick={() => run(() => setDriverStatus(id, "off"), { success: "Marked off duty." })}>Mark off duty</Button> : null}
      {status !== "available" ? <Button variant="outline" size="sm" onClick={() => run(() => setDriverStatus(id, "available"), { success: "Marked available." })}>Mark available</Button> : null}
      <Button variant="ghost" size="sm" onClick={() => run(() => deleteDriver(id), { success: "Driver deleted.", confirm: `Delete ${name}? Their documents are deleted too.`, onOk: () => router.push("/cabs/drivers") })}>Delete driver</Button>
    </div>
  )
}

const DOC_OPTIONS = DRIVER_DOC_TYPES.map((t) => ({ value: t, label: DRIVER_DOC_LABEL[t] }))

export function DriverDocuments({ driverId, docs, storageReady }: { driverId: string; docs: DocRow[]; storageReady: boolean }) {
  const { run, pending, fieldErrors } = useAction()
  const [adding, setAdding] = useState(false)
  const blank = { type: "id_proof", number: "", validTill: "", fileKey: "" }
  const [v, setV] = useState(blank)
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
            <SelectField id="dd-type" label="Document" value={v.type} onChange={(type) => setV({ ...v, type })} options={DOC_OPTIONS} error={fieldErrors.type} />
            <TextField id="dd-number" label="Number (optional)" value={v.number} onChange={(number) => setV({ ...v, number })} error={fieldErrors.number} />
            <TextField id="dd-till" label="Valid till" type="date" value={v.validTill} onChange={(validTill) => setV({ ...v, validTill })} error={fieldErrors.validTill} hint="Leave blank if it does not expire." />
            {storageReady ? <DocumentUpload kind="driver-doc" value={v.fileKey} onChange={(fileKey) => setV({ ...v, fileKey })} error={fieldErrors.fileKey} /> : null}
            <Button className="w-fit" disabled={pending} onClick={() => run(() => addDriverDocument(driverId, v), { success: "Document added.", onOk: () => { setAdding(false); setV(blank) } })}>Save document</Button>
          </FieldGroup>
        </div>
      ) : null}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Document</TableHead><TableHead>Number</TableHead><TableHead>Valid till</TableHead><TableHead>Status</TableHead><TableHead>File</TableHead><TableHead className="text-right" /></TableRow>
          </TableHeader>
          <TableBody>
            {docs.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground">No documents yet.</TableCell></TableRow>
            ) : (
              docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.typeLabel}</TableCell>
                  <TableCell>{d.number || "—"}</TableCell>
                  <TableCell>{d.validTill ?? "—"}</TableCell>
                  <TableCell><ExpiryBadge status={d.status} /></TableCell>
                  <TableCell><FileLink fileKey={d.fileKey} /></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => run(() => deleteDriverDocument(d.id), { success: "Document deleted.", confirm: `Delete the ${d.typeLabel}?` })}>Delete</Button></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

/** Read-only for now: the driver app (a later phase) is what starts and ends duty. */
export function DutyLog({ rows }: { rows: DutyRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Duty log</h2>
      <div className="rounded-lg border">
        <Table>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell className="text-muted-foreground">No duty recorded yet. It fills in when the driver app starts and ends duty.</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{istDateTime(r.startedAt)}</TableCell>
                  <TableCell>{r.endedAt ? istDateTime(r.endedAt) : <Badge>On duty now</Badge>}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function DriverEditCard({ driver }: { driver: DriverRow }) {
  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-3 text-base font-semibold">Details</h2>
      <DriverForm id={driver.id} initial={driver} onDone={() => {}} />
    </div>
  )
}
