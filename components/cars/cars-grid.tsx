"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type {
  ColDef,
  FilterChangedEvent,
  RowClickedEvent,
  ValueFormatterParams,
} from "ag-grid-community"
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community"
import {
  AgGridReact,
  useGridFilter,
  type CustomCellRendererProps,
  type CustomFilterProps,
} from "ag-grid-react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  Calendar03Icon,
  Car01Icon,
  CheckmarkBadge01Icon,
  Clock01Icon,
  DashboardSpeed01Icon,
  Delete02Icon,
  FuelStationIcon,
  MoreHorizontalIcon,
  Money03Icon,
  Search01Icon,
  Settings02Icon,
  ShieldCheckIcon,
  User02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { toast } from "@/lib/toast"

import {
  archiveCarAction,
  deleteCarAction,
} from "@/app/(admin)/(shell)/cars/actions"
import { CarEditSheet } from "@/components/cars/car-edit-sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ScoreBand } from "@/lib/cars/score"
import { copy } from "@/lib/copy"
import { cn } from "@/lib/utils"

ModuleRegistry.registerModules([AllCommunityModule])

const t = copy.admin.cars

export type CarRow = {
  id: string
  href: string
  draft: boolean
  image: string | null
  title: string
  reg: string
  year: number | null
  fuel: string | null
  transmission: string | null
  km: number | null
  owners: number | null
  price: number | null
  status: keyof typeof t.status
  listedAt: string | null
  colour: string | null
  insuranceValidTill: string | null
  soldPrice: number | null
  score: number | null
  scoreBand: ScoreBand | null
}

const TABS = ["all", "live", "draft", "on_hold", "sold"] as const
type Tab = (typeof TABS)[number]

// Grid colours come from the shadcn tokens, so light/dark follow the app theme.
export const gridTheme = themeQuartz.withParams({
  backgroundColor: "var(--background)",
  foregroundColor: "var(--foreground)",
  borderColor: "var(--border)",
  headerBackgroundColor: "var(--muted)",
  headerTextColor: "var(--foreground)",
  rowHoverColor: "color-mix(in oklab, var(--muted) 60%, transparent)",
  accentColor: "var(--primary)",
  fontFamily: "inherit",
  rowBorder: false,
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  headerRowBorder: false,
  spacing: 8,
})

// Header icons are hugeicons rendered to SVG data URIs; globals.css masks them in front of each header label.
const HEADER_ICONS = {
  car: Car01Icon,
  year: Calendar03Icon,
  status: CheckmarkBadge01Icon,
  fuel: FuelStationIcon,
  gearbox: Settings02Icon,
  km: DashboardSpeed01Icon,
  owners: User02Icon,
  price: Money03Icon,
  score: ShieldCheckIcon,
  listed: Clock01Icon,
}
const headerIconCss = Object.entries(HEADER_ICONS)
  .map(([k, icon]) => {
    const svg = renderToStaticMarkup(
      <HugeiconsIcon icon={icon} size={16} color="black" />
    )
    return `.ag-header-cell.hdr-${k}{--hdr-icon:url("data:image/svg+xml,${encodeURIComponent(svg)}")}`
  })
  .join("")

const inr = new Intl.NumberFormat("en-IN")
const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

function CarCell({ data }: CustomCellRendererProps<CarRow>) {
  if (!data) return null
  return (
    <div className="flex items-center gap-3">
      {data.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.image}
          alt=""
          className="size-14 shrink-0 rounded-lg bg-muted object-cover"
        />
      ) : (
        <div className="size-14 shrink-0 rounded-lg bg-muted" />
      )}
      <div className="flex min-w-0 flex-col items-start gap-1 leading-tight">
        <span className="max-w-full truncate font-medium">{data.title}</span>
        {data.reg && (
          <span className="rounded-md border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {data.reg}
          </span>
        )}
      </div>
    </div>
  )
}

function StatusCell({ data }: CustomCellRendererProps<CarRow>) {
  if (!data) return null
  const variant =
    data.status === "live"
      ? "default"
      : data.status === "sold"
        ? "outline"
        : "secondary"
  return <Badge variant={variant}>{t.status[data.status]}</Badge>
}

function PriceCell({ data }: CustomCellRendererProps<CarRow>) {
  if (!data) return null
  return data.price ? (
    <span className="font-medium">₹{inr.format(data.price)}</span>
  ) : (
    <span className="text-muted-foreground">{t.priceOnRequest}</span>
  )
}

const SCORE_CLASS: Record<ScoreBand, string> = {
  excellent: "text-success",
  good: "text-success",
  fair: "text-primary",
  caution: "text-destructive",
}

function ScoreCell({ data }: CustomCellRendererProps<CarRow>) {
  if (!data || data.score == null || !data.scoreBand)
    return <span className="text-muted-foreground">—</span>
  return (
    <span
      className={cn("font-semibold tabular-nums", SCORE_CLASS[data.scoreBand])}
    >
      {data.score}
      <span className="text-xs font-normal text-muted-foreground"> / 100</span>
    </span>
  )
}

type GridContext = { onDelete: (row: CarRow) => void }

function ActionsCell({
  data,
  context,
}: CustomCellRendererProps<CarRow, unknown, GridContext>) {
  if (!data) return null
  // Drafts continue in the wizard (a link); other cars open the edit panel via the row click.
  return (
    <div className="flex items-center justify-end gap-1">
      {data.draft ? (
        <Link href={data.href} className={cn(buttonVariants({ size: "sm" }))}>
          {t.continueDraft}
        </Link>
      ) : (
        <Button variant="outline" size="sm" tabIndex={-1}>
          {t.edit.action}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${t.delete.more}: ${data.title}`}
              data-row-action
              data-testid={`car-more-${data.id}`}
            />
          }
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onClick={() => context.onDelete(data)}
            data-testid={`car-delete-${data.id}`}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            {t.delete.menu}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export type OptionsModel = { values: string[] }
type OptionsParams = {
  options?: readonly string[]
  labels?: Record<string, string>
  sort?: (a: string, b: string) => number
}

// Column filter that lists the column's own values as checkboxes (community stand-in for the Enterprise set filter).
function OptionsFilter({
  model,
  onModelChange,
  getValue,
  api,
  options: allOptions = [],
  labels,
  sort,
}: CustomFilterProps<CarRow, unknown, OptionsModel> & OptionsParams) {
  const selected = model?.values ?? []
  const options = useMemo(() => {
    // Full list for the column first, then anything in the data that isn't on it.
    const seen = new Set<string>(allOptions)
    api.forEachNode((node) => {
      const v = getValue(node)
      if (v != null && v !== "") seen.add(String(v))
    })
    return sort ? [...seen].sort(sort) : [...seen]
  }, [api, getValue, allOptions, sort])

  useGridFilter({
    doesFilterPass: ({ node }) =>
      selected.length === 0 || selected.includes(String(getValue(node) ?? "")),
  })

  const toggle = (value: string, on: boolean) => {
    const next = on ? [...selected, value] : selected.filter((v) => v !== value)
    onModelChange(next.length ? { values: next } : null)
  }

  // Native AG Grid filter markup/classes so this popup matches the built-in filters; only the options differ.
  return (
    <div className="ag-filter-wrapper">
      <div
        className="ag-simple-filter-body-wrapper"
        style={{ minWidth: 200, maxHeight: 300, overflowY: "auto" }}
      >
        {options.map((value) => (
          <label
            key={value}
            className="ag-labeled ag-label-align-right ag-checkbox ag-input-field"
            style={{ cursor: "pointer" }}
          >
            <span className="ag-input-field-label ag-label ag-checkbox-label capitalize">
              {labels?.[value] ?? value}
            </span>
            <span className="ag-wrapper ag-input-wrapper ag-checkbox-input-wrapper">
              <input
                type="checkbox"
                className="ag-input-field-input ag-checkbox-input"
                checked={selected.includes(value)}
                onChange={(e) => toggle(value, e.target.checked)}
              />
            </span>
          </label>
        ))}
        {options.length === 0 && (
          <span className="ag-filter-no-matches">{t.grid.noOptions}</span>
        )}
      </div>
      <div className="ag-filter-apply-panel">
        <button
          type="button"
          className="ag-button ag-standard-button ag-filter-apply-panel-button"
          disabled={selected.length === 0}
          onClick={() => onModelChange(null)}
        >
          {t.grid.clear}
        </button>
      </div>
    </div>
  )
}

export const optionsFilter = (params: OptionsParams = {}) => ({
  filter: OptionsFilter,
  filterParams: params,
  floatingFilter: false,
})
export const numeric = (a: string, b: string) => Number(a) - Number(b)
export const dayStart = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

const STATUS_OPTIONS = Object.keys(t.status)
const FUEL_OPTIONS = ["Petrol", "Diesel", "CNG", "LPG", "Electric", "Hybrid"]
const GEARBOX_OPTIONS = ["Manual", "Automatic"]
const OWNER_OPTIONS = ["1", "2", "3", "4", "5"]
const OWNER_LABELS = Object.fromEntries(
  [1, 2, 3, 4, 5].map((n) => [String(n), copy.tenant.car.owners(n)])
)

const PAGE_SIZES = [10, 20, 50]

export function CarsGrid({ rows }: { rows: CarRow[] }) {
  const gridRef = useRef<AgGridReact<CarRow>>(null)
  const [tab, setTab] = useState<Tab>("all")
  const [search, setSearch] = useState("")
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = rows.find((r) => r.id === editingId) ?? null

  // Delete lives out here, not in the cell: the grid recycles cells, and the dialog must outlive them.
  const [deleting, setDeleting] = useState<CarRow | null>(null)
  const [busy, setBusy] = useState<"delete" | "archive" | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [keptForHistory, setKeptForHistory] = useState(false)
  const gridContext = useMemo<GridContext>(
    () => ({
      onDelete: (row) => {
        setDeleteError(null)
        setKeptForHistory(false)
        setDeleting(row)
      },
    }),
    []
  )

  async function confirmDelete() {
    if (!deleting) return
    setBusy("delete")
    setDeleteError(null)
    try {
      const res = await deleteCarAction(deleting.id)
      if (res.ok) {
        toast.success(t.delete.done)
        setDeleting(null)
        router.refresh()
      } else if (res.error === "has_history") {
        setKeptForHistory(true)
      } else {
        setDeleteError(
          res.error === "rate_limited" ? t.delete.rateLimited : t.delete.failed
        )
      }
    } catch {
      setDeleteError(t.delete.failed)
    } finally {
      setBusy(null)
    }
  }

  async function archiveInstead() {
    if (!deleting) return
    setBusy("archive")
    setDeleteError(null)
    try {
      const res = await archiveCarAction(deleting.id)
      if (res.ok) {
        toast.success(t.delete.archived)
        setDeleting(null)
        router.refresh()
      } else setDeleteError(t.delete.failed)
    } catch {
      setDeleteError(t.delete.failed)
    } finally {
      setBusy(null)
    }
  }

  // Drafts continue in the wizard; every other car opens the edit panel.
  const onRowClicked = useCallback(
    (e: RowClickedEvent<CarRow>) => {
      if (
        !e.data ||
        (e.event?.target as HTMLElement | null)?.closest("a, [data-row-action]")
      )
        return
      if (e.data.draft) router.push(e.data.href)
      else setEditingId(e.data.id)
    },
    [router]
  )

  const counts = useMemo(() => {
    const c: Record<Tab, number> = {
      all: rows.length,
      live: 0,
      draft: 0,
      on_hold: 0,
      sold: 0,
    }
    for (const r of rows) if (r.status in c) c[r.status as Tab]++
    return c
  }, [rows])

  const colDefs = useMemo<ColDef<CarRow>[]>(
    () => [
      {
        field: "title",
        headerClass: "hdr-icon hdr-car",
        headerName: t.grid.car,
        cellRenderer: CarCell,
        minWidth: 280,
        flex: 2,
      },
      {
        field: "year",
        headerClass: "hdr-icon hdr-year",
        headerName: t.grid.year,
        width: 120,
        filter: "agNumberColumnFilter",
        valueFormatter: (p: ValueFormatterParams) => p.value ?? "—",
      },
      {
        field: "status",
        headerClass: "hdr-icon hdr-status",
        headerName: t.grid.status,
        cellRenderer: StatusCell,
        width: 120,
        ...optionsFilter({ options: STATUS_OPTIONS, labels: t.status }),
      },
      {
        field: "fuel",
        headerClass: "hdr-icon hdr-fuel",
        headerName: t.grid.fuel,
        width: 120,
        ...optionsFilter({ options: FUEL_OPTIONS }),
        valueFormatter: (p: ValueFormatterParams) => p.value || "—",
        cellClass: "capitalize",
      },
      {
        field: "transmission",
        headerClass: "hdr-icon hdr-gearbox",
        headerName: t.grid.gearbox,
        width: 130,
        ...optionsFilter({ options: GEARBOX_OPTIONS }),
        valueFormatter: (p: ValueFormatterParams) => p.value || "—",
        cellClass: "capitalize",
      },
      {
        field: "km",
        headerClass: "hdr-icon hdr-km",
        headerName: t.grid.km,
        width: 130,

        filter: "agNumberColumnFilter",
        valueFormatter: (p: ValueFormatterParams) =>
          p.value == null ? "—" : `${inr.format(p.value)} km`,
      },
      {
        field: "owners",
        headerClass: "hdr-icon hdr-owners",
        headerName: t.grid.owners,
        width: 130,
        ...optionsFilter({
          options: OWNER_OPTIONS,
          sort: numeric,
          labels: OWNER_LABELS,
        }),
        valueFormatter: (p: ValueFormatterParams) => p.value ?? "—",
      },
      {
        field: "price",
        headerClass: "hdr-icon hdr-price",
        headerName: t.grid.price,
        width: 150,
        filter: "agNumberColumnFilter",
        cellRenderer: PriceCell,
      },
      {
        field: "score",
        headerClass: "hdr-icon hdr-score",
        headerName: t.grid.score,
        width: 140,
        filter: "agNumberColumnFilter",
        cellRenderer: ScoreCell,
        comparator: (a: number | null, b: number | null) =>
          (a ?? -1) - (b ?? -1),
      },
      {
        field: "listedAt",
        headerClass: "hdr-icon hdr-listed",
        filter: "agDateColumnFilter",
        filterValueGetter: ({ data }) =>
          data?.listedAt ? new Date(data.listedAt) : null,
        filterParams: {
          comparator: (filterDate: Date, cellValue: Date | null) =>
            cellValue
              ? Math.sign(dayStart(cellValue) - dayStart(filterDate))
              : -1,
        },
        headerName: t.grid.listed,
        width: 170,
        valueFormatter: (p: ValueFormatterParams) =>
          p.value ? dateFmt.format(new Date(p.value)) : "—",
      },
      {
        colId: "actions",
        headerName: "",
        cellRenderer: ActionsCell,
        width: 170,
        sortable: false,
        filter: false,
        pinned: "right",
      },
    ],
    []
  )

  const defaultColDef = useMemo<ColDef>(
    () => ({ resizable: false, filter: false }),
    []
  )

  // Keep the tabs in step with the Status header filter.
  const onFilterChanged = useCallback((e: FilterChangedEvent<CarRow>) => {
    const values = (e.api.getFilterModel().status as OptionsModel | undefined)
      ?.values
    setTab(
      values?.length === 1 && (TABS as readonly string[]).includes(values[0])
        ? (values[0] as Tab)
        : "all"
    )
  }, [])

  const onTab = useCallback((next: Tab) => {
    setTab(next)
    const api = gridRef.current?.api
    if (!api) return
    api.setFilterModel(next === "all" ? null : { status: { values: [next] } })
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => onTab(v as Tab)}>
          <TabsList>
            {TABS.map((k) => (
              <TabsTrigger key={k} value={k}>
                {k === "all" ? t.grid.all : t.status[k]}
                <span className="text-xs text-muted-foreground">
                  {counts[k]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.grid.search}
            className="w-64 pl-9"
          />
        </div>
      </div>
      <div style={{ height: "calc(100vh - 14rem)", minHeight: 480 }}>
        <style dangerouslySetInnerHTML={{ __html: headerIconCss }} />
        <AgGridReact<CarRow>
          ref={gridRef}
          theme={gridTheme}
          rowData={rows}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          getRowId={(p) => p.data.id}
          rowHeight={80}
          quickFilterText={search}
          onFilterChanged={onFilterChanged}
          onRowClicked={onRowClicked}
          context={gridContext}
          rowClass="cursor-pointer"
          pagination
          paginationPageSize={10}
          paginationPageSizeSelector={PAGE_SIZES}
          suppressCellFocus
          overlayNoRowsTemplate={t.grid.noMatches}
        />
      </div>
      <CarEditSheet car={editing} onClose={() => setEditingId(null)} />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && busy === null && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.delete.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {keptForHistory
                ? t.delete.hasHistory
                : deleting
                  ? t.delete.body(deleting.title)
                  : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p className="text-sm text-destructive" role="alert">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>
              {t.delete.cancel}
            </AlertDialogCancel>
            {keptForHistory ? (
              <AlertDialogAction
                onClick={archiveInstead}
                disabled={busy !== null}
                data-testid="car-archive-instead"
              >
                {busy === "archive" ? t.delete.archiving : t.delete.archive}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                variant="destructive"
                onClick={confirmDelete}
                disabled={busy !== null}
                data-testid="car-delete-confirm"
              >
                {busy === "delete" ? t.delete.deleting : t.delete.confirm}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
