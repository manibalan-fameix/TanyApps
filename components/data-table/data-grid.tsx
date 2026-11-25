"use client"

import {
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFacetedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { createElement, useEffect, useMemo, useState } from "react"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { DataTableFilter } from "@/components/data-table/data-table-filter"
import { DataTableSearch } from "@/components/data-table/data-table-search"
import { selectColumn } from "@/components/data-table/data-table-select-column"
import { type FilterValue, compareValues, matchesFilter, matchesSearch } from "@/components/data-table/data-grid-filters"
import type { ColDef } from "@/components/data-table/data-grid-types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type { ColDef, CustomCellRendererProps, OptionsParams, ValueFormatterParams } from "@/components/data-table/data-grid-types"
export { numeric, optionsFilter } from "@/components/data-table/data-grid-types"

/** A value people filter by, named for that column's filter button. `field` is the column, when it is not the table's `tabField`. */
export type GridTab = { key: string; label: string; field?: string }

const PAGE_SIZE = 10

const columnId = <T,>(c: ColDef<T>) => c.colId ?? c.field ?? ""
const valueOf = <T,>(c: ColDef<T>, row: T): unknown => (c.valueGetter ? c.valueGetter({ data: row }) : c.field ? (row as Record<string, unknown>)[c.field] : undefined)

/** Column settings for each filter that a list's `tabs` describe, so those values have a filter button with the right names. */
function tabFilters(tabs: GridTab[] | undefined, tabField: string) {
  const byField = new Map<string, Record<string, string>>()
  for (const t of tabs ?? []) {
    if (t.key === "all") continue
    const field = t.field ?? tabField
    byField.set(field, { ...byField.get(field), [t.key]: t.label })
  }
  return byField
}

/**
 * The admin's list: the shared shadcn table (components/data-table) in the tablecn layout. A search box and filter buttons on the left,
 * Sort and View on the right, a tick box on every row, and the page controls underneath. Every list screen uses it.
 */
export function DataGrid<T extends { id: string }>({
  rows,
  columns,
  tabs,
  tabField = "status",
  searchPlaceholder,
  noMatches,
  context,
  hideColumns,
  toolbar,
}: {
  rows: T[]
  columns: ColDef<T>[]
  tabs?: GridTab[]
  tabField?: string
  searchPlaceholder: string
  noMatches: string
  /** Handed to every cell renderer, for actions that live outside the table. */
  context?: unknown
  /** Column fields to leave out, e.g. the business column on a page that is already about one business. */
  hideColumns?: string[]
  /** Extra controls in the toolbar, e.g. an export link or an Add button. */
  toolbar?: React.ReactNode
}) {
  const [search, setSearch] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE })
  const firstPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }))

  const shown = useMemo(() => {
    const kept = hideColumns ? columns.filter((c) => !hideColumns.includes(String(c.field))) : columns
    const wanted = tabFilters(tabs, tabField)
    return kept.map((c) => {
      const names = wanted.get(columnId(c))
      if (!names) return c
      return { ...c, filter: "options" as const, filterParams: { ...c.filterParams, options: c.filterParams?.options ?? Object.keys(names), labels: { ...names, ...c.filterParams?.labels } } }
    })
  }, [columns, hideColumns, tabs, tabField])
  const labels = useMemo(() => Object.fromEntries(shown.map((c) => [columnId(c), c.headerName || columnId(c)])), [shown])

  const tableColumns = useMemo<ColumnDef<T>[]>(
    () => [
      selectColumn<T>(),
      ...shown.map((c) => {
        const id = columnId(c)
        const title = c.headerName ?? ""
        const isData = Boolean(c.field || c.valueGetter)
        return {
          id,
          accessorFn: (row) => valueOf(c, row),
          header: ({ column }) => (title ? <DataTableColumnHeader column={column} title={title} /> : <span className="sr-only">Actions</span>),
          cell: ({ row }) => {
            const value = valueOf(c, row.original)
            if (c.cellRenderer) return createElement(c.cellRenderer, { data: row.original, value, context })
            const text = String((c.valueFormatter ? c.valueFormatter({ value, data: row.original }) : value) ?? "")
            return (
              <span className="block truncate" style={{ maxWidth: c.flex ? Math.max(c.minWidth ?? 0, 320) : c.width }} title={text}>
                {text}
              </span>
            )
          },
          enableSorting: isData && c.sortable !== false,
          enableHiding: isData,
          sortingFn: (a, b) => compareValues(a.getValue(id), b.getValue(id)),
          sortDescFirst: false,
          filterFn: (row, _id, filter: FilterValue) => matchesFilter(row.getValue(id), filter),
          size: c.flex ? undefined : c.pinned === "right" ? 56 : c.width,
          meta: {
            minWidth: c.minWidth,
            cellClassName: cn(c.cellClass, c.pinned === "right" && "sticky right-0 z-10 bg-background in-data-[state=selected]:bg-muted"),
            headerClassName: c.pinned === "right" ? "sticky right-0 z-10 bg-background" : undefined,
          },
        } satisfies ColumnDef<T>
      }),
    ],
    [shown, context],
  )

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getRowId: (r) => r.id,
    state: { sorting, columnFilters, columnVisibility, rowSelection, pagination, globalFilter: search.trim() },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: (next) => {
      setColumnFilters(next)
      firstPage()
    },
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    // A refresh after saving a row must not jump the list back to the first page.
    autoResetPageIndex: false,
    // The search looks across the whole row, so the answer is the same whichever column asks.
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: (row, _id, term: string) =>
      matchesSearch(
        shown.flatMap((c) => {
          const value = valueOf(c, row.original)
          return [value, c.valueFormatter ? c.valueFormatter({ value, data: row.original }) : undefined]
        }),
        term,
      ),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  // Deleting the last row of the last page must not leave an empty page.
  const pageCount = table.getPageCount()
  useEffect(() => {
    if (pagination.pageIndex > 0 && pagination.pageIndex >= pageCount) setPagination((p) => ({ ...p, pageIndex: Math.max(0, pageCount - 1) }))
  }, [pageCount, pagination.pageIndex])

  const filterable = shown.filter((c) => c.filter)
  const filtered = columnFilters.length > 0 || search !== ""

  return (
    <DataTable
      table={table}
      empty={noMatches}
      toolbar={
        <DataTableToolbar table={table} labels={labels}>
          <DataTableSearch
            value={search}
            onChange={(value) => {
              setSearch(value)
              firstPage()
            }}
            placeholder={searchPlaceholder}
          />
          {filterable.map((c) => {
            const column = table.getColumn(columnId(c))
            return column && c.filter ? <DataTableFilter key={column.id} column={column} title={labels[column.id]} kind={c.filter} params={c.filterParams} /> : null
          })}
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                setSearch("")
                setColumnFilters([])
                firstPage()
              }}
            >
              Reset
            </Button>
          ) : null}
          {toolbar}
        </DataTableToolbar>
      }
    />
  )
}
