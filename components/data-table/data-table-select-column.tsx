"use client"

import type { ColumnDef } from "@tanstack/react-table"

import { Checkbox } from "@/components/ui/checkbox"

/** The first column of every table: tick one row, or every row on the page. */
export function selectColumn<T>(): ColumnDef<T> {
  return {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        className="border-foreground/25 bg-background"
        aria-label="Select all rows on this page"
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(on) => table.toggleAllPageRowsSelected(Boolean(on))}
      />
    ),
    cell: ({ row }) => (
      <span data-row-action className="flex">
        <Checkbox className="border-foreground/25 bg-background" aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={(on) => row.toggleSelected(Boolean(on))} />
      </span>
    ),
    enableSorting: false,
    enableHiding: false,
    enableGlobalFilter: false,
    enableColumnFilter: false,
    size: 44,
  }
}
