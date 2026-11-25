"use client"

import type { Table } from "@tanstack/react-table"
import { Settings02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

/** The "View" menu: tick the columns to show. Columns that cannot be hidden (the grip, the actions) are not listed. */
export function DataTableViewOptions<TData>({ table, labels }: { table: Table<TData>; labels?: Record<string, string> }) {
  const columns = table.getAllColumns().filter((c) => c.getCanHide())
  if (columns.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="ml-auto hidden h-8 rounded-md sm:flex" />}>
        <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} className="size-4" />
        View
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {columns.map((column) => (
          <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onCheckedChange={(v) => column.toggleVisibility(Boolean(v))}>
            {labels?.[column.id] ?? column.id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
