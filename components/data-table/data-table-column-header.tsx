"use client"

import type { Column } from "@tanstack/react-table"
import { ArrowDown01Icon, ArrowUp01Icon, ArrowUpDownIcon, Cancel01Icon, ViewOffIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

/** A column title that opens a menu to sort ascending or descending, clear the sort, or hide the column (as in tablecn). */
export function DataTableColumnHeader<TData, TValue>({ column, title, className }: { column: Column<TData, TValue>; title: string; className?: string }) {
  if (!column.getCanSort() && !column.getCanHide()) return <span className={className}>{title}</span>
  const sorted = column.getIsSorted()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className={cn("-ml-2.5 h-8 data-popup-open:bg-accent", className)} />}>
        {title}
        {column.getCanSort() ? (
          <HugeiconsIcon icon={sorted === "desc" ? ArrowDown01Icon : sorted === "asc" ? ArrowUp01Icon : ArrowUpDownIcon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {column.getCanSort() ? (
          <>
            <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
              <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="size-4" />
              Asc
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-4" />
              Desc
            </DropdownMenuItem>
            {sorted ? (
              <DropdownMenuItem onClick={() => column.clearSorting()}>
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
                Reset
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
        {column.getCanSort() && column.getCanHide() ? <DropdownMenuSeparator /> : null}
        {column.getCanHide() ? (
          <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
            <HugeiconsIcon icon={ViewOffIcon} strokeWidth={2} className="size-4" />
            Hide
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
