"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { toast } from "@/lib/toast"

import {
  archiveCarAction,
  deleteCarAction,
} from "@/app/(admin)/(shell)/cars/actions"
import { CarEditSheet } from "@/components/cars/car-edit-sheet"
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions"
import {
  DataGrid,
  numeric,
  optionsFilter,
  type ColDef,
  type CustomCellRendererProps,
  type ValueFormatterParams,
} from "@/components/data-table/data-grid"
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
import type { ScoreBand } from "@/lib/cars/score"
import { copy } from "@/lib/copy"
import { cn } from "@/lib/utils"

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
          className="size-10 shrink-0 rounded-md bg-muted object-cover"
        />
      ) : (
        <div className="size-10 shrink-0 rounded-md bg-muted" />
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

type GridContext = { onDelete: (row: CarRow) => void; onEdit: (row: CarRow) => void }

function ActionsCell({
  data,
  context,
}: CustomCellRendererProps<CarRow, unknown, GridContext>) {
  if (!data) return null
  return (
    <DataTableRowActions
      label={`${t.delete.more}: ${data.title}`}
      testId={`car-more-${data.id}`}
      actions={[
        data.draft ? { label: t.continueDraft, href: data.href } : { label: t.edit.action, onClick: () => context.onEdit(data) },
        { label: t.delete.menu, destructive: true, onClick: () => context.onDelete(data), testId: `car-delete-${data.id}` },
      ]}
    />
  )
}

const STATUS_OPTIONS = Object.keys(t.status)
const FUEL_OPTIONS = ["Petrol", "Diesel", "CNG", "LPG", "Electric", "Hybrid"]
const GEARBOX_OPTIONS = ["Manual", "Automatic"]
const OWNER_OPTIONS = ["1", "2", "3", "4", "5"]
const OWNER_LABELS = Object.fromEntries(
  [1, 2, 3, 4, 5].map((n) => [String(n), copy.tenant.car.owners(n)])
)


export function CarsGrid({ rows }: { rows: CarRow[] }) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = rows.find((r) => r.id === editingId) ?? null

  // Delete lives out here, not in the cell: the dialog must outlive the row it was opened from.
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
      onEdit: (row) => setEditingId(row.id),
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

  const colDefs = useMemo<ColDef<CarRow>[]>(
    () => [
      {
        field: "title",
        headerName: t.grid.car,
        cellRenderer: CarCell,
        minWidth: 280,
        flex: 2,
      },
      {
        field: "year",
        headerName: t.grid.year,
        width: 120,
        filter: "number",
        valueFormatter: (p: ValueFormatterParams) => p.value ?? "—",
      },
      {
        field: "status",
        headerName: t.grid.status,
        cellRenderer: StatusCell,
        width: 120,
        ...optionsFilter({ options: STATUS_OPTIONS, labels: t.status }),
      },
      {
        field: "fuel",
        headerName: t.grid.fuel,
        width: 120,
        ...optionsFilter({ options: FUEL_OPTIONS }),
        valueFormatter: (p: ValueFormatterParams) => p.value || "—",
        cellClass: "capitalize",
      },
      {
        field: "transmission",
        headerName: t.grid.gearbox,
        width: 130,
        ...optionsFilter({ options: GEARBOX_OPTIONS }),
        valueFormatter: (p: ValueFormatterParams) => p.value || "—",
        cellClass: "capitalize",
      },
      {
        field: "km",
        headerName: t.grid.km,
        width: 130,

        filter: "number",
        valueFormatter: (p: ValueFormatterParams) =>
          p.value == null ? "—" : `${inr.format(p.value)} km`,
      },
      {
        field: "owners",
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
        headerName: t.grid.price,
        width: 150,
        filter: "number",
        cellRenderer: PriceCell,
      },
      {
        field: "score",
        headerName: t.grid.score,
        width: 140,
        filter: "number",
        cellRenderer: ScoreCell,
      },
      {
        field: "listedAt",
        filter: "date",
        headerName: t.grid.listed,
        width: 170,
        valueFormatter: (p: ValueFormatterParams) =>
          p.value ? dateFmt.format(new Date(p.value)) : "—",
      },
      {
        colId: "actions",
        headerName: "",
        cellRenderer: ActionsCell,
        width: 56,
        sortable: false,
        filter: false,
        pinned: "right",
      },
    ],
    []
  )

  return (
    <div className="flex flex-col gap-4">
      <DataGrid<CarRow>
        rows={rows}
        columns={colDefs}
        tabs={TABS.map((k) => ({ key: k, label: k === "all" ? t.grid.all : t.status[k] }))}
        searchPlaceholder={t.grid.search}
        noMatches={t.grid.noMatches}
        context={gridContext}
      />
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
