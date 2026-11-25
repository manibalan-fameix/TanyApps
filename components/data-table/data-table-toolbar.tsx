"use client"

import type { Table } from "@tanstack/react-table"

import { DataTableSortList } from "@/components/data-table/data-table-sort-list"
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options"
import { cn } from "@/lib/utils"

/** The row above a table, laid out as in tablecn: search and filters (whatever you pass in) on the left, Sort and View on the right. */
export function DataTableToolbar<TData>({ table, labels, className, sortable = true, children }: { table: Table<TData>; labels?: Record<string, string>; className?: string; sortable?: boolean; children?: React.ReactNode }) {
  return (
    <div role="toolbar" aria-label="Table tools" className={cn("flex w-full flex-wrap items-center gap-2", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      <div className="ml-auto flex items-center gap-2">
        {sortable ? <DataTableSortList table={table} labels={labels} /> : null}
        <DataTableViewOptions table={table} labels={labels} />
      </div>
    </div>
  )
}
