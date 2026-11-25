"use client"

import { INDUSTRY_KEYS, getVertical } from "@/lib/verticals"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import {
  Download01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { rowActionsColumn } from "@/components/data-table/data-table-row-actions"
import { type ColDef, type CustomCellRendererProps, DataGrid, type GridTab, optionsFilter } from "@/components/data-table/data-grid"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  PHASE_LABEL,
  fmtDate,
  fmtDateTime,
  label,
  rupees,
} from "@/lib/super/format"
import { cn } from "@/lib/utils"
import type {
  BookingListRow,
  BusinessRow,
  CarListRow,
  LeadListRow,
  OrderListRow,
  UserRow,
} from "@/lib/super/data"
import type {
  BannerRow,
  CouponRow,
  CustomerRow,
  EnquiryRow,
  MenuRow,
  PartnerRow,
  ReviewRow,
  ZoneRow,
} from "@/lib/super/queries"
import { healthLabel } from "@/components/super/metrics"

const dash = (p: { value?: unknown }) =>
  p.value == null || p.value === "" ? "—" : String(p.value)
const money = (p: { value?: number | null }) =>
  p.value == null ? "—" : rupees(p.value)
const when = (p: { value?: string | null }) => fmtDateTime(p.value)
const day = (p: { value?: string | null }) => fmtDate(p.value)
const labelled = (p: { value?: string }) => (p.value ? label(p.value) : "—")
const bold = ({ value }: CustomCellRendererProps) => (
  <span className="font-medium">{value}</span>
)
const yesNo = ({ value }: { value?: boolean }) => (value ? "Yes" : "No")


const badge = (
  variant: "default" | "secondary" | "outline" | "destructive" = "secondary"
) =>
  function StatusBadge({ value }: CustomCellRendererProps) {
    return value ? (
      <Badge variant={variant}>{label(String(value))}</Badge>
    ) : null
  }

function useOpenBusiness() {
  const router = useRouter()
  return (id: string) => id && router.push(`/super/businesses/${id}`)
}

/** A column that filters by ticking values, like the dealer admin's Status column. */
const options = <T,>(list: string[], labels?: Record<string, string>) =>
  optionsFilter({ options: list, labels }) as unknown as Partial<ColDef<T>>

/** Download link for the rows a page lists. The server re-checks access and builds the file. */
export function ExportButton({
  kind,
  dealerId,
}: {
  kind: string
  dealerId?: string
}) {
  return (
    <a
      href={`/super/export/${kind}${dealerId ? `?business=${dealerId}` : ""}`}
      className={cn(buttonVariants({ variant: "outline" }))}
    >
      <HugeiconsIcon icon={Download01Icon} strokeWidth={2} />
      Export CSV
    </a>
  )
}

type Common<T> = { rows: T[]; scoped?: boolean; dealerId?: string }

function Shell<T extends { id: string }>({
  rows,
  columns,
  tabs,
  tabField,
  search,
  none,
  scoped,
  open,
  rowTarget,
  exportKind,
  dealerId,
}: {
  rows: T[]
  columns: ColDef<T>[]
  tabs?: GridTab[]
  tabField?: string
  search: string
  none: string
  scoped?: boolean
  open: (id: string) => unknown
  rowTarget: (r: T) => string
  exportKind?: string
  dealerId?: string
}) {
  return (
    <DataGrid<T>
      rows={rows}
      columns={scoped ? columns : [...columns, rowActionsColumn<T>((r) => ({ label: "Row actions", actions: [{ label: "View business", onClick: () => open(rowTarget(r)) }] }))]}
      tabs={tabs}
      tabField={tabField}
      searchPlaceholder={search}
      noMatches={none}
      hideColumns={scoped ? ["business"] : undefined}
      toolbar={
        exportKind && (!scoped || dealerId) ? (
          <ExportButton kind={exportKind} dealerId={dealerId} />
        ) : undefined
      }
    />
  )
}

const tabsOf = (...pairs: [string, string][]): GridTab[] => [
  { key: "all", label: "All" },
  ...pairs.map(([key, l]) => ({ key, label: l })),
]

// ---------- businesses ----------

const HEALTH_LABELS = {
  healthy: "Healthy",
  new: "New",
  at_risk: "At risk",
  dormant: "Dormant",
}

export function BusinessesGrid({ rows }: { rows: BusinessRow[] }) {
  const open = useOpenBusiness()
  const columns = useMemo<ColDef<BusinessRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Business",
        minWidth: 240,
        flex: 2,
        cellRenderer: ({ data }: CustomCellRendererProps<BusinessRow>) =>
          data ? (
            <div className="flex min-w-0 flex-col leading-tight">
              <Link
                href={`/super/businesses/${data.id}`}
                className="truncate font-medium hover:underline"
              >
                {data.name}
              </Link>
              <span className="truncate text-xs text-muted-foreground">
                {data.slug}
              </span>
            </div>
          ) : null,
      },
      {
        field: "industry",
        headerName: "Industry",
        width: 130,
        valueFormatter: labelled,
        ...options<BusinessRow>([...INDUSTRY_KEYS]),
      },
      {
        field: "planLabel",
        headerName: "Plan",
        width: 120,
      },
      {
        field: "phase",
        headerName: "Billing",
        width: 150,
        cellRenderer: ({ data }: CustomCellRendererProps<BusinessRow>) =>
          data ? (
            <Badge
              variant={
                data.phase === "active"
                  ? "default"
                  : data.phase === "suspended"
                    ? "destructive"
                    : "secondary"
              }
            >
              {PHASE_LABEL[data.phase] ?? data.phase}
            </Badge>
          ) : null,
        ...options<BusinessRow>(Object.keys(PHASE_LABEL), PHASE_LABEL),
      },
      {
        field: "health",
        headerName: "Health",
        width: 120,
        cellRenderer: ({ data }: CustomCellRendererProps<BusinessRow>) =>
          data ? (
            <Badge
              variant={
                data.health === "healthy"
                  ? "default"
                  : data.health === "at_risk"
                    ? "destructive"
                    : data.health === "dormant"
                      ? "outline"
                      : "secondary"
              }
            >
              {healthLabel(data.health)}
            </Badge>
          ) : null,
        ...options<BusinessRow>(Object.keys(HEALTH_LABELS), HEALTH_LABELS),
      },
      {
        field: "mrr",
        headerName: "MRR",
        width: 110,
        filter: "number",
        valueFormatter: ({ value }) => (value ? rupees(value) : "—"),
      },
      {
        field: "owner",
        headerName: "Owner",
        minWidth: 200,
        flex: 1,
        valueFormatter: dash,
      },
      {
        field: "phone",
        headerName: "Phone",
        width: 150,
        valueFormatter: dash,
      },
      { field: "city", headerName: "City", width: 120 },
      {
        headerName: "Listings",
        width: 110,
        valueGetter: ({ data }) =>
          data
            ? getVertical(data.industry).planLimit === "menu_items"
              ? data.menuItems
              : data.liveCars
            : 0,
        filter: "number",
      },
      {
        field: "leads",
        headerName: "Leads",
        width: 100,
        filter: "number",
      },
      {
        field: "orders",
        headerName: "Orders",
        width: 100,
        filter: "number",
      },
      {
        headerName: "Sales",
        width: 130,
        valueGetter: ({ data }) =>
          data ? data.orderValue + data.bookingValue : 0,
        filter: "number",
        valueFormatter: ({ value }) => (value ? rupees(value) : "—"),
      },
      {
        field: "rating",
        headerName: "Rating",
        width: 110,
        filter: "number",
        valueFormatter: ({ value, data }) =>
          value ? `${value} (${data?.reviews})` : "—",
      },
      {
        field: "lastActivityAt",
        headerName: "Last active",
        width: 140,
        valueFormatter: day,
      },
      {
        field: "createdAt",
        headerName: "Joined",
        width: 140,
        valueFormatter: day,
      },
    ],
    []
  )
  return (
    <Shell<BusinessRow>
      rows={rows}
      columns={columns}
      tabs={tabsOf(
        ["active", "Paying"],
        ["trial", "Trial"],
        ["free", "Free"],
        ["grace", "Payment pending"],
        ["suspended", "Offline"]
      )}
      tabField="phase"
      search="Search businesses"
      none="No businesses match."
      open={open}
      rowTarget={(r) => r.id}
      exportKind="businesses"
    />
  )
}

// ---------- users ----------

export function UsersGrid({ rows }: { rows: UserRow[] }) {
  const open = useOpenBusiness()
  const columns = useMemo<ColDef<UserRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Name",
        minWidth: 180,
        flex: 1,
        valueFormatter: dash,
      },
      {
        field: "email",
        headerName: "Email",
        minWidth: 220,
        flex: 1.5,
        valueFormatter: dash,
      },
      {
        field: "phone",
        headerName: "Phone",
        width: 150,
        valueFormatter: dash,
      },
      {
        field: "business",
        headerName: "Business",
        minWidth: 200,
        flex: 1.5,
        valueFormatter: dash,
      },
      {
        field: "role",
        headerName: "Role",
        width: 150,
        cellRenderer: badge(),
        ...options<UserRow>(["owner", "staff", "no business"]),
      },
      {
        field: "verified",
        headerName: "Email verified",
        width: 150,
        valueFormatter: yesNo,
      },
    ],
    []
  )
  return (
    <Shell<UserRow>
      rows={rows}
      columns={columns}
      tabs={tabsOf(
        ["owner", "Owners"],
        ["staff", "Staff"],
        ["no business", "No business"]
      )}
      tabField="role"
      search="Search users"
      none="No users match."
      open={open}
      rowTarget={(r) => r.businessId}
      exportKind="users"
    />
  )
}

// ---------- cars ----------

export function CarsGrid({ rows, scoped, dealerId }: Common<CarListRow>) {
  const open = useOpenBusiness()
  const columns = useMemo<ColDef<CarListRow>[]>(
    () => [
      {
        field: "title",
        headerName: "Car",
        minWidth: 240,
        flex: 2,
        cellRenderer: bold,
      },
      {
        field: "business",
        headerName: "Dealer",
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "status",
        headerName: "Status",
        width: 140,
        cellRenderer: badge(),
        ...options<CarListRow>([
          "live",
          "draft",
          "on_hold",
          "sold",
          "archived",
        ]),
      },
      {
        field: "km",
        headerName: "Km",
        width: 120,
        filter: "number",
        valueFormatter: ({ value }) =>
          value == null ? "—" : value.toLocaleString("en-IN"),
      },
      {
        field: "fuel",
        headerName: "Fuel",
        width: 110,
        valueFormatter: dash,
      },
      {
        field: "price",
        headerName: "Asking",
        width: 140,
        filter: "number",
        valueFormatter: money,
      },
      {
        field: "soldPrice",
        headerName: "Sold for",
        width: 140,
        filter: "number",
        valueFormatter: money,
      },
      {
        field: "rcVerified",
        headerName: "RC verified",
        width: 140,
        valueFormatter: yesNo,
      },
      {
        field: "listedAt",
        headerName: "Listed",
        width: 140,
        valueFormatter: day,
      },
    ],
    []
  )
  return (
    <Shell<CarListRow>
      rows={rows}
      columns={columns}
      tabs={tabsOf(["live", "Live"], ["draft", "Drafts"], ["sold", "Sold"])}
      search="Search cars or dealers"
      none="No cars match."
      scoped={scoped}
      open={open}
      rowTarget={(r) => r.businessId}
      exportKind="cars"
      dealerId={dealerId}
    />
  )
}

// ---------- leads ----------

export function LeadsGrid({ rows, scoped, dealerId }: Common<LeadListRow>) {
  const open = useOpenBusiness()
  const columns = useMemo<ColDef<LeadListRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Buyer",
        minWidth: 180,
        flex: 1,
        cellRenderer: bold,
      },
      {
        field: "phone",
        headerName: "Phone",
        width: 130,
        valueFormatter: dash,
      },
      {
        field: "car",
        headerName: "Car",
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "business",
        headerName: "Dealer",
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "source",
        headerName: "Source",
        width: 140,
        valueFormatter: labelled,
        ...options<LeadListRow>(["test_drive", "enquiry", "hold"], {
          test_drive: "Test drive",
          enquiry: "Enquiry",
          hold: "Hold",
        }),
      },
      {
        field: "status",
        headerName: "Stage",
        width: 140,
        cellRenderer: badge(),
        ...options<LeadListRow>(["new", "contacted", "visited", "won", "lost"]),
      },
      {
        field: "createdAt",
        headerName: "Received",
        width: 170,
        valueFormatter: when,
      },
    ],
    []
  )
  return (
    <Shell<LeadListRow>
      rows={rows}
      columns={columns}
      tabs={tabsOf(
        ["new", "New"],
        ["contacted", "Contacted"],
        ["visited", "Visited"],
        ["won", "Won"],
        ["lost", "Lost"]
      )}
      search="Search leads"
      none="No leads match."
      scoped={scoped}
      open={open}
      rowTarget={(r) => r.businessId}
      exportKind="leads"
      dealerId={dealerId}
    />
  )
}

// ---------- orders ----------

export function OrdersGrid({ rows, scoped, dealerId }: Common<OrderListRow>) {
  const open = useOpenBusiness()
  const columns = useMemo<ColDef<OrderListRow>[]>(
    () => [
      {
        field: "code",
        headerName: "Order",
        width: 130,
        cellRenderer: bold,
      },
      {
        field: "customer",
        headerName: "Guest",
        minWidth: 170,
        flex: 1,
      },
      {
        field: "phone",
        headerName: "Phone",
        width: 130,
        valueFormatter: dash,
      },
      {
        field: "business",
        headerName: "Restaurant",
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "fulfilment",
        headerName: "Type",
        width: 130,
        valueFormatter: labelled,
        ...options<OrderListRow>(["delivery", "pickup", "dine_in"]),
      },
      {
        field: "total",
        headerName: "Total",
        width: 130,
        filter: "number",
        valueFormatter: money,
      },
      {
        field: "payment",
        headerName: "Method",
        width: 110,
        valueFormatter: ({ value }) =>
          value === "cod" ? "Cash" : label(String(value ?? "")),
      },
      {
        field: "paymentStatus",
        headerName: "Payment",
        width: 130,
        cellRenderer: badge(),
        ...options<OrderListRow>(["pending", "paid", "refunded"]),
      },
      {
        field: "status",
        headerName: "Status",
        width: 170,
        cellRenderer: badge(),
        ...options<OrderListRow>([
          "pending_payment",
          "new",
          "confirmed",
          "preparing",
          "ready",
          "out_for_delivery",
          "completed",
          "cancelled",
        ]),
      },
      {
        field: "createdAt",
        headerName: "Placed",
        width: 170,
        valueFormatter: when,
      },
    ],
    []
  )
  return (
    <Shell<OrderListRow>
      rows={rows}
      columns={columns}
      tabs={tabsOf(
        ["new", "New"],
        ["preparing", "Preparing"],
        ["out_for_delivery", "Out for delivery"],
        ["completed", "Completed"],
        ["cancelled", "Cancelled"]
      )}
      search="Search orders"
      none="No orders match."
      scoped={scoped}
      open={open}
      rowTarget={(r) => r.businessId}
      exportKind="orders"
      dealerId={dealerId}
    />
  )
}

// ---------- bookings ----------

export function BookingsGrid({
  rows,
  scoped,
  dealerId,
}: Common<BookingListRow>) {
  const open = useOpenBusiness()
  const columns = useMemo<ColDef<BookingListRow>[]>(
    () => [
      {
        field: "buyer",
        headerName: "Buyer",
        minWidth: 170,
        flex: 1,
        cellRenderer: bold,
      },
      {
        field: "phone",
        headerName: "Phone",
        width: 130,
        valueFormatter: dash,
      },
      {
        field: "car",
        headerName: "Car",
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "business",
        headerName: "Dealer",
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "amount",
        headerName: "Amount",
        width: 130,
        filter: "number",
        valueFormatter: money,
      },
      {
        field: "status",
        headerName: "Status",
        width: 140,
        cellRenderer: badge(),
        ...options<BookingListRow>([
          "created",
          "paid",
          "failed",
          "refunded",
          "cancelled",
          "refund_pending",
        ]),
      },
      {
        field: "refund",
        headerName: "Refund",
        width: 120,
        valueFormatter: dash,
      },
      {
        field: "attention",
        headerName: "Needs attention",
        minWidth: 240,
        flex: 1.5,
        valueFormatter: dash,
      },
      {
        field: "razorpayOrderId",
        headerName: "Razorpay order",
        minWidth: 190,
        flex: 1,
      },
      {
        field: "createdAt",
        headerName: "Created",
        width: 170,
        valueFormatter: when,
      },
      {
        field: "paidAt",
        headerName: "Paid",
        width: 170,
        valueFormatter: when,
      },
    ],
    []
  )
  return (
    <Shell<BookingListRow>
      rows={rows}
      columns={columns}
      tabs={tabsOf(
        ["paid", "Paid"],
        ["created", "Created"],
        ["refunded", "Refunded"],
        ["refund_pending", "Refund pending"],
        ["failed", "Failed"]
      )}
      search="Search bookings"
      none="No bookings match."
      scoped={scoped}
      open={open}
      rowTarget={(r) => r.businessId}
      exportKind="bookings"
      dealerId={dealerId}
    />
  )
}

// ---------- menu ----------

export function MenuGrid({ rows, scoped, dealerId }: Common<MenuRow>) {
  const open = useOpenBusiness()
  const columns = useMemo<ColDef<MenuRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Dish",
        minWidth: 220,
        flex: 2,
        cellRenderer: bold,
      },
      {
        field: "business",
        headerName: "Restaurant",
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "category",
        headerName: "Category",
        width: 160,
        valueFormatter: dash,
      },
      {
        field: "veg",
        headerName: "Type",
        width: 120,
        valueFormatter: ({ value }) => (value ? "Veg" : "Non-veg"),
      },
      {
        field: "price",
        headerName: "Price",
        width: 120,
        filter: "number",
        valueFormatter: money,
      },
      {
        field: "compareAt",
        headerName: "Was",
        width: 110,
        valueFormatter: money,
      },
      {
        field: "stock",
        headerName: "Stock",
        width: 100,
        valueFormatter: ({ value }) =>
          value == null ? "Not tracked" : String(value),
      },
      {
        field: "featured",
        headerName: "Bestseller",
        width: 130,
        valueFormatter: yesNo,
      },
      {
        field: "status",
        headerName: "Status",
        width: 130,
        valueFormatter: ({ value }) =>
          value === "available" ? "Available" : "Sold out",
        ...options<MenuRow>(["available", "sold_out"], {
          available: "Available",
          sold_out: "Sold out",
        }),
      },
      {
        field: "createdAt",
        headerName: "Added",
        width: 140,
        valueFormatter: day,
      },
    ],
    []
  )
  return (
    <Shell<MenuRow>
      rows={rows}
      columns={columns}
      tabs={tabsOf(["available", "Available"], ["sold_out", "Sold out"])}
      tabField="status"
      search="Search dishes"
      none="No dishes match."
      scoped={scoped}
      open={open}
      rowTarget={(r) => r.businessId}
      exportKind="menu"
      dealerId={dealerId}
    />
  )
}

// ---------- customers ----------

export function CustomersGrid({ rows, scoped, dealerId }: Common<CustomerRow>) {
  const open = useOpenBusiness()
  const columns = useMemo<ColDef<CustomerRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Guest",
        minWidth: 180,
        flex: 1,
        cellRenderer: bold,
      },
      {
        field: "phone",
        headerName: "Phone",
        width: 130,
      },
      {
        field: "business",
        headerName: "Restaurant",
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "segment",
        headerName: "Segment",
        width: 130,
        cellRenderer: badge(),
        ...options<CustomerRow>(["loyal", "repeat", "new", "one-time"]),
      },
      {
        field: "orders",
        headerName: "Orders",
        width: 110,
        filter: "number",
      },
      {
        field: "spent",
        headerName: "Spent",
        width: 130,
        filter: "number",
        valueFormatter: money,
      },
      {
        field: "avg",
        headerName: "Avg order",
        width: 130,
        filter: "number",
        valueFormatter: money,
      },
      {
        field: "firstOrderAt",
        headerName: "First order",
        width: 140,
        valueFormatter: day,
      },
      {
        field: "lastOrderAt",
        headerName: "Last order",
        width: 140,
        valueFormatter: day,
      },
    ],
    []
  )
  return (
    <Shell<CustomerRow>
      rows={rows}
      columns={columns}
      tabs={tabsOf(
        ["loyal", "Loyal"],
        ["repeat", "Repeat"],
        ["new", "New"],
        ["one-time", "One-time"]
      )}
      tabField="segment"
      search="Search guests"
      none="No guests match."
      scoped={scoped}
      open={open}
      rowTarget={(r) => r.businessId}
      exportKind="customers"
      dealerId={dealerId}
    />
  )
}

// ---------- reviews ----------

export function ReviewsGrid({ rows, scoped }: Common<ReviewRow>) {
  const open = useOpenBusiness()
  const columns = useMemo<ColDef<ReviewRow>[]>(
    () => [
      {
        field: "rating",
        headerName: "Rating",
        width: 110,
        filter: "number",
        valueFormatter: ({ value }) => `${value} ★`,
      },
      {
        field: "name",
        headerName: "Guest",
        width: 160,
        cellRenderer: bold,
      },
      {
        field: "comment",
        headerName: "Review",
        minWidth: 320,
        flex: 3,
        valueFormatter: dash,
      },
      {
        field: "business",
        headerName: "Restaurant",
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "status",
        headerName: "Status",
        width: 130,
        cellRenderer: badge(),
        ...options<ReviewRow>(["pending", "approved", "hidden"]),
      },
      {
        field: "createdAt",
        headerName: "Posted",
        width: 140,
        valueFormatter: day,
      },
    ],
    []
  )
  return (
    <Shell<ReviewRow>
      rows={rows}
      columns={columns}
      tabs={tabsOf(
        ["pending", "Pending"],
        ["approved", "Approved"],
        ["hidden", "Hidden"]
      )}
      search="Search reviews"
      none="No reviews match."
      scoped={scoped}
      open={open}
      rowTarget={(r) => r.businessId}
      exportKind="reviews"
    />
  )
}

// ---------- enquiries ----------

export function EnquiriesGrid({ rows, scoped }: Common<EnquiryRow>) {
  const open = useOpenBusiness()
  const columns = useMemo<ColDef<EnquiryRow>[]>(
    () => [
      {
        field: "name",
        headerName: "From",
        width: 170,
        cellRenderer: bold,
      },
      {
        field: "phone",
        headerName: "Phone",
        width: 130,
      },
      {
        field: "message",
        headerName: "Message",
        minWidth: 320,
        flex: 3,
      },
      {
        field: "business",
        headerName: "Restaurant",
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "status",
        headerName: "Status",
        width: 130,
        cellRenderer: badge(),
        ...options<EnquiryRow>(["new", "handled"]),
      },
      {
        field: "createdAt",
        headerName: "Received",
        width: 170,
        valueFormatter: when,
      },
    ],
    []
  )
  return (
    <Shell<EnquiryRow>
      rows={rows}
      columns={columns}
      tabs={tabsOf(["new", "New"], ["handled", "Handled"])}
      search="Search enquiries"
      none="No enquiries match."
      scoped={scoped}
      open={open}
      rowTarget={(r) => r.businessId}
      exportKind="enquiries"
    />
  )
}

// ---------- coupons ----------

export function CouponsGrid({ rows, scoped }: Common<CouponRow>) {
  const open = useOpenBusiness()
  const columns = useMemo<ColDef<CouponRow>[]>(
    () => [
      {
        field: "code",
        headerName: "Code",
        width: 150,
        cellRenderer: bold,
      },
      {
        field: "business",
        headerName: "Restaurant",
        minWidth: 200,
        flex: 1.5,
      },
      {
        headerName: "Offer",
        width: 160,
        valueGetter: ({ data }) =>
          data
            ? data.kind === "percent"
              ? `${data.value}% off${data.maxDiscount ? ` (max ₹${data.maxDiscount})` : ""}`
              : `₹${data.value} off`
            : "",
      },
      {
        field: "minOrder",
        headerName: "Min order",
        width: 130,
        valueFormatter: money,
      },
      {
        field: "used",
        headerName: "Used",
        width: 100,
        filter: "number",
      },
      {
        field: "status",
        headerName: "Status",
        width: 130,
        cellRenderer: badge(),
        ...options<CouponRow>(["active", "inactive", "expired"]),
      },
      {
        field: "expiresAt",
        headerName: "Expires",
        width: 140,
        valueFormatter: day,
      },
      {
        field: "createdAt",
        headerName: "Created",
        width: 140,
        valueFormatter: day,
      },
    ],
    []
  )
  return (
    <Shell<CouponRow>
      rows={rows}
      columns={columns}
      tabs={tabsOf(
        ["active", "Active"],
        ["inactive", "Inactive"],
        ["expired", "Expired"]
      )}
      search="Search coupons"
      none="No coupons match."
      scoped={scoped}
      open={open}
      rowTarget={(r) => r.businessId}
      exportKind="coupons"
    />
  )
}

// ---------- delivery ----------

export function PartnersGrid({ rows, scoped }: Common<PartnerRow>) {
  const open = useOpenBusiness()
  const columns = useMemo<ColDef<PartnerRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Rider",
        minWidth: 170,
        flex: 1,
        cellRenderer: bold,
      },
      { field: "code", headerName: "Code", width: 110 },
      {
        field: "phone",
        headerName: "Phone",
        width: 130,
      },
      {
        field: "vehicle",
        headerName: "Vehicle",
        width: 150,
        valueFormatter: dash,
      },
      {
        field: "business",
        headerName: "Restaurant",
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "deliveries",
        headerName: "Delivered",
        width: 130,
        filter: "number",
      },
      {
        field: "status",
        headerName: "Status",
        width: 120,
        cellRenderer: badge(),
        ...options<PartnerRow>(["active", "inactive"]),
      },
      {
        field: "createdAt",
        headerName: "Added",
        width: 140,
        valueFormatter: day,
      },
    ],
    []
  )
  return (
    <Shell<PartnerRow>
      rows={rows}
      columns={columns}
      tabs={tabsOf(["active", "Active"], ["inactive", "Inactive"])}
      search="Search riders"
      none="No riders match."
      scoped={scoped}
      open={open}
      rowTarget={(r) => r.businessId}
      exportKind="partners"
    />
  )
}

export function ZonesGrid({ rows, scoped }: Common<ZoneRow>) {
  const open = useOpenBusiness()
  const columns = useMemo<ColDef<ZoneRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Zone",
        minWidth: 170,
        flex: 1,
        cellRenderer: bold,
      },
      {
        field: "business",
        headerName: "Restaurant",
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "pincodes",
        headerName: "Pincodes",
        minWidth: 220,
        flex: 2,
        valueFormatter: dash,
      },
      {
        field: "fee",
        headerName: "Fee",
        width: 110,
        valueFormatter: money,
      },
      {
        field: "minOrder",
        headerName: "Min order",
        width: 130,
        valueFormatter: money,
      },
      {
        field: "eta",
        headerName: "ETA",
        width: 110,
        valueFormatter: ({ value }) => (value ? `${value} min` : "—"),
      },
      {
        field: "status",
        headerName: "Status",
        width: 120,
        cellRenderer: badge(),
        ...options<ZoneRow>(["active", "inactive"]),
      },
    ],
    []
  )
  return (
    <Shell<ZoneRow>
      rows={rows}
      columns={columns}
      tabs={tabsOf(["active", "Active"], ["inactive", "Inactive"])}
      search="Search zones"
      none="No zones match."
      scoped={scoped}
      open={open}
      rowTarget={(r) => r.businessId}
    />
  )
}

export type { BannerRow }
