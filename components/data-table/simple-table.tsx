"use client"

import {
  type ColumnDef,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useMemo, useState } from "react"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { DataTableSearch } from "@/components/data-table/data-table-search"
import { selectColumn } from "@/components/data-table/data-table-select-column"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { compareValues, matchesSearch } from "@/components/data-table/data-grid-filters"
import { sortValueOf, textOf } from "@/components/data-table/cell-text"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type SimpleColumn = {
  /** Empty for a column of controls: it gets no sorting and cannot be hidden. */
  title: string
  align?: "right"
  className?: string
}

export type SimpleRow = {
  id: string
  /** One ready-made cell for each column. */
  cells: React.ReactNode[]
  testId?: string
}

/**
 * The shared table (tablecn layout) for lists whose cells are drawn up front, including by server pages: search, Sort, View, tick boxes,
 * sortable headers and pagination. Lists with filters or row clicks use `DataGrid`.
 */
export function SimpleTable({
  columns,
  rows,
  empty = "No results.",
  searchPlaceholder = "Search...",
  footer,
}: {
  columns: SimpleColumn[]
  rows: SimpleRow[]
  empty?: React.ReactNode
  searchPlaceholder?: string
  /** A totals line, one cell for each column. It covers every row, whatever is searched or on screen. */
  footer?: React.ReactNode[]
}) {
  const [search, setSearch] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })

  // Rebuilt only when the headings change, so controls inside cells keep their state while the data updates.
  const shape = columns.map((c) => `${c.title}|${c.align ?? ""}|${c.className ?? ""}`).join("§")
  const tableColumns = useMemo<ColumnDef<SimpleRow>[]>(
    () => [
      selectColumn<SimpleRow>(),
      ...columns.map((c, i): ColumnDef<SimpleRow> => {
        const id = `c${i}`
        const cellClassName = cn("whitespace-normal", c.align === "right" && "text-right tabular-nums", c.className)
        return {
          id,
          accessorFn: (row) => sortValueOf(row.cells[i]),
          header: ({ column }) =>
            c.title ? (
              <div className={cn("flex", c.align === "right" && "justify-end")}>
                <DataTableColumnHeader column={column} title={c.title} />
              </div>
            ) : (
              <span className="sr-only">Actions</span>
            ),
          cell: ({ row }) => row.original.cells[i],
          enableSorting: Boolean(c.title),
          enableHiding: Boolean(c.title),
          sortingFn: (a, b) => compareValues(a.getValue(id), b.getValue(id)),
          sortDescFirst: false,
          meta: { cellClassName },
        }
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `shape` is the headings written out
    [shape],
  )

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getRowId: (r) => r.id,
    state: { sorting, columnVisibility, rowSelection, pagination, globalFilter: search.trim() },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: (row, _id, term: string) => matchesSearch(row.original.cells.map(textOf), term),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const labels = Object.fromEntries(columns.map((c, i) => [`c${i}`, c.title]))
  const pageCount = table.getPageCount()
  if (pagination.pageIndex > 0 && pagination.pageIndex >= pageCount) setPagination({ ...pagination, pageIndex: Math.max(0, pageCount - 1) })

  return (
    <DataTable
      table={table}
      empty={empty}
      rowTestId={(row) => row.testId}
      footer={footer ? Object.fromEntries(footer.map((cell, i) => [`c${i}`, cell])) : undefined}
      toolbar={
        <DataTableToolbar table={table} labels={labels}>
          <DataTableSearch
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPagination((p) => ({ ...p, pageIndex: 0 }))
            }}
            placeholder={searchPlaceholder}
          />
          {search ? (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setSearch("")}>
              Reset
            </Button>
          ) : null}
        </DataTableToolbar>
      }
    />
  )
}
