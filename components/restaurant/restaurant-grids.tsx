"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import type { ColDef, ValueFormatterParams } from "ag-grid-community"
import type { CustomCellRendererProps } from "ag-grid-react"
import {
  Calendar03Icon,
  CheckmarkBadge01Icon,
  Clock01Icon,
  Call02Icon,
  Mail01Icon,
  Money03Icon,
  Restaurant01Icon,
  ShoppingBag01Icon,
  StarIcon,
  Tag01Icon,
  User02Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "@/lib/toast"

import { optionsFilter } from "@/components/cars/cars-grid"
import { MenuItemForm, type CategoryOption } from "@/components/restaurant/menu-item-form"
import { DataGrid } from "@/components/restaurant/data-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  deleteBanner,
  deleteCoupon,
  setBannerActive,
  setCouponActive,
  setEnquiryHandled,
  setReviewStatus,
} from "@/lib/restaurant/admin-actions"
import { setMenuItemAvailable } from "@/app/(admin)/(shell)/menu/actions"
import type { MenuItemDraft } from "@/lib/restaurant/menu"
import { ORDER_STATUSES, STATUS_LABEL } from "@/lib/restaurant/orders"

const inr = new Intl.NumberFormat("en-IN")
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" })
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
const rupees = (n: number) => `₹${inr.format(n)}`
const dash = (p: ValueFormatterParams) => p.value || "—"

type Result = { ok: true } | { ok: false; error: string }
type Ctx = { run: (fn: () => Promise<Result>, success?: string, confirm?: string) => void }

/** Runs a row action, then refreshes. The dialog/confirm lives out here because the grid recycles its cells. */
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

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-1" data-row-action>{children}</div>
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

// ---------- menu ----------

export type MenuRow = {
  id: string
  name: string
  description: string
  imageUrl: string | null
  categoryId: string | null
  category: string
  price: number
  priceText: string
  isVeg: boolean
  isAvailable: boolean
  isFeatured: boolean
  status: "available" | "sold_out"
  draft: MenuItemDraft
}

const MENU_ICONS = { dish: Restaurant01Icon, category: Tag01Icon, price: Money03Icon, status: CheckmarkBadge01Icon, type: StarIcon }

function DishCell({ data }: CustomCellRendererProps<MenuRow>) {
  if (!data) return null
  return (
    <div className="flex items-center gap-3">
      {data.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.imageUrl} alt="" className="size-12 shrink-0 rounded-lg bg-muted object-cover" />
      ) : (
        <div className="size-12 shrink-0 rounded-lg bg-muted" />
      )}
      <div className="flex min-w-0 flex-col items-start gap-1 leading-tight">
        <span className="max-w-full truncate font-medium">{data.name}</span>
        {data.isFeatured ? <span className="rounded-md border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Bestseller</span> : null}
      </div>
    </div>
  )
}

export function MenuGrid({ rows, categories }: { rows: MenuRow[]; categories: CategoryOption[] }) {
  const ctx = useRunner()
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = rows.find((r) => r.id === editingId) ?? null
  const columns = useMemo<ColDef<MenuRow>[]>(
    () => [
      { field: "name", headerName: "Dish", headerClass: "hdr-icon hdr-dish", cellRenderer: DishCell, minWidth: 260, flex: 2 },
      { field: "category", headerName: "Category", headerClass: "hdr-icon hdr-category", width: 160, valueFormatter: dash },
      { field: "isVeg", headerName: "Type", headerClass: "hdr-icon hdr-type", width: 130, valueFormatter: (p) => (p.value ? "Veg" : "Non-veg") },
      { field: "price", headerName: "Price", headerClass: "hdr-icon hdr-price", width: 150, filter: "agNumberColumnFilter", cellRenderer: ({ data }: CustomCellRendererProps<MenuRow>) => <span className="font-medium">{data?.priceText}</span> },
      {
        field: "status",
        headerName: "Status",
        headerClass: "hdr-icon hdr-status",
        width: 130,
        cellRenderer: ({ data }: CustomCellRendererProps<MenuRow>) => (data ? <Badge variant={data.isAvailable ? "default" : "secondary"}>{data.isAvailable ? "Available" : "Sold out"}</Badge> : null),
        ...(optionsFilter({ options: ["available", "sold_out"], labels: { available: "Available", sold_out: "Sold out" } }) as Partial<ColDef<MenuRow>>),
      },
      actionsCol<MenuRow>(({ data, context }) =>
        data ? (
          <Actions>
            <Button variant="outline" size="sm" tabIndex={-1} onClick={() => context.run(() => setMenuItemAvailable(data.id, !data.isAvailable))}>
              {data.isAvailable ? "Mark sold out" : "Mark available"}
            </Button>
          </Actions>
        ) : null,
      ),
    ],
    [],
  )
  return (
    <>
      <DataGrid<MenuRow>
        rows={rows}
        columns={columns}
        icons={MENU_ICONS}
        tabs={[{ key: "all", label: "All" }, { key: "available", label: "Available" }, { key: "sold_out", label: "Sold out" }]}
        searchPlaceholder="Search dishes…"
        noMatches="No dishes match your filters."
        context={ctx}
        onRowClick={(r) => setEditingId(r.id)}
      />
      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit dish</SheetTitle>
            <SheetDescription>{editing?.name}</SheetDescription>
          </SheetHeader>
          {editing ? (
            <div className="px-4 pb-4">
              <MenuItemForm key={editing.id} itemId={editing.id} categories={categories} initial={editing.draft} onDone={() => setEditingId(null)} />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

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

const ORDER_ICONS = { order: ShoppingBag01Icon, guest: User02Icon, status: CheckmarkBadge01Icon, total: Money03Icon, placed: Clock01Icon, type: Restaurant01Icon }

export function OrdersGrid({ rows }: { rows: OrderRow[] }) {
  const router = useRouter()
  const columns = useMemo<ColDef<OrderRow>[]>(
    () => [
      { field: "code", headerName: "Order", headerClass: "hdr-icon hdr-order", width: 110, cellRenderer: ({ data }: CustomCellRendererProps<OrderRow>) => (data ? <Link href={`/orders/${data.id}`} className="font-medium underline">{data.code}</Link> : null) },
      {
        field: "customer",
        headerName: "Guest",
        headerClass: "hdr-icon hdr-guest",
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
      { field: "fulfilment", headerName: "Type", headerClass: "hdr-icon hdr-type", width: 110, ...(optionsFilter({ options: ["Delivery", "Pickup", "Dine in"] }) as Partial<ColDef<OrderRow>>) },
      { field: "total", headerName: "Total", headerClass: "hdr-icon hdr-total", width: 110, filter: "agNumberColumnFilter", cellRenderer: ({ data }: CustomCellRendererProps<OrderRow>) => <span className="font-medium">{data ? rupees(data.total) : ""}</span> },
      {
        field: "status",
        headerName: "Status",
        headerClass: "hdr-icon hdr-status",
        width: 140,
        cellRenderer: ({ data }: CustomCellRendererProps<OrderRow>) =>
          data ? <Badge variant={data.status === "new" ? "default" : data.status === "cancelled" ? "destructive" : data.status === "completed" ? "outline" : "secondary"}>{STATUS_LABEL[data.status as keyof typeof STATUS_LABEL]}</Badge> : null,
        ...(optionsFilter({ options: [...ORDER_STATUSES], labels: STATUS_LABEL }) as Partial<ColDef<OrderRow>>),
      },
      { field: "createdAt", headerName: "Placed", headerClass: "hdr-icon hdr-placed", width: 150, valueFormatter: (p: ValueFormatterParams) => dateTimeFmt.format(new Date(p.value)) },
    ],
    [],
  )
  return (
    <DataGrid<OrderRow>
      rows={rows}
      columns={columns}
      icons={ORDER_ICONS}
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
      onRowClick={(r) => router.push(`/orders/${r.id}`)}
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
        headerClass: "hdr-icon hdr-guest",
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
      { field: "orders", headerName: "Orders", headerClass: "hdr-icon hdr-order", width: 130, filter: "agNumberColumnFilter" },
      { field: "spent", headerName: "Spent", headerClass: "hdr-icon hdr-total", width: 150, filter: "agNumberColumnFilter", cellRenderer: ({ data }: CustomCellRendererProps<CustomerRow>) => <span className="font-medium">{data ? rupees(data.spent) : ""}</span> },
      { field: "lastOrderAt", headerName: "Last order", headerClass: "hdr-icon hdr-placed", width: 170, valueFormatter: (p: ValueFormatterParams) => dateFmt.format(new Date(p.value)) },
    ],
    [],
  )
  return (
    <DataGrid<CustomerRow>
      rows={rows}
      columns={columns}
      icons={{ guest: User02Icon, order: ShoppingBag01Icon, total: Money03Icon, placed: Clock01Icon }}
      searchPlaceholder="Search guests…"
      noMatches="No guests match your search."
      onRowClick={(r) => router.push(`/customers/${encodeURIComponent(r.id)}`)}
    />
  )
}

// ---------- coupons ----------

export type CouponRow = { id: string; code: string; offer: string; minOrder: number; used: number; expires: string | null; status: "active" | "paused" | "expired" }

export function CouponsGrid({ rows, owner }: { rows: CouponRow[]; owner: boolean }) {
  const ctx = useRunner()
  const columns = useMemo<ColDef<CouponRow>[]>(
    () => [
      { field: "code", headerName: "Code", headerClass: "hdr-icon hdr-code", width: 170, cellRenderer: ({ data }: CustomCellRendererProps<CouponRow>) => <span className="font-mono font-semibold">{data?.code}</span> },
      { field: "offer", headerName: "Offer", headerClass: "hdr-icon hdr-offer", minWidth: 220, flex: 1 },
      { field: "minOrder", headerName: "Min order", headerClass: "hdr-icon hdr-total", width: 150, filter: "agNumberColumnFilter", valueFormatter: (p: ValueFormatterParams) => (p.value ? rupees(p.value) : "—") },
      { field: "used", headerName: "Used", headerClass: "hdr-icon hdr-order", width: 110, filter: "agNumberColumnFilter" },
      { field: "expires", headerName: "Valid until", headerClass: "hdr-icon hdr-placed", width: 160, valueFormatter: (p: ValueFormatterParams) => (p.value ? dateFmt.format(new Date(p.value)) : "No expiry") },
      {
        field: "status",
        headerName: "Status",
        headerClass: "hdr-icon hdr-status",
        width: 130,
        cellRenderer: ({ data }: CustomCellRendererProps<CouponRow>) => (data ? <Badge variant={data.status === "active" ? "default" : "secondary"} className="capitalize">{data.status}</Badge> : null),
        ...(optionsFilter({ options: ["active", "paused", "expired"] }) as Partial<ColDef<CouponRow>>),
      },
      ...(owner
        ? [
            actionsCol<CouponRow>(({ data, context }) =>
              data ? (
                <Actions>
                  <Button variant="outline" size="sm" tabIndex={-1} onClick={() => context.run(() => setCouponActive(data.id, data.status === "paused"))}>{data.status === "paused" ? "Resume" : "Pause"}</Button>
                  <Button variant="ghost" size="sm" tabIndex={-1} onClick={() => context.run(() => deleteCoupon(data.id), "Coupon deleted.", `Delete ${data.code}?`)}>Delete</Button>
                </Actions>
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
      icons={{ code: Tag01Icon, offer: Tag01Icon, total: Money03Icon, order: ShoppingBag01Icon, placed: Calendar03Icon, status: CheckmarkBadge01Icon }}
      tabs={[{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "paused", label: "Paused" }, { key: "expired", label: "Expired" }]}
      searchPlaceholder="Search coupons…"
      noMatches="No coupons match your filters."
      rowHeight={56}
      context={ctx}
    />
  )
}

// ---------- banners ----------

export type BannerRow = { id: string; title: string; subtitle: string; imageUrl: string | null; status: "showing" | "hidden" }

export function BannersGrid({ rows, owner }: { rows: BannerRow[]; owner: boolean }) {
  const ctx = useRunner()
  const columns = useMemo<ColDef<BannerRow>[]>(
    () => [
      {
        field: "title",
        headerName: "Banner",
        headerClass: "hdr-icon hdr-banner",
        minWidth: 300,
        flex: 1,
        cellRenderer: ({ data }: CustomCellRendererProps<BannerRow>) =>
          data ? (
            <div className="flex items-center gap-3">
              {data.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.imageUrl} alt="" className="h-10 w-20 shrink-0 rounded-lg bg-muted object-cover" />
              ) : (
                <div className="h-10 w-20 shrink-0 rounded-lg bg-muted" />
              )}
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate font-medium">{data.title}</span>
                {data.subtitle ? <span className="truncate text-xs text-muted-foreground">{data.subtitle}</span> : null}
              </div>
            </div>
          ) : null,
      },
      {
        field: "status",
        headerName: "Status",
        headerClass: "hdr-icon hdr-status",
        width: 140,
        cellRenderer: ({ data }: CustomCellRendererProps<BannerRow>) => (data ? <Badge variant={data.status === "showing" ? "default" : "secondary"}>{data.status === "showing" ? "Showing" : "Hidden"}</Badge> : null),
        ...(optionsFilter({ options: ["showing", "hidden"], labels: { showing: "Showing", hidden: "Hidden" } }) as Partial<ColDef<BannerRow>>),
      },
      ...(owner
        ? [
            actionsCol<BannerRow>(({ data, context }) =>
              data ? (
                <Actions>
                  <Button variant="outline" size="sm" tabIndex={-1} onClick={() => context.run(() => setBannerActive(data.id, data.status === "hidden"))}>{data.status === "showing" ? "Hide" : "Show"}</Button>
                  <Button variant="ghost" size="sm" tabIndex={-1} onClick={() => context.run(() => deleteBanner(data.id), "Banner deleted.", `Delete "${data.title}"?`)}>Delete</Button>
                </Actions>
              ) : null, 190),
          ]
        : []),
    ],
    [owner],
  )
  return (
    <DataGrid<BannerRow>
      rows={rows}
      columns={columns}
      icons={{ banner: Tag01Icon, status: CheckmarkBadge01Icon }}
      tabs={[{ key: "all", label: "All" }, { key: "showing", label: "Showing" }, { key: "hidden", label: "Hidden" }]}
      searchPlaceholder="Search banners…"
      noMatches="No banners match your filters."
      rowHeight={64}
      context={ctx}
    />
  )
}

// ---------- reviews ----------

export type ReviewRow = { id: string; name: string; rating: number; comment: string; status: "pending" | "approved" | "hidden"; createdAt: string }
const REVIEW_LABEL = { pending: "Waiting", approved: "Showing", hidden: "Hidden" }

export function ReviewsGrid({ rows }: { rows: ReviewRow[] }) {
  const ctx = useRunner()
  const columns = useMemo<ColDef<ReviewRow>[]>(
    () => [
      { field: "name", headerName: "Guest", headerClass: "hdr-icon hdr-guest", width: 170, cellClass: "font-medium" },
      { field: "rating", headerName: "Rating", headerClass: "hdr-icon hdr-rating", width: 140, filter: "agNumberColumnFilter", cellRenderer: ({ data }: CustomCellRendererProps<ReviewRow>) => <span aria-label={`${data?.rating} out of 5`}>{"★".repeat(data?.rating ?? 0)}</span> },
      { field: "comment", headerName: "Review", minWidth: 260, flex: 1, valueFormatter: dash, cellClass: "text-muted-foreground" },
      {
        field: "status",
        headerName: "Status",
        headerClass: "hdr-icon hdr-status",
        width: 130,
        cellRenderer: ({ data }: CustomCellRendererProps<ReviewRow>) => (data ? <Badge variant={data.status === "approved" ? "default" : "secondary"}>{REVIEW_LABEL[data.status]}</Badge> : null),
        ...(optionsFilter({ options: ["pending", "approved", "hidden"], labels: REVIEW_LABEL }) as Partial<ColDef<ReviewRow>>),
      },
      { field: "createdAt", headerName: "Date", headerClass: "hdr-icon hdr-placed", width: 150, valueFormatter: (p: ValueFormatterParams) => dateFmt.format(new Date(p.value)) },
      actionsCol<ReviewRow>(({ data, context }) =>
        data ? (
          <Actions>
            {data.status !== "approved" ? <Button variant="outline" size="sm" tabIndex={-1} onClick={() => context.run(() => setReviewStatus(data.id, "approved"))}>Approve</Button> : null}
            {data.status !== "hidden" ? <Button variant="ghost" size="sm" tabIndex={-1} onClick={() => context.run(() => setReviewStatus(data.id, "hidden"))}>Hide</Button> : null}
          </Actions>
        ) : null, 190),
    ],
    [],
  )
  return (
    <DataGrid<ReviewRow>
      rows={rows}
      columns={columns}
      icons={{ guest: User02Icon, rating: StarIcon, status: CheckmarkBadge01Icon, placed: Calendar03Icon }}
      tabs={[{ key: "all", label: "All" }, { key: "pending", label: "Waiting" }, { key: "approved", label: "Showing" }, { key: "hidden", label: "Hidden" }]}
      searchPlaceholder="Search reviews…"
      noMatches="No reviews match your filters."
      rowHeight={56}
      context={ctx}
    />
  )
}

// ---------- enquiries ----------

export type EnquiryRow = { id: string; name: string; phone: string; message: string; status: "new" | "handled"; createdAt: string }

export function EnquiriesGrid({ rows }: { rows: EnquiryRow[] }) {
  const ctx = useRunner()
  const columns = useMemo<ColDef<EnquiryRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Guest",
        headerClass: "hdr-icon hdr-guest",
        width: 220,
        cellRenderer: ({ data }: CustomCellRendererProps<EnquiryRow>) =>
          data ? (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">{data.name}</span>
              <a href={`tel:${data.phone}`} className="text-xs text-muted-foreground underline">{data.phone}</a>
            </div>
          ) : null,
      },
      { field: "message", headerName: "Message", headerClass: "hdr-icon hdr-message", minWidth: 300, flex: 1, cellClass: "text-muted-foreground" },
      {
        field: "status",
        headerName: "Status",
        headerClass: "hdr-icon hdr-status",
        width: 130,
        cellRenderer: ({ data }: CustomCellRendererProps<EnquiryRow>) => (data ? <Badge variant={data.status === "new" ? "default" : "secondary"}>{data.status === "new" ? "New" : "Handled"}</Badge> : null),
        ...(optionsFilter({ options: ["new", "handled"], labels: { new: "New", handled: "Handled" } }) as Partial<ColDef<EnquiryRow>>),
      },
      { field: "createdAt", headerName: "Received", headerClass: "hdr-icon hdr-placed", width: 170, valueFormatter: (p: ValueFormatterParams) => dateTimeFmt.format(new Date(p.value)) },
      actionsCol<EnquiryRow>(({ data, context }) =>
        data ? (
          <Actions>
            <Button variant="outline" size="sm" tabIndex={-1} onClick={() => context.run(() => setEnquiryHandled(data.id, data.status === "new"))}>{data.status === "new" ? "Mark handled" : "Reopen"}</Button>
          </Actions>
        ) : null, 170),
    ],
    [],
  )
  return (
    <DataGrid<EnquiryRow>
      rows={rows}
      columns={columns}
      icons={{ guest: Call02Icon, message: Mail01Icon, status: CheckmarkBadge01Icon, placed: Clock01Icon }}
      tabs={[{ key: "all", label: "All" }, { key: "new", label: "New" }, { key: "handled", label: "Handled" }]}
      searchPlaceholder="Search messages…"
      noMatches="No messages match your filters."
      rowHeight={56}
      context={ctx}
    />
  )
}

