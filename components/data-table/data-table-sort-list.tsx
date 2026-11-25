"use client"

import type { Table } from "@tanstack/react-table"
import { ArrowDown01Icon, ArrowUp01Icon, ArrowUpDownIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

/** The "Sort" button: pick a column to sort by; picking it again flips the direction. */
export function DataTableSortList<TData>({ table, labels }: { table: Table<TData>; labels?: Record<string, string> }) {
  const columns = table.getAllColumns().filter((c) => c.getCanSort() && c.getCanHide())
  if (columns.length === 0) return null
  const sorting = table.getState().sorting
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-8 rounded-md" />}>
        <HugeiconsIcon icon={ArrowUpDownIcon} strokeWidth={2} className="size-4" />
        Sort
        {sorting.length ? <Badge variant="secondary" className="rounded-sm px-1.5 font-mono">{sorting.length}</Badge> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {columns.map((column) => {
          const sorted = column.getIsSorted()
          return (
            <DropdownMenuItem key={column.id} onClick={() => column.toggleSorting(sorted === "asc")}>
              <span className="flex-1">{labels?.[column.id] ?? column.id}</span>
              {sorted ? <HugeiconsIcon icon={sorted === "asc" ? ArrowUp01Icon : ArrowDown01Icon} strokeWidth={2} className="size-4" /> : null}
            </DropdownMenuItem>
          )
        })}
        {sorting.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => table.resetSorting(true)}>Reset sorting</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
