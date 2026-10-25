"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import type { ColDef, ValueFormatterParams } from "ag-grid-community"
import type { CustomCellRendererProps } from "ag-grid-react"
import {
  Calendar03Icon,
  CheckmarkBadge01Icon,
  Clock01Icon,
  DeliveryTruck01Icon,
  Location01Icon,
  MoreHorizontalIcon,
  Money03Icon,
  Package01Icon,
  Restaurant01Icon,
  ShoppingBag01Icon,
  User02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "@/lib/toast"

import { optionsFilter } from "@/components/cars/cars-grid"
import { DataGrid } from "@/components/restaurant/data-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import {
  adjustStock,
  createPartner,
  deletePartner,
  deleteZone,
  saveZone,
  setPartnerActive,
  setPartnerPin,
  setPaymentStatus,
  setStockTracking,
  setZoneActive,
} from "@/lib/restaurant/admin-actions"
import { STOCK_LABEL, type StockState } from "@/lib/restaurant/stock"

const inr = new Intl.NumberFormat("en-IN")
const rupees = (n: number) => `₹${inr.format(n)}`
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
const digits = (v: string) => v.replace(/\D/g, "")

type Result = { ok: true } | { ok: false; error: string }
type Ctx = { run: (fn: () => Promise<Result>, success?: string, confirm?: string) => void }

function useRunner() {
  const router = useRouter()
  const [, start] = useTransition()
  return useMemo<Ctx>(
    () => ({
      run: (fn, success, confirm) => {
        if (confirm && !window.confirm(confirm)) return
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
const Actions = ({ children }: { children: React.ReactNode }) => <div className="flex items-center justify-end gap-1" data-row-action>{children}</div>

// ---------- inventory ----------

export type InventoryRow = {
  id: string
  name: string
  category: string
  state: StockState
  quantity: number | null
  history: { delta: number; after: number; reason: string; at: string }[]
}

const STOCK_VARIANT: Record<StockState, "default" | "secondary" | "destructive" | "outline"> = { in_stock: "outline", low: "secondary", out: "destructive", untracked: "secondary" }

function StockPanel({ row, onDone }: { row: InventoryRow; onDone: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [opening, setOpening] = useState("")
  const run = (fn: () => Promise<Result>, ok: string, clear = true) =>
    start(async () => {
      const res = await fn()
      if (res.ok) {
        toast.success(ok)
        if (clear) {
          setAmount("")
          setReason("")
          setOpening("")
        }
        router.refresh()
      } else toast.error(res.error)
    })
  const n = Number(amount)

  if (row.quantity === null)
    return (
      <FieldGroup>
        <p className="text-sm text-muted-foreground">Stock is not tracked for this dish. Turn tracking on and the count goes down with every order. At zero the dish is marked sold out by itself.</p>
        <Field>
          <FieldLabel htmlFor="st-open">Opening quantity</FieldLabel>
          <Input id="st-open" inputMode="numeric" value={opening} placeholder="e.g. 40" onChange={(e) => setOpening(digits(e.target.value))} />
        </Field>
        <Button className="w-fit" disabled={pending || opening === ""} onClick={() => run(() => setStockTracking(row.id, Number(opening)), "Stock tracking started.")}>
          Start tracking
        </Button>
      </FieldGroup>
    )

  return (
    <FieldGroup>
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">In stock now</p>
        <p className="text-3xl font-semibold tracking-tight">{row.quantity}</p>
      </div>
      <Field>
        <FieldLabel htmlFor="st-amount">Quantity</FieldLabel>
        <Input id="st-amount" inputMode="numeric" value={amount} placeholder="e.g. 10" onChange={(e) => setAmount(digits(e.target.value))} />
      </Field>
      <Field>
        <FieldLabel htmlFor="st-reason">Reason (optional)</FieldLabel>
        <Input id="st-reason" value={reason} placeholder="Delivery from supplier" maxLength={80} onChange={(e) => setReason(e.target.value)} />
        <FieldDescription>Every change is recorded below with its reason.</FieldDescription>
      </Field>
      <div className="flex gap-2">
        <Button disabled={pending || !n} onClick={() => run(() => adjustStock(row.id, n, reason || "Manual restock"), "Stock added.")}>Add stock</Button>
        <Button variant="outline" disabled={pending || !n} onClick={() => run(() => adjustStock(row.id, -n, reason || "Manual deduction"), "Stock removed.")}>Remove stock</Button>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Recent changes</p>
        {row.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {row.history.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{h.reason}</span>
                  <span className="text-xs text-muted-foreground">{dateTimeFmt.format(new Date(h.at))}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={h.delta < 0 ? "font-medium text-destructive" : "font-medium text-success"}>{h.delta > 0 ? `+${h.delta}` : h.delta}</span>
                  <span className="block text-xs text-muted-foreground">left {h.after}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button variant="ghost" className="w-fit" disabled={pending} onClick={() => window.confirm("Stop tracking this dish? It will go back to Available / Sold out only.") && run(() => setStockTracking(row.id, null), "Stock tracking stopped.", false)}>
        Stop tracking
      </Button>
      <Button variant="outline" className="w-fit" onClick={onDone}>Close</Button>
    </FieldGroup>
  )
}

export function InventoryGrid({ rows }: { rows: InventoryRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = rows.find((r) => r.id === openId) ?? null
  const columns = useMemo<ColDef<InventoryRow>[]>(
    () => [
      { field: "name", headerName: "Dish", headerClass: "hdr-icon hdr-dish", minWidth: 240, flex: 1, cellClass: "font-medium" },
      { field: "category", headerName: "Category", headerClass: "hdr-icon hdr-category", width: 180, valueFormatter: (p: ValueFormatterParams) => p.value || "—" },
      {
        field: "state",
        headerName: "Status",
        headerClass: "hdr-icon hdr-status",
        width: 160,
        cellRenderer: ({ data }: CustomCellRendererProps<InventoryRow>) => (data ? <Badge variant={STOCK_VARIANT[data.state]}>{STOCK_LABEL[data.state]}</Badge> : null),
        ...(optionsFilter({ options: ["in_stock", "low", "out", "untracked"], labels: STOCK_LABEL }) as Partial<ColDef<InventoryRow>>),
      },
      { field: "quantity", headerName: "Quantity", headerClass: "hdr-icon hdr-qty", width: 140, filter: "agNumberColumnFilter", valueFormatter: (p: ValueFormatterParams) => (p.value === null ? "—" : String(p.value)) },
      actionsCol<InventoryRow>(({ data }) => (data ? <Actions><Button size="sm" variant="outline" tabIndex={-1}>{data.quantity === null ? "Track stock" : "Adjust"}</Button></Actions> : null), 150),
    ],
    [],
  )
  return (
    <>
      <DataGrid<InventoryRow>
        rows={rows}
        columns={columns}
        icons={{ dish: Restaurant01Icon, category: Package01Icon, status: CheckmarkBadge01Icon, qty: Package01Icon }}
        tabs={[{ key: "all", label: "All" }, { key: "in_stock", label: "In stock" }, { key: "low", label: "Low" }, { key: "out", label: "Out" }, { key: "untracked", label: "Not tracked" }]}
        searchPlaceholder="Search dishes…"
        noMatches="No dishes match your filters."
        rowHeight={56}
        onRowClick={(r) => setOpenId(r.id)}
      />
      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{open?.name}</SheetTitle>
            <SheetDescription>Stock levels and changes</SheetDescription>
          </SheetHeader>
          {open ? <div className="px-4 pb-4"><StockPanel key={open.id} row={open} onDone={() => setOpenId(null)} /></div> : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

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
      { field: "name", headerName: "Zone", headerClass: "hdr-icon hdr-zone", minWidth: 200, flex: 1, cellClass: "font-medium" },
      { field: "pincodeText", headerName: "Pincodes", headerClass: "hdr-icon hdr-zone", minWidth: 220, flex: 1, cellClass: "text-muted-foreground" },
      { field: "fee", headerName: "Charge", headerClass: "hdr-icon hdr-money", width: 130, filter: "agNumberColumnFilter", valueFormatter: (p: ValueFormatterParams) => (p.value ? rupees(p.value) : "Free") },
      { field: "minOrder", headerName: "Min order", headerClass: "hdr-icon hdr-money", width: 140, filter: "agNumberColumnFilter", valueFormatter: (p: ValueFormatterParams) => (p.value ? rupees(p.value) : "Default") },
      { field: "etaMinutes", headerName: "Time", headerClass: "hdr-icon hdr-time", width: 120, valueFormatter: (p: ValueFormatterParams) => (p.value ? `${p.value} min` : "—") },
      {
        field: "status",
        headerName: "Status",
        headerClass: "hdr-icon hdr-status",
        width: 130,
        cellRenderer: ({ data }: CustomCellRendererProps<ZoneRow>) => (data ? <Badge variant={data.status === "active" ? "default" : "secondary"} className="capitalize">{data.status}</Badge> : null),
        ...(optionsFilter({ options: ["active", "paused"] }) as Partial<ColDef<ZoneRow>>),
      },
      ...(owner
        ? [
            actionsCol<ZoneRow>(
              ({ data, context }) =>
                data ? (
                  <Actions>
                    <Button size="sm" variant="outline" tabIndex={-1} onClick={() => context.run(() => setZoneActive(data.id, data.status === "paused"))}>{data.status === "paused" ? "Resume" : "Pause"}</Button>
                    <Button size="sm" variant="ghost" tabIndex={-1} onClick={() => context.run(() => deleteZone(data.id), "Zone deleted.", `Delete ${data.name}?`)}>Delete</Button>
                  </Actions>
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
        icons={{ zone: Location01Icon, money: Money03Icon, time: Clock01Icon, status: CheckmarkBadge01Icon }}
        tabs={[{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "paused", label: "Paused" }]}
        searchPlaceholder="Search zones or pincodes…"
        noMatches="No zones match your filters."
        rowHeight={56}
        context={ctx}
        onRowClick={owner ? (r) => setEditId(r.id) : undefined}
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
      { field: "code", headerName: "ID", headerClass: "hdr-icon hdr-id", width: 100, cellClass: "font-mono font-semibold" },
      {
        field: "name",
        headerName: "Partner",
        headerClass: "hdr-icon hdr-user",
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
      { field: "vehicle", headerName: "Vehicle", headerClass: "hdr-icon hdr-truck", width: 130, valueFormatter: (p: ValueFormatterParams) => p.value || "—" },
      { field: "current", headerName: "Delivering", headerClass: "hdr-icon hdr-order", width: 140, cellRenderer: ({ data }: CustomCellRendererProps<PartnerRow>) => (data?.current ? <Badge>{data.current}</Badge> : <span className="text-muted-foreground">Free</span>) },
      { field: "hasPin", headerName: "PIN", headerClass: "hdr-icon hdr-status", width: 100, cellRenderer: ({ data }: CustomCellRendererProps<PartnerRow>) => (data ? <span className={data.hasPin ? "" : "text-muted-foreground"}>{data.hasPin ? "Set" : "Not set"}</span> : null) },
      {
        field: "status",
        headerName: "Status",
        headerClass: "hdr-icon hdr-status",
        width: 125,
        cellRenderer: ({ data }: CustomCellRendererProps<PartnerRow>) => (data ? <Badge variant={data.status === "active" ? "default" : "secondary"} className="capitalize">{data.status}</Badge> : null),
        ...(optionsFilter({ options: ["active", "paused"] }) as Partial<ColDef<PartnerRow>>),
      },
      actionsCol<PartnerRow>(
        ({ data, context }) =>
          data ? (
            <Actions>
              <Button size="sm" variant="outline" tabIndex={-1} onClick={() => navigator.clipboard.writeText(data.link).then(() => toast.success("Rider link copied"), () => toast.error(`Copy this link: ${data.link}`))}>Copy link</Button>
              {owner ? (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${data.name}`} data-row-action />}>
                    <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { const pin = window.prompt(`Set a 4 to 6 digit PIN for ${data.name}.`); if (pin) context.run(() => setPartnerPin(data.id, pin), "PIN saved.") }}>{data.hasPin ? "Change PIN" : "Set PIN"}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => context.run(() => setPartnerActive(data.id, data.status === "paused"))}>{data.status === "paused" ? "Resume" : "Pause"}</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => context.run(() => deletePartner(data.id), "Partner deleted.", `Delete ${data.name}?`)}>Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </Actions>
          ) : null,
        owner ? 170 : 140,
      ),
    ],
    [owner],
  )
  return (
    <DataGrid<PartnerRow>
      rows={rows}
      columns={columns}
      icons={{ id: User02Icon, user: User02Icon, truck: DeliveryTruck01Icon, order: ShoppingBag01Icon, status: CheckmarkBadge01Icon }}
      tabs={[{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "paused", label: "Paused" }]}
      searchPlaceholder="Search partners…"
      noMatches="No partners match your filters."
      rowHeight={60}
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
      { field: "code", headerName: "Order", headerClass: "hdr-icon hdr-order", width: 130, cellClass: "font-mono font-semibold" },
      {
        field: "customer",
        headerName: "Guest",
        headerClass: "hdr-icon hdr-user",
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
      { field: "method", headerName: "Method", headerClass: "hdr-icon hdr-money", width: 160 },
      { field: "total", headerName: "Amount", headerClass: "hdr-icon hdr-money", width: 130, filter: "agNumberColumnFilter", cellRenderer: ({ data }: CustomCellRendererProps<PaymentRow>) => <span className="font-medium">{data ? rupees(data.total) : ""}</span> },
      {
        field: "status",
        headerName: "Status",
        headerClass: "hdr-icon hdr-status",
        width: 130,
        cellRenderer: ({ data }: CustomCellRendererProps<PaymentRow>) =>
          data ? <Badge variant={data.status === "paid" ? "default" : data.status === "cancelled" ? "destructive" : "secondary"} className="capitalize">{data.status}</Badge> : null,
        ...(optionsFilter({ options: ["paid", "pending", "cancelled", "refunded"] }) as Partial<ColDef<PaymentRow>>),
      },
      { field: "placedAt", headerName: "Placed", headerClass: "hdr-icon hdr-time", width: 170, valueFormatter: (p: ValueFormatterParams) => dateTimeFmt.format(new Date(p.value)) },
      { field: "paidAt", headerName: "Paid", headerClass: "hdr-icon hdr-time", width: 170, valueFormatter: (p: ValueFormatterParams) => (p.value ? dateTimeFmt.format(new Date(p.value)) : "—") },
      actionsCol<PaymentRow>(
        ({ data, context }) =>
          data && !data.online && data.status !== "cancelled" ? (
            <Actions>
              <Button size="sm" variant="outline" tabIndex={-1} onClick={() => context.run(() => setPaymentStatus(data.id, data.status === "paid" ? "pending" : "paid"), data.status === "paid" ? "Marked unpaid." : "Marked paid.")}>
                {data.status === "paid" ? "Mark unpaid" : "Mark paid"}
              </Button>
            </Actions>
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
      icons={{ order: ShoppingBag01Icon, user: User02Icon, money: Money03Icon, status: CheckmarkBadge01Icon, time: Calendar03Icon }}
      tabs={[{ key: "all", label: "All" }, { key: "paid", label: "Paid" }, { key: "pending", label: "Pending" }, { key: "cancelled", label: "Cancelled" }]}
      searchPlaceholder="Search payments…"
      noMatches="No payments match your filters."
      rowHeight={56}
      context={ctx}
    />
  )
}

// ---------- order by location ----------

export type AreaGridRow = { id: string; pincode: string; zone: string; orders: number; revenue: number; average: number }

export function AreasGrid({ rows }: { rows: AreaGridRow[] }) {
  const columns = useMemo<ColDef<AreaGridRow>[]>(
    () => [
      { field: "pincode", headerName: "Pincode", headerClass: "hdr-icon hdr-zone", width: 150, cellClass: "font-mono font-semibold" },
      { field: "zone", headerName: "Zone", headerClass: "hdr-icon hdr-zone", minWidth: 200, flex: 1, valueFormatter: (p: ValueFormatterParams) => p.value || "—" },
      { field: "orders", headerName: "Orders", headerClass: "hdr-icon hdr-order", width: 130, filter: "agNumberColumnFilter" },
      { field: "revenue", headerName: "Revenue", headerClass: "hdr-icon hdr-money", width: 160, filter: "agNumberColumnFilter", valueFormatter: (p: ValueFormatterParams) => rupees(p.value) },
      { field: "average", headerName: "Avg order", headerClass: "hdr-icon hdr-money", width: 160, filter: "agNumberColumnFilter", valueFormatter: (p: ValueFormatterParams) => rupees(p.value) },
    ],
    [],
  )
  return (
    <DataGrid<AreaGridRow>
      rows={rows}
      columns={columns}
      icons={{ zone: Location01Icon, order: ShoppingBag01Icon, money: Money03Icon }}
      searchPlaceholder="Search pincodes or zones…"
      noMatches="No areas match your search."
      rowHeight={52}
    />
  )
}

