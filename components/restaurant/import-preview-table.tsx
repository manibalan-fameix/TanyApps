"use client"

import { type ColumnDef, type PaginationState, getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table"
import { Alert02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMemo, useState } from "react"

import type { RowPlan } from "@/app/(admin)/(shell)/menu/import/actions"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { FIELD_LABEL, type ImportRow, resolvePrice } from "@/lib/restaurant/bulk-import"

export type PreviewRow = ImportRow & { include: boolean }

type Line = { index: number; row: PreviewRow }

type Api = {
  edit: (index: number, patch: Partial<PreviewRow>) => void
  setAll: (include: boolean) => void
  planFor: (index: number) => RowPlan | null
  markupPct: number
  allIncluded: boolean
  included: number
}

const api = (meta: unknown) => meta as Api

/** Whole-number text for a price or stock box, or empty. */
const numText = (n: number | null) => (n === null ? "" : String(n))
const toInt = (s: string) => {
  const d = s.replace(/\D/g, "")
  return d === "" ? null : Number(d)
}

function Result({ line, meta }: { line: Line; meta: Api }) {
  const r = line.row
  const plan = meta.planFor(line.index)
  const problem = !r.include ? null : resolvePrice(r, meta.markupPct) === null ? "Needs a selling price" : (plan?.problem ?? null)
  if (!r.include) return <span className="text-muted-foreground">Left out</span>
  if (problem)
    return (
      <span className="flex items-center gap-1 text-destructive">
        <HugeiconsIcon icon={Alert02Icon} className="size-3.5" />
        {problem}
      </span>
    )
  if (plan?.action === "create") return <Badge>New</Badge>
  if (plan?.action === "update")
    return (
      <span title={plan.existingName}>
        <Badge variant="secondary">Update{plan.newStock !== null && plan.newStock !== undefined ? ` · stock ${plan.newStock}` : ""}</Badge>
      </span>
    )
  if (plan?.action === "skip") return <Badge variant="outline">Already exists</Badge>
  return <span className="text-muted-foreground">Checking...</span>
}

// Defined once, outside the component: a new column list on every keystroke would rebuild the boxes and drop the cursor.
const COLUMNS: ColumnDef<Line>[] = [
  {
    id: "select",
    // Here a ticked row is one that gets imported.
    header: ({ table }) => <Checkbox aria-label="Select all" checked={api(table.options.meta).allIncluded} onCheckedChange={(v) => api(table.options.meta).setAll(Boolean(v))} />,
    cell: ({ row, table }) => <Checkbox aria-label={`Include ${row.original.row.name}`} checked={row.original.row.include} onCheckedChange={(v) => api(table.options.meta).edit(row.original.index, { include: Boolean(v) })} />,
    enableHiding: false,
    size: 44,
  },
  {
    id: "name",
    header: () => FIELD_LABEL.name,
    cell: ({ row, table }) => <Input aria-label="Product name" value={row.original.row.name} onChange={(e) => api(table.options.meta).edit(row.original.index, { name: e.target.value })} />,
    enableHiding: false,
    meta: { minWidth: 176 },
  },
  {
    id: "category",
    header: () => "Category",
    cell: ({ row, table }) => <Input aria-label="Category" value={row.original.row.category ?? ""} placeholder="None" onChange={(e) => api(table.options.meta).edit(row.original.index, { category: e.target.value || null })} />,
    meta: { minWidth: 128 },
  },
  {
    id: "price",
    header: () => "Selling price (₹)",
    cell: ({ row, table }) => {
      const meta = api(table.options.meta)
      const suggested = resolvePrice(row.original.row, meta.markupPct)
      return <Input aria-label="Selling price" inputMode="numeric" value={row.original.row.price !== null ? numText(row.original.row.price) : ""} placeholder={suggested !== null ? String(suggested) : ""} onChange={(e) => meta.edit(row.original.index, { price: toInt(e.target.value) })} />
    },
    enableHiding: false,
    size: 112,
  },
  {
    id: "mrp",
    header: () => "MRP (₹)",
    cell: ({ row, table }) => <Input aria-label="MRP" inputMode="numeric" value={numText(row.original.row.mrp)} onChange={(e) => api(table.options.meta).edit(row.original.index, { mrp: toInt(e.target.value) })} />,
    size: 112,
  },
  {
    id: "stock",
    header: () => "Stock",
    cell: ({ row, table }) => <Input aria-label="Stock" inputMode="numeric" value={numText(row.original.row.stock)} onChange={(e) => api(table.options.meta).edit(row.original.index, { stock: toInt(e.target.value) })} />,
    size: 96,
  },
  {
    id: "result",
    header: () => "Result",
    cell: ({ row, table }) => (
      <div className="text-xs">
        <Result line={row.original} meta={api(table.options.meta)} />
      </div>
    ),
    enableHiding: false,
    size: 160,
  },
]

const LABELS = { category: "Category", mrp: "MRP", stock: "Stock" }

/** The rows read from a file, to check and correct before they are imported. */
export function ImportPreviewTable({ rows, edit, setAll, planFor, markupPct }: { rows: PreviewRow[] } & Pick<Api, "edit" | "setAll" | "planFor" | "markupPct">) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 })
  const lines = useMemo(() => rows.map((row, index) => ({ index, row })), [rows])
  const included = rows.filter((r) => r.include).length
  const table = useReactTable({
    data: lines,
    columns: COLUMNS,
    getRowId: (l) => String(l.index),
    state: { pagination, rowSelection: Object.fromEntries(lines.filter((l) => l.row.include).map((l) => [String(l.index), true])) },
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    enableSorting: false,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    meta: { edit, setAll, planFor, markupPct, included, allIncluded: rows.every((r) => r.include) } satisfies Api as object,
  })
  return <DataTable table={table} toolbar={<DataTableToolbar table={table} labels={LABELS} sortable={false} />} />
}
