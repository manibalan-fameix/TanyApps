"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useTransition } from "react"
import { toast } from "@/lib/toast"

import { DataTableRowActions, rowActionsColumn } from "@/components/data-table/data-table-row-actions"
import { type ColDef, type CustomCellRendererProps, DataGrid, type ValueFormatterParams, optionsFilter } from "@/components/data-table/data-grid"
import { Badge } from "@/components/ui/badge"
import { OrderStatusBadge } from "@/components/restaurant/order-status-badge"
import {
  deleteCoupon,
  setCouponActive,
  setEnquiryHandled,
  setTableBookingStatus,
  setReviewStatus,
} from "@/lib/restaurant/admin-actions"
import { ORDER_STATUSES, STATUS_LABEL } from "@/lib/restaurant/orders"

const inr = new Intl.NumberFormat("en-IN")
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" })
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
const rupees = (n: number) => `₹${inr.format(n)}`
const dash = (p: ValueFormatterParams) => p.value || "—"

type Result = { ok: true } | { ok: false; error: string }
type Ctx = { run: (fn: () => Promise<Result>, success?: string) => void }

/** Runs a row action, then refreshes. */
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

const actionsCol = <T,>(renderer: (p: CustomCellRendererProps<T, unknown, Ctx>) => React.ReactNode, width = 200): ColDef<T> => ({
  colId: "actions",
  headerName: "",
  cellRenderer: renderer,
  width,
  sortable: false,
  filter: false,
  pinned: "right",
})

// ---------- orders ----------

export type OrderRow = {
  id: string
  code: string
  customer: string
  phone: string
  fulfilment: string
  summary: string
  total: number
  status: string
  createdAt: string
}

export function OrdersGrid({ rows }: { rows: OrderRow[] }) {
  const router = useRouter()
  const columns = useMemo<ColDef<OrderRow>[]>(
    () => [
      { field: "code", headerName: "Order", width: 110, cellRenderer: ({ data }: CustomCellRendererProps<OrderRow>) => (data ? <Link href={`/orders/${data.id}`} scroll={false} className="font-medium underline">{data.code}</Link> : null) },
      {
        field: "customer",
        headerName: "Guest",
        minWidth: 170,
        flex: 1,
        cellRenderer: ({ data }: CustomCellRendererProps<OrderRow>) =>
          data ? (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">{data.customer}</span>
              <span className="text-xs text-muted-foreground">{data.phone}</span>
            </div>
          ) : null,
      },
      { field: "summary", headerName: "Items", minWidth: 120, flex: 1, cellClass: "text-muted-foreground" },
      { field: "fulfilment", headerName: "Type", width: 110, ...(optionsFilter({ options: ["Delivery", "Pickup", "Dine in"] }) as Partial<ColDef<OrderRow>>) },
      { field: "total", headerName: "Total", width: 110, filter: "number", cellRenderer: ({ data }: CustomCellRendererProps<OrderRow>) => <span className="font-medium">{data ? rupees(data.total) : ""}</span> },
      {
        field: "status",
        headerName: "Status",
        width: 180,
        cellRenderer: ({ data }: CustomCellRendererProps<OrderRow>) =>
          data ? <OrderStatusBadge status={data.status} /> : null,
        ...(optionsFilter({ options: [...ORDER_STATUSES], labels: STATUS_LABEL }) as Partial<ColDef<OrderRow>>),
      },
      { field: "createdAt", headerName: "Placed", width: 150, valueFormatter: (p: ValueFormatterParams) => dateTimeFmt.format(new Date(p.value)) },
      rowActionsColumn<OrderRow>((o) => ({ label: `Actions for order ${o.code}`, actions: [{ label: "View", onClick: () => router.push(`/orders/${o.id}`, { scroll: false }) }] })),
    ],
    [router],
  )
  return (
    <DataGrid<OrderRow>
      rows={rows}
      columns={columns}
      tabs={[
        { key: "all", label: "All" },
        { key: "pending_payment", label: "Unpaid" },
        { key: "new", label: "New" },
        { key: "preparing", label: "Preparing" },
        { key: "completed", label: "Completed" },
        { key: "cancelled", label: "Cancelled" },
      ]}
      searchPlaceholder="Search orders…"
      noMatches="No orders match your filters."
    />
  )
}

// ---------- customers ----------

export type CustomerRow = { id: string; name: string; phone: string; orders: number; spent: number; lastOrderAt: string }

export function CustomersGrid({ rows }: { rows: CustomerRow[] }) {
  const router = useRouter()
  const columns = useMemo<ColDef<CustomerRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Guest",
        minWidth: 240,
        flex: 1,
        cellRenderer: ({ data }: CustomCellRendererProps<CustomerRow>) =>
          data ? (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">{data.name}</span>
              <span className="text-xs text-muted-foreground">{data.phone}</span>
            </div>
          ) : null,
      },
      { field: "orders", headerName: "Orders", width: 130, filter: "number" },
      { field: "spent", headerName: "Spent", width: 150, filter: "number", cellRenderer: ({ data }: CustomCellRendererProps<CustomerRow>) => <span className="font-medium">{data ? rupees(data.spent) : ""}</span> },
      { field: "lastOrderAt", headerName: "Last order", width: 170, valueFormatter: (p: ValueFormatterParams) => dateFmt.format(new Date(p.value)) },
      rowActionsColumn<CustomerRow>((c) => ({ label: `Actions for ${c.name}`, actions: [{ label: "View", onClick: () => router.push(`/customers/${encodeURIComponent(c.id)}`) }] })),
    ],
    [router],
  )
  return (
    <DataGrid<CustomerRow>
      rows={rows}
      columns={columns}
      searchPlaceholder="Search guests…"
      noMatches="No guests match your search."
    />
  )
}

// ---------- coupons ----------

export type CouponRow = { id: string; code: string; offer: string; minOrder: number; used: number; expires: string | null; status: "active" | "paused" | "expired" }

export function CouponsGrid({ rows, owner }: { rows: CouponRow[]; owner: boolean }) {
  const ctx = useRunner()
  const columns = useMemo<ColDef<CouponRow>[]>(
    () => [
      { field: "code", headerName: "Code", width: 170, cellRenderer: ({ data }: CustomCellRendererProps<CouponRow>) => <span className="font-mono font-semibold">{data?.code}</span> },
      { field: "offer", headerName: "Offer", minWidth: 220, flex: 1 },
      { field: "minOrder", headerName: "Min order", width: 150, filter: "number", valueFormatter: (p: ValueFormatterParams) => (p.value ? rupees(p.value) : "—") },
      { field: "used", headerName: "Used", width: 110, filter: "number" },
      { field: "expires", headerName: "Valid until", width: 160, valueFormatter: (p: ValueFormatterParams) => (p.value ? dateFmt.format(new Date(p.value)) : "No expiry") },
      {
        field: "status",
        headerName: "Status",
        width: 130,
        cellRenderer: ({ data }: CustomCellRendererProps<CouponRow>) => (data ? <Badge variant={data.status === "active" ? "default" : "secondary"} className="capitalize">{data.status}</Badge> : null),
        ...(optionsFilter({ options: ["active", "paused", "expired"] }) as Partial<ColDef<CouponRow>>),
      },
      ...(owner
        ? [
            actionsCol<CouponRow>(({ data, context }) =>
              data ? (
                <DataTableRowActions
                  label={`Actions for ${data.code}`}
                  actions={[
                    data.status !== "expired" && { label: "Status", value: data.status, options: [{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }], onSelect: (v) => context.run(() => setCouponActive(data.id, v === "active")) },
                    { label: "Delete", destructive: true, confirm: { title: `Delete ${data.code}?` }, onClick: () => context.run(() => deleteCoupon(data.id), "Coupon deleted.") },
                  ]}
                />
              ) : null, 210),
          ]
        : []),
    ],
    [owner],
  )
  return (
    <DataGrid<CouponRow>
      rows={rows}
      columns={columns}
      tabs={[{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "paused", label: "Paused" }, { key: "expired", label: "Expired" }]}
      searchPlaceholder="Search coupons…"
      noMatches="No coupons match your filters."
      context={ctx}
    />
  )
}

// ---------- reviews ----------

export type ReviewRow = { id: string; name: string; rating: number; comment: string; media: { type: "image" | "video"; url: string }[]; status: "pending" | "approved" | "hidden"; createdAt: string }
const REVIEW_LABEL = { pending: "Waiting", approved: "Showing", hidden: "Hidden" }

export function ReviewsGrid({ rows }: { rows: ReviewRow[] }) {
  const ctx = useRunner()
  const columns = useMemo<ColDef<ReviewRow>[]>(
    () => [
      { field: "name", headerName: "Guest", width: 170, cellClass: "font-medium" },
      { field: "rating", headerName: "Rating", width: 140, filter: "number", cellRenderer: ({ data }: CustomCellRendererProps<ReviewRow>) => <span aria-label={`${data?.rating} out of 5`}>{"★".repeat(data?.rating ?? 0)}</span> },
      { field: "comment", headerName: "Review", minWidth: 260, flex: 1, valueFormatter: dash, cellClass: "text-muted-foreground" },
      {
        headerName: "Photos & video",
        width: 200,
        sortable: false,
        filter: false,
        cellRenderer: ({ data }: CustomCellRendererProps<ReviewRow>) =>
          data?.media?.length ? (
            <span className="flex h-full items-center gap-1">
              {data.media.map((m) => (
                <a key={m.url} href={m.url} target="_blank" rel="noreferrer" aria-label={m.type === "video" ? "Open video" : "Open photo"} className="relative size-10 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {m.type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-xs font-semibold">▶</span>
                  )}
                </a>
              ))}
            </span>
          ) : null,
      },
      {
        field: "status",
        headerName: "Status",
        width: 130,
        cellRenderer: ({ data }: CustomCellRendererProps<ReviewRow>) => (data ? <Badge variant={data.status === "approved" ? "default" : "secondary"}>{REVIEW_LABEL[data.status]}</Badge> : null),
        ...(optionsFilter({ options: ["pending", "approved", "hidden"], labels: REVIEW_LABEL }) as Partial<ColDef<ReviewRow>>),
      },
      { field: "createdAt", headerName: "Date", width: 150, valueFormatter: (p: ValueFormatterParams) => dateFmt.format(new Date(p.value)) },
      actionsCol<ReviewRow>(({ data, context }) =>
        data ? (
          <DataTableRowActions
            label={`Actions for the review by ${data.name}`}
            actions={[
              { label: "Status", value: data.status, options: [{ value: "approved", label: "Showing" }, { value: "hidden", label: "Hidden" }], onSelect: (v) => context.run(() => setReviewStatus(data.id, v as "approved" | "hidden")) },
            ]}
          />
        ) : null, 190),
    ],
    [],
  )
  return (
    <DataGrid<ReviewRow>
      rows={rows}
      columns={columns}
      tabs={[{ key: "all", label: "All" }, { key: "pending", label: "Waiting" }, { key: "approved", label: "Showing" }, { key: "hidden", label: "Hidden" }]}
      searchPlaceholder="Search reviews…"
      noMatches="No reviews match your filters."
      context={ctx}
    />
  )
}

// ---------- enquiries ----------

export type EnquiryRow = { id: string; name: string; phone: string; message: string; kind: "question" | "product"; status: "new" | "handled"; createdAt: string }

const KIND_LABEL = { product: "Product request", question: "Question" } as const

export function EnquiriesGrid({ rows }: { rows: EnquiryRow[] }) {
  const ctx = useRunner()
  const columns = useMemo<ColDef<EnquiryRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Customer",
        width: 220,
        cellRenderer: ({ data }: CustomCellRendererProps<EnquiryRow>) =>
          data ? (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">{data.name}</span>
              <a href={`tel:${data.phone}`} className="text-xs text-muted-foreground underline">{data.phone}</a>
            </div>
          ) : null,
      },
      {
        field: "kind",
        headerName: "Type",
        width: 170,
        cellRenderer: ({ data }: CustomCellRendererProps<EnquiryRow>) => (data ? <Badge variant={data.kind === "product" ? "outline" : "secondary"}>{KIND_LABEL[data.kind]}</Badge> : null),
        ...(optionsFilter({ options: ["product", "question"], labels: KIND_LABEL }) as Partial<ColDef<EnquiryRow>>),
      },
      { field: "message", headerName: "Message", minWidth: 300, flex: 1, cellClass: "text-muted-foreground whitespace-pre-line" },
      {
        field: "status",
        headerName: "Status",
        width: 130,
        cellRenderer: ({ data }: CustomCellRendererProps<EnquiryRow>) => (data ? <Badge variant={data.status === "new" ? "default" : "secondary"}>{data.status === "new" ? "New" : "Handled"}</Badge> : null),
        ...(optionsFilter({ options: ["new", "handled"], labels: { new: "New", handled: "Handled" } }) as Partial<ColDef<EnquiryRow>>),
      },
      { field: "createdAt", headerName: "Received", width: 170, valueFormatter: (p: ValueFormatterParams) => dateTimeFmt.format(new Date(p.value)) },
      actionsCol<EnquiryRow>(({ data, context }) =>
        data ? (
          <DataTableRowActions label="Enquiry actions" actions={[{ label: "Status", value: data.status, options: [{ value: "new", label: "New" }, { value: "handled", label: "Handled" }], onSelect: (v) => context.run(() => setEnquiryHandled(data.id, v === "handled")) }]} />
        ) : null, 170),
    ],
    [],
  )
  return (
    <DataGrid<EnquiryRow>
      rows={rows}
      columns={columns}
      tabs={[{ key: "all", label: "All" }, { key: "new", label: "New" }, { key: "handled", label: "Handled" }]}
      searchPlaceholder="Search messages…"
      noMatches="No messages match your filters."
      context={ctx}
    />
  )
}


export type TableBookingRow = { id: string; name: string; phone: string; guests: number; when: string; note: string; status: "new" | "confirmed" | "declined"; createdAt: string }

const BOOKING_LABEL = { new: "New", confirmed: "Confirmed", declined: "Declined" } as const

export function TableBookingsGrid({ rows }: { rows: TableBookingRow[] }) {
  const ctx = useRunner()
  const columns = useMemo<ColDef<TableBookingRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Guest",
        width: 220,
        cellRenderer: ({ data }: CustomCellRendererProps<TableBookingRow>) =>
          data ? (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">{data.name}</span>
              <a href={`tel:${data.phone}`} className="text-xs text-muted-foreground underline">{data.phone}</a>
            </div>
          ) : null,
      },
      { field: "when", headerName: "Table for", width: 190, valueFormatter: (p: ValueFormatterParams) => dateTimeFmt.format(new Date(p.value)) },
      { field: "guests", headerName: "Guests", width: 100 },
      { field: "note", headerName: "Note", minWidth: 200, flex: 1, cellClass: "text-muted-foreground" },
      {
        field: "status",
        headerName: "Status",
        width: 140,
        cellRenderer: ({ data }: CustomCellRendererProps<TableBookingRow>) => (data ? <Badge variant={data.status === "new" ? "default" : data.status === "confirmed" ? "secondary" : "outline"}>{BOOKING_LABEL[data.status]}</Badge> : null),
        ...(optionsFilter({ options: ["new", "confirmed", "declined"], labels: BOOKING_LABEL }) as Partial<ColDef<TableBookingRow>>),
      },
      actionsCol<TableBookingRow>(({ data, context }) =>
        data ? (
          <DataTableRowActions
            label="Booking actions"
            actions={[
              { label: "Status", value: data.status, options: [{ value: "confirmed", label: "Confirmed" }, { value: "declined", label: "Declined" }], onSelect: (v) => context.run(() => setTableBookingStatus(data.id, v as "confirmed" | "declined")) },
            ]}
          />
        ) : null, 230),
    ],
    [],
  )
  return (
    <DataGrid<TableBookingRow>
      rows={rows}
      columns={columns}
      tabs={[{ key: "all", label: "All" }, { key: "new", label: "New" }, { key: "confirmed", label: "Confirmed" }, { key: "declined", label: "Declined" }]}
      searchPlaceholder="Search bookings…"
      noMatches="No bookings match your filters."
      context={ctx}
    />
  )
}
