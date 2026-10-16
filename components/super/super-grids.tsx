"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import type { ColDef } from "ag-grid-community"
import type { CustomCellRendererProps } from "ag-grid-react"
import {
  Building03Icon,
  Calendar03Icon,
  Call02Icon,
  Car01Icon,
  CheckmarkBadge01Icon,
  Clock01Icon,
  Download01Icon,
  Mail01Icon,
  Money03Icon,
  StarIcon,
  Tag01Icon,
  User02Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { optionsFilter } from "@/components/cars/cars-grid"
import { DataGrid, type GridTab } from "@/components/restaurant/data-grid"
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

const ICONS = {
  name: Building03Icon,
  plan: Tag01Icon,
  status: CheckmarkBadge01Icon,
  money: Money03Icon,
  wallet: Wallet01Icon,
  date: Calendar03Icon,
  time: Clock01Icon,
  person: User02Icon,
  phone: Call02Icon,
  mail: Mail01Icon,
  car: Car01Icon,
  star: StarIcon,
}
const h = (k: keyof typeof ICONS) => `hdr-icon hdr-${k}`

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
  rowHeight = 52,
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
  rowHeight?: number
  scoped?: boolean
  open: (id: string) => unknown
  rowTarget: (r: T) => string
  exportKind?: string
  dealerId?: string
}) {
  return (
    <DataGrid<T>
      rows={rows}
      columns={columns}
      icons={ICONS}
      tabs={tabs}
      tabField={tabField}
      searchPlaceholder={search}
      noMatches={none}
      rowHeight={rowHeight}
      hideColumns={scoped ? ["business"] : undefined}
      onRowClick={scoped ? undefined : (r) => open(rowTarget(r))}
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
        headerClass: h("name"),
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
        headerClass: h("name"),
        width: 130,
        valueFormatter: labelled,
        ...options<BusinessRow>(["motors", "restaurants"]),
      },
      {
        field: "planLabel",
        headerName: "Plan",
        headerClass: h("plan"),
        width: 120,
      },
      {
        field: "phase",
        headerName: "Billing",
        headerClass: h("status"),
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
        headerClass: h("status"),
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
        headerClass: h("wallet"),
        width: 110,
        filter: "agNumberColumnFilter",
        valueFormatter: ({ value }) => (value ? rupees(value) : "—"),
      },
      {
        field: "owner",
        headerName: "Owner",
        headerClass: h("mail"),
        minWidth: 200,
        flex: 1,
        valueFormatter: dash,
      },
      {
        field: "phone",
        headerName: "Phone",
        headerClass: h("phone"),
        width: 150,
        valueFormatter: dash,
      },
      { field: "city", headerName: "City", headerClass: h("name"), width: 120 },
      {
        headerName: "Listings",
        headerClass: h("car"),
        width: 110,
        valueGetter: ({ data }) =>
          data
            ? data.industry === "restaurants"
              ? data.menuItems
              : data.liveCars
            : 0,
        filter: "agNumberColumnFilter",
      },
      {
        field: "leads",
        headerName: "Leads",
        headerClass: h("person"),
        width: 100,
        filter: "agNumberColumnFilter",
      },
      {
        field: "orders",
        headerName: "Orders",
        headerClass: h("money"),
        width: 100,
        filter: "agNumberColumnFilter",
      },
      {
        headerName: "Sales",
        headerClass: h("money"),
        width: 130,
        valueGetter: ({ data }) =>
          data ? data.orderValue + data.bookingValue : 0,
        filter: "agNumberColumnFilter",
        valueFormatter: ({ value }) => (value ? rupees(value) : "—"),
      },
      {
        field: "rating",
        headerName: "Rating",
        headerClass: h("star"),
        width: 110,
        filter: "agNumberColumnFilter",
        valueFormatter: ({ value, data }) =>
          value ? `${value} (${data?.reviews})` : "—",
      },
      {
        field: "lastActivityAt",
        headerName: "Last active",
        headerClass: h("time"),
        width: 140,
        valueFormatter: day,
      },
      {
        field: "createdAt",
        headerName: "Joined",
        headerClass: h("date"),
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
      rowHeight={60}
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
        headerClass: h("person"),
        minWidth: 180,
        flex: 1,
        valueFormatter: dash,
      },
      {
        field: "email",
        headerName: "Email",
        headerClass: h("mail"),
        minWidth: 220,
        flex: 1.5,
        valueFormatter: dash,
      },
      {
        field: "phone",
        headerName: "Phone",
        headerClass: h("phone"),
        width: 150,
        valueFormatter: dash,
      },
      {
        field: "business",
        headerName: "Business",
        headerClass: h("name"),
        minWidth: 200,
        flex: 1.5,
        valueFormatter: dash,
      },
      {
        field: "role",
        headerName: "Role",
        headerClass: h("status"),
        width: 150,
        cellRenderer: badge(),
        ...options<UserRow>(["owner", "staff", "no business"]),
      },
      {
        field: "verified",
        headerName: "Email verified",
        headerClass: h("status"),
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
        headerClass: h("car"),
        minWidth: 240,
        flex: 2,
        cellRenderer: bold,
      },
      {
        field: "business",
        headerName: "Dealer",
        headerClass: h("name"),
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "status",
        headerName: "Status",
        headerClass: h("status"),
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
        headerClass: h("time"),
        width: 120,
        filter: "agNumberColumnFilter",
        valueFormatter: ({ value }) =>
          value == null ? "—" : value.toLocaleString("en-IN"),
      },
      {
        field: "fuel",
        headerName: "Fuel",
        headerClass: h("plan"),
        width: 110,
        valueFormatter: dash,
      },
      {
        field: "price",
        headerName: "Asking",
        headerClass: h("money"),
        width: 140,
        filter: "agNumberColumnFilter",
        valueFormatter: money,
      },
      {
        field: "soldPrice",
        headerName: "Sold for",
        headerClass: h("money"),
        width: 140,
        filter: "agNumberColumnFilter",
        valueFormatter: money,
      },
      {
        field: "rcVerified",
        headerName: "RC verified",
        headerClass: h("status"),
        width: 140,
        valueFormatter: yesNo,
      },
      {
        field: "listedAt",
        headerName: "Listed",
        headerClass: h("date"),
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
      rowHeight={56}
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
        headerClass: h("person"),
        minWidth: 180,
        flex: 1,
        cellRenderer: bold,
      },
      {
        field: "phone",
        headerName: "Phone",
        headerClass: h("phone"),
        width: 130,
        valueFormatter: dash,
      },
      {
        field: "car",
        headerName: "Car",
        headerClass: h("car"),
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "business",
        headerName: "Dealer",
        headerClass: h("name"),
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "source",
        headerName: "Source",
        headerClass: h("plan"),
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
        headerClass: h("status"),
        width: 140,
        cellRenderer: badge(),
        ...options<LeadListRow>(["new", "contacted", "visited", "won", "lost"]),
      },
      {
        field: "createdAt",
        headerName: "Received",
        headerClass: h("time"),
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
        headerClass: h("plan"),
        width: 130,
        cellRenderer: bold,
      },
      {
        field: "customer",
        headerName: "Guest",
        headerClass: h("person"),
        minWidth: 170,
        flex: 1,
      },
      {
        field: "phone",
        headerName: "Phone",
        headerClass: h("phone"),
        width: 130,
        valueFormatter: dash,
      },
      {
        field: "business",
        headerName: "Restaurant",
        headerClass: h("name"),
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "fulfilment",
        headerName: "Type",
        headerClass: h("plan"),
        width: 130,
        valueFormatter: labelled,
        ...options<OrderListRow>(["delivery", "pickup", "dine_in"]),
      },
      {
        field: "total",
        headerName: "Total",
        headerClass: h("money"),
        width: 130,
        filter: "agNumberColumnFilter",
        valueFormatter: money,
      },
      {
        field: "payment",
        headerName: "Method",
        headerClass: h("wallet"),
        width: 110,
        valueFormatter: ({ value }) =>
          value === "cod" ? "Cash" : label(String(value ?? "")),
      },
      {
        field: "paymentStatus",
        headerName: "Payment",
        headerClass: h("wallet"),
        width: 130,
        cellRenderer: badge(),
        ...options<OrderListRow>(["pending", "paid", "refunded"]),
      },
      {
        field: "status",
        headerName: "Status",
        headerClass: h("status"),
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
        headerClass: h("time"),
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
        headerClass: h("person"),
        minWidth: 170,
        flex: 1,
        cellRenderer: bold,
      },
      {
        field: "phone",
        headerName: "Phone",
        headerClass: h("phone"),
        width: 130,
        valueFormatter: dash,
      },
      {
        field: "car",
        headerName: "Car",
        headerClass: h("car"),
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "business",
        headerName: "Dealer",
        headerClass: h("name"),
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "amount",
        headerName: "Amount",
        headerClass: h("money"),
        width: 130,
        filter: "agNumberColumnFilter",
        valueFormatter: money,
      },
      {
        field: "status",
        headerName: "Status",
        headerClass: h("status"),
        width: 140,
        cellRenderer: badge(),
        ...options<BookingListRow>([
          "created",
          "paid",
          "failed",
          "refunded",
          "cancelled",
        ]),
      },
      {
        field: "razorpayOrderId",
        headerName: "Razorpay order",
        headerClass: h("plan"),
        minWidth: 190,
        flex: 1,
      },
      {
        field: "createdAt",
        headerName: "Created",
        headerClass: h("time"),
        width: 170,
        valueFormatter: when,
      },
      {
        field: "paidAt",
        headerName: "Paid",
        headerClass: h("time"),
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
        headerClass: h("car"),
        minWidth: 220,
        flex: 2,
        cellRenderer: bold,
      },
      {
        field: "business",
        headerName: "Restaurant",
        headerClass: h("name"),
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "category",
        headerName: "Category",
        headerClass: h("plan"),
        width: 160,
        valueFormatter: dash,
      },
      {
        field: "veg",
        headerName: "Type",
        headerClass: h("plan"),
        width: 120,
        valueFormatter: ({ value }) => (value ? "Veg" : "Non-veg"),
      },
      {
        field: "price",
        headerName: "Price",
        headerClass: h("money"),
        width: 120,
        filter: "agNumberColumnFilter",
        valueFormatter: money,
      },
      {
        field: "compareAt",
        headerName: "Was",
        headerClass: h("money"),
        width: 110,
        valueFormatter: money,
      },
      {
        field: "stock",
        headerName: "Stock",
        headerClass: h("plan"),
        width: 100,
        valueFormatter: ({ value }) =>
          value == null ? "Not tracked" : String(value),
      },
      {
        field: "featured",
        headerName: "Bestseller",
        headerClass: h("star"),
        width: 130,
        valueFormatter: yesNo,
      },
      {
        field: "status",
        headerName: "Status",
        headerClass: h("status"),
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
        headerClass: h("date"),
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
        headerClass: h("person"),
        minWidth: 180,
        flex: 1,
        cellRenderer: bold,
      },
      {
        field: "phone",
        headerName: "Phone",
        headerClass: h("phone"),
        width: 130,
      },
      {
        field: "business",
        headerName: "Restaurant",
        headerClass: h("name"),
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "segment",
        headerName: "Segment",
        headerClass: h("status"),
        width: 130,
        cellRenderer: badge(),
        ...options<CustomerRow>(["loyal", "repeat", "new", "one-time"]),
      },
      {
        field: "orders",
        headerName: "Orders",
        headerClass: h("money"),
        width: 110,
        filter: "agNumberColumnFilter",
      },
      {
        field: "spent",
        headerName: "Spent",
        headerClass: h("money"),
        width: 130,
        filter: "agNumberColumnFilter",
        valueFormatter: money,
      },
      {
        field: "avg",
        headerName: "Avg order",
        headerClass: h("money"),
        width: 130,
        filter: "agNumberColumnFilter",
        valueFormatter: money,
      },
      {
        field: "firstOrderAt",
        headerName: "First order",
        headerClass: h("date"),
        width: 140,
        valueFormatter: day,
      },
      {
        field: "lastOrderAt",
        headerName: "Last order",
        headerClass: h("time"),
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
        headerClass: h("star"),
        width: 110,
        filter: "agNumberColumnFilter",
        valueFormatter: ({ value }) => `${value} ★`,
      },
      {
        field: "name",
        headerName: "Guest",
        headerClass: h("person"),
        width: 160,
        cellRenderer: bold,
      },
      {
        field: "comment",
        headerName: "Review",
        headerClass: h("mail"),
        minWidth: 320,
        flex: 3,
        valueFormatter: dash,
      },
      {
        field: "business",
        headerName: "Restaurant",
        headerClass: h("name"),
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "status",
        headerName: "Status",
        headerClass: h("status"),
        width: 130,
        cellRenderer: badge(),
        ...options<ReviewRow>(["pending", "approved", "hidden"]),
      },
      {
        field: "createdAt",
        headerName: "Posted",
        headerClass: h("time"),
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
        headerClass: h("person"),
        width: 170,
        cellRenderer: bold,
      },
      {
        field: "phone",
        headerName: "Phone",
        headerClass: h("phone"),
        width: 130,
      },
      {
        field: "message",
        headerName: "Message",
        headerClass: h("mail"),
        minWidth: 320,
        flex: 3,
      },
      {
        field: "business",
        headerName: "Restaurant",
        headerClass: h("name"),
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "status",
        headerName: "Status",
        headerClass: h("status"),
        width: 130,
        cellRenderer: badge(),
        ...options<EnquiryRow>(["new", "handled"]),
      },
      {
        field: "createdAt",
        headerName: "Received",
        headerClass: h("time"),
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
        headerClass: h("plan"),
        width: 150,
        cellRenderer: bold,
      },
      {
        field: "business",
        headerName: "Restaurant",
        headerClass: h("name"),
        minWidth: 200,
        flex: 1.5,
      },
      {
        headerName: "Offer",
        headerClass: h("money"),
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
        headerClass: h("money"),
        width: 130,
        valueFormatter: money,
      },
      {
        field: "used",
        headerName: "Used",
        headerClass: h("plan"),
        width: 100,
        filter: "agNumberColumnFilter",
      },
      {
        field: "status",
        headerName: "Status",
        headerClass: h("status"),
        width: 130,
        cellRenderer: badge(),
        ...options<CouponRow>(["active", "inactive", "expired"]),
      },
      {
        field: "expiresAt",
        headerName: "Expires",
        headerClass: h("date"),
        width: 140,
        valueFormatter: day,
      },
      {
        field: "createdAt",
        headerName: "Created",
        headerClass: h("date"),
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
        headerClass: h("person"),
        minWidth: 170,
        flex: 1,
        cellRenderer: bold,
      },
      { field: "code", headerName: "Code", headerClass: h("plan"), width: 110 },
      {
        field: "phone",
        headerName: "Phone",
        headerClass: h("phone"),
        width: 130,
      },
      {
        field: "vehicle",
        headerName: "Vehicle",
        headerClass: h("car"),
        width: 150,
        valueFormatter: dash,
      },
      {
        field: "business",
        headerName: "Restaurant",
        headerClass: h("name"),
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "deliveries",
        headerName: "Delivered",
        headerClass: h("money"),
        width: 130,
        filter: "agNumberColumnFilter",
      },
      {
        field: "status",
        headerName: "Status",
        headerClass: h("status"),
        width: 120,
        cellRenderer: badge(),
        ...options<PartnerRow>(["active", "inactive"]),
      },
      {
        field: "createdAt",
        headerName: "Added",
        headerClass: h("date"),
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
        headerClass: h("name"),
        minWidth: 170,
        flex: 1,
        cellRenderer: bold,
      },
      {
        field: "business",
        headerName: "Restaurant",
        headerClass: h("name"),
        minWidth: 200,
        flex: 1.5,
      },
      {
        field: "pincodes",
        headerName: "Pincodes",
        headerClass: h("plan"),
        minWidth: 220,
        flex: 2,
        valueFormatter: dash,
      },
      {
        field: "fee",
        headerName: "Fee",
        headerClass: h("money"),
        width: 110,
        valueFormatter: money,
      },
      {
        field: "minOrder",
        headerName: "Min order",
        headerClass: h("money"),
        width: 130,
        valueFormatter: money,
      },
      {
        field: "eta",
        headerName: "ETA",
        headerClass: h("time"),
        width: 110,
        valueFormatter: ({ value }) => (value ? `${value} min` : "—"),
      },
      {
        field: "status",
        headerName: "Status",
        headerClass: h("status"),
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
