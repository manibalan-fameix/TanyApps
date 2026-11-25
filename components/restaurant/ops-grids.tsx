"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import { DataTableRowActions } from "@/components/data-table/data-table-row-actions"
import { type ColDef, type CustomCellRendererProps, DataGrid, type ValueFormatterParams, optionsFilter } from "@/components/data-table/data-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import {
  createPartner,
  deletePartner,
  deleteZone,
  saveZone,
  setPartnerActive,
  setPartnerPin,
  setPaymentStatus,
  setZoneActive,
} from "@/lib/restaurant/admin-actions"

const inr = new Intl.NumberFormat("en-IN")
const rupees = (n: number) => `₹${inr.format(n)}`
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
const digits = (v: string) => v.replace(/\D/g, "")

type Result = { ok: true } | { ok: false; error: string }
type Ctx = { run: (fn: () => Promise<Result>, success?: string) => void }

function useRunner() {
  const router = useRouter()
  const [, start] = useTransition()
  return useMemo<Ctx>(
    () => ({
      run: (fn, success) => {
        start(async () => {
          const res = await fn()
          if (res.ok) {
            if (success) toast.success(success)
            router.refresh()
          } else toast.error(res.error)
        })
      },
    }),
    [router],
  )
}

const actionsCol = <T,>(renderer: (p: CustomCellRendererProps<T, unknown, Ctx>) => React.ReactNode, width: number): ColDef<T> => ({
  colId: "actions",
  headerName: "",
  cellRenderer: renderer,
  width,
  sortable: false,
  filter: false,
  pinned: "right",
})

// ---------- delivery zones ----------

export type ZoneRow = { id: string; name: string; pincodeText: string; pincodeCount: number; fee: number; minOrder: number | null; etaMinutes: number | null; status: "active" | "paused" }

function ZoneForm({ zone, onDone }: { zone: ZoneRow | null; onDone: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [name, setName] = useState(zone?.name ?? "")
  const [pins, setPins] = useState(zone?.pincodeText ?? "")
  const [fee, setFee] = useState(String(zone?.fee ?? ""))
  const [min, setMin] = useState(zone?.minOrder ? String(zone.minOrder) : "")
  const [eta, setEta] = useState(zone?.etaMinutes ? String(zone.etaMinutes) : "")
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="zn-name">Zone name</FieldLabel>
        <Input id="zn-name" value={name} placeholder="Anna Nagar" onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="zn-pins">Pincodes</FieldLabel>
        <Input id="zn-pins" value={pins} placeholder="600040, 600102" onChange={(e) => setPins(e.target.value)} />
        <FieldDescription>Separate with commas or spaces. A guest&apos;s pincode must be listed in an active zone to order delivery.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="zn-fee">Delivery charge (₹)</FieldLabel>
        <Input id="zn-fee" inputMode="numeric" value={fee} onChange={(e) => setFee(digits(e.target.value))} />
      </Field>
      <Field>
        <FieldLabel htmlFor="zn-min">Minimum order (₹, optional)</FieldLabel>
        <Input id="zn-min" inputMode="numeric" value={min} onChange={(e) => setMin(digits(e.target.value))} />
        <FieldDescription>Leave empty to use your default from Settings → Ordering.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="zn-eta">Delivery time (minutes, optional)</FieldLabel>
        <Input id="zn-eta" inputMode="numeric" value={eta} onChange={(e) => setEta(digits(e.target.value))} />
      </Field>
      <Button
        className="w-fit"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await saveZone(zone?.id ?? null, { name, pincodes: pins, fee: Number(fee || 0), minOrder: min ? Number(min) : null, etaMinutes: eta ? Number(eta) : null })
            if (res.ok) {
              toast.success(zone ? "Zone saved." : "Zone added.")
              onDone()
              router.refresh()
            } else toast.error(res.error)
          })
        }
      >
        {zone ? "Save zone" : "Add zone"}
      </Button>
    </FieldGroup>
  )
}

export function NewZoneButton() {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>New zone</SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New delivery zone</SheetTitle>
          <SheetDescription>Pincodes you deliver to, with their own charge and minimum.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4"><ZoneForm zone={null} onDone={() => setOpen(false)} /></div>
      </SheetContent>
    </Sheet>
  )
}

export function ZonesGrid({ rows, owner }: { rows: ZoneRow[]; owner: boolean }) {
  const ctx = useRunner()
  const [editId, setEditId] = useState<string | null>(null)
  const editing = rows.find((r) => r.id === editId) ?? null
  const columns = useMemo<ColDef<ZoneRow>[]>(
    () => [
      { field: "name", headerName: "Zone", minWidth: 200, flex: 1, cellClass: "font-medium" },
      { field: "pincodeText", headerName: "Pincodes", minWidth: 220, flex: 1, cellClass: "text-muted-foreground" },
      { field: "fee", headerName: "Charge", width: 130, filter: "number", valueFormatter: (p: ValueFormatterParams) => (p.value ? rupees(p.value) : "Free") },
      { field: "minOrder", headerName: "Min order", width: 140, filter: "number", valueFormatter: (p: ValueFormatterParams) => (p.value ? rupees(p.value) : "Default") },
      { field: "etaMinutes", headerName: "Time", width: 120, valueFormatter: (p: ValueFormatterParams) => (p.value ? `${p.value} min` : "—") },
      {
        field: "status",
        headerName: "Status",
        width: 130,
        cellRenderer: ({ data }: CustomCellRendererProps<ZoneRow>) => (data ? <Badge variant={data.status === "active" ? "default" : "secondary"} className="capitalize">{data.status}</Badge> : null),
        ...(optionsFilter({ options: ["active", "paused"] }) as Partial<ColDef<ZoneRow>>),
      },
      ...(owner
        ? [
            actionsCol<ZoneRow>(
              ({ data, context }) =>
                data ? (
                  <DataTableRowActions
                    label={`Actions for ${data.name}`}
                    actions={[
                      { label: "Edit", onClick: () => setEditId(data.id) },
                      { label: "Status", value: data.status, options: [{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }], onSelect: (v) => context.run(() => setZoneActive(data.id, v === "active")) },
                      { label: "Delete", destructive: true, confirm: { title: `Delete ${data.name}?` }, onClick: () => context.run(() => deleteZone(data.id), "Zone deleted.") },
                    ]}
                  />
                ) : null,
              200,
            ),
          ]
        : []),
    ],
    [owner],
  )
  return (
    <>
      <DataGrid<ZoneRow>
        rows={rows}
        columns={columns}
        tabs={[{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "paused", label: "Paused" }]}
        searchPlaceholder="Search zones or pincodes…"
        noMatches="No zones match your filters."
        context={ctx}
      />
      <Sheet open={editing !== null} onOpenChange={(v) => !v && setEditId(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit zone</SheetTitle>
            <SheetDescription>{editing?.name}</SheetDescription>
          </SheetHeader>
          {editing ? <div className="px-4 pb-4"><ZoneForm key={editing.id} zone={editing} onDone={() => setEditId(null)} /></div> : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

// ---------- delivery partners ----------

export type PartnerRow = { id: string; code: string; name: string; phone: string; vehicle: string; status: "active" | "paused"; current: string | null; hasPin: boolean; link: string }

export function NewPartnerButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [v, setV] = useState({ name: "", phone: "", vehicleNumber: "" })
  const [pin, setPin] = useState("")
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>New partner</SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New delivery partner</SheetTitle>
          <SheetDescription>A rider you can give delivery orders to. They sign in with a PIN.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="dp-name">Name</FieldLabel>
              <Input id="dp-name" value={v.name} placeholder="Mani" onChange={(e) => setV({ ...v, name: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="dp-phone">Mobile number</FieldLabel>
              <Input id="dp-phone" inputMode="tel" value={v.phone} placeholder="98765 43210" onChange={(e) => setV({ ...v, phone: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="dp-veh">Vehicle number (optional)</FieldLabel>
              <Input id="dp-veh" value={v.vehicleNumber} placeholder="TN 09 AB 1234" onChange={(e) => setV({ ...v, vehicleNumber: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="dp-pin">Sign-in PIN (4 to 6 digits)</FieldLabel>
              <Input id="dp-pin" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(digits(e.target.value))} />
              <FieldDescription>The rider uses this on their delivery page. You can set or change it later.</FieldDescription>
            </Field>
            <Button
              className="w-fit"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await createPartner(v, pin)
                  if (res.ok) {
                    toast.success("Partner added.")
                    setV({ name: "", phone: "", vehicleNumber: "" })
                    setPin("")
                    setOpen(false)
                    router.refresh()
                  } else toast.error(res.error)
                })
              }
            >
              Add partner
            </Button>
          </FieldGroup>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function PartnersGrid({ rows, owner }: { rows: PartnerRow[]; owner: boolean }) {
  const ctx = useRunner()
  const columns = useMemo<ColDef<PartnerRow>[]>(
    () => [
      { field: "code", headerName: "ID", width: 100, cellClass: "font-mono font-semibold" },
      {
        field: "name",
        headerName: "Partner",
        minWidth: 170,
        flex: 1,
        cellRenderer: ({ data }: CustomCellRendererProps<PartnerRow>) =>
          data ? (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">{data.name}</span>
              <a href={`tel:${data.phone}`} className="text-xs text-muted-foreground underline">{data.phone}</a>
            </div>
          ) : null,
      },
      { field: "vehicle", headerName: "Vehicle", width: 130, valueFormatter: (p: ValueFormatterParams) => p.value || "—" },
      { field: "current", headerName: "Delivering", width: 140, cellRenderer: ({ data }: CustomCellRendererProps<PartnerRow>) => (data?.current ? <Badge>{data.current}</Badge> : <span className="text-muted-foreground">Free</span>) },
      { field: "hasPin", headerName: "PIN", width: 100, cellRenderer: ({ data }: CustomCellRendererProps<PartnerRow>) => (data ? <span className={data.hasPin ? "" : "text-muted-foreground"}>{data.hasPin ? "Set" : "Not set"}</span> : null) },
      {
        field: "status",
        headerName: "Status",
        width: 125,
        cellRenderer: ({ data }: CustomCellRendererProps<PartnerRow>) => (data ? <Badge variant={data.status === "active" ? "default" : "secondary"} className="capitalize">{data.status}</Badge> : null),
        ...(optionsFilter({ options: ["active", "paused"] }) as Partial<ColDef<PartnerRow>>),
      },
      actionsCol<PartnerRow>(
        ({ data, context }) =>
          data ? (
            <DataTableRowActions
              label={`More actions for ${data.name}`}
              actions={[
                { label: "Copy link", onClick: () => navigator.clipboard.writeText(data.link).then(() => toast.success("Rider link copied"), () => toast.error(`Copy this link: ${data.link}`)) },
                owner && { label: data.hasPin ? "Change PIN" : "Set PIN", onClick: () => { const pin = window.prompt(`Set a 4 to 6 digit PIN for ${data.name}.`); if (pin) context.run(() => setPartnerPin(data.id, pin), "PIN saved.") } },
                owner && { label: "Status", value: data.status, options: [{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }], onSelect: (v) => context.run(() => setPartnerActive(data.id, v === "active")) },
                owner && { label: "Delete", destructive: true, confirm: { title: `Delete ${data.name}?` }, onClick: () => context.run(() => deletePartner(data.id), "Partner deleted.") },
              ]}
            />
          ) : null,
        56,
      ),
    ],
    [owner],
  )
  return (
    <DataGrid<PartnerRow>
      rows={rows}
      columns={columns}
      tabs={[{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "paused", label: "Paused" }]}
      searchPlaceholder="Search partners…"
      noMatches="No partners match your filters."
      context={ctx}
    />
  )
}

// ---------- payments ----------

export type PaymentRow = { id: string; code: string; customer: string; phone: string; method: string; online: boolean; total: number; status: "paid" | "pending" | "cancelled" | "refunded"; placedAt: string; paidAt: string | null }

export function PaymentsGrid({ rows }: { rows: PaymentRow[] }) {
  const ctx = useRunner()
  const columns = useMemo<ColDef<PaymentRow>[]>(
    () => [
      { field: "code", headerName: "Order", width: 130, cellClass: "font-mono font-semibold" },
      {
        field: "customer",
        headerName: "Guest",
        minWidth: 220,
        flex: 1,
        cellRenderer: ({ data }: CustomCellRendererProps<PaymentRow>) =>
          data ? (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">{data.customer}</span>
              <span className="text-xs text-muted-foreground">{data.phone}</span>
            </div>
          ) : null,
      },
      { field: "method", headerName: "Method", width: 160 },
      { field: "total", headerName: "Amount", width: 130, filter: "number", cellRenderer: ({ data }: CustomCellRendererProps<PaymentRow>) => <span className="font-medium">{data ? rupees(data.total) : ""}</span> },
      {
        field: "status",
        headerName: "Status",
        width: 130,
        cellRenderer: ({ data }: CustomCellRendererProps<PaymentRow>) =>
          data ? <Badge variant={data.status === "paid" ? "default" : data.status === "cancelled" ? "destructive" : "secondary"} className="capitalize">{data.status}</Badge> : null,
        ...(optionsFilter({ options: ["paid", "pending", "cancelled", "refunded"] }) as Partial<ColDef<PaymentRow>>),
      },
      { field: "placedAt", headerName: "Placed", width: 170, valueFormatter: (p: ValueFormatterParams) => dateTimeFmt.format(new Date(p.value)) },
      { field: "paidAt", headerName: "Paid", width: 170, valueFormatter: (p: ValueFormatterParams) => (p.value ? dateTimeFmt.format(new Date(p.value)) : "—") },
      actionsCol<PaymentRow>(
        ({ data, context }) =>
          data && !data.online && data.status !== "cancelled" ? (
            <DataTableRowActions
              label="Payment actions"
              actions={[{ label: "Payment", value: data.status === "paid" ? "paid" : "pending", options: [{ value: "paid", label: "Paid" }, { value: "pending", label: "Unpaid" }], onSelect: (v) => context.run(() => setPaymentStatus(data.id, v as "paid" | "pending"), v === "paid" ? "Marked paid." : "Marked unpaid.") }]}
            />
          ) : null,
        150,
      ),
    ],
    [],
  )
  return (
    <DataGrid<PaymentRow>
      rows={rows}
      columns={columns}
      tabs={[{ key: "all", label: "All" }, { key: "paid", label: "Paid" }, { key: "pending", label: "Pending" }, { key: "cancelled", label: "Cancelled" }]}
      searchPlaceholder="Search payments…"
      noMatches="No payments match your filters."
      context={ctx}
    />
  )
}

// ---------- order by location ----------

export type AreaGridRow = { id: string; pincode: string; zone: string; orders: number; revenue: number; average: number }

export function AreasGrid({ rows }: { rows: AreaGridRow[] }) {
  const columns = useMemo<ColDef<AreaGridRow>[]>(
    () => [
      { field: "pincode", headerName: "Pincode", width: 150, cellClass: "font-mono font-semibold" },
      { field: "zone", headerName: "Zone", minWidth: 200, flex: 1, valueFormatter: (p: ValueFormatterParams) => p.value || "—" },
      { field: "orders", headerName: "Orders", width: 130, filter: "number" },
      { field: "revenue", headerName: "Revenue", width: 160, filter: "number", valueFormatter: (p: ValueFormatterParams) => rupees(p.value) },
      { field: "average", headerName: "Avg order", width: 160, filter: "number", valueFormatter: (p: ValueFormatterParams) => rupees(p.value) },
    ],
    [],
  )
  return (
    <DataGrid<AreaGridRow>
      rows={rows}
      columns={columns}
      searchPlaceholder="Search pincodes or zones…"
      noMatches="No areas match your search."
    />
  )
}

