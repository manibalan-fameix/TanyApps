"use client"

import type { Table } from "@tanstack/react-table"
import { ArrowLeft01Icon, ArrowLeftDoubleIcon, ArrowRight01Icon, ArrowRightDoubleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const SIZES = [10, 20, 30, 40, 50]

/** The footer under every table, as in tablecn: how many rows are ticked, rows per page, the page number and the four page buttons. */
export function DataTablePagination<TData>({ table }: { table: Table<TData> }) {
  const total = table.getFilteredRowModel().rows.length
  const selected = table.getFilteredSelectedRowModel().rows.length
  const { pageIndex, pageSize } = table.getState().pagination
  const items = [...new Set([...SIZES, pageSize])].sort((a, b) => a - b).map((s) => ({ value: String(s), label: String(s) }))
  const buttons = [
    { label: "First page", icon: ArrowLeftDoubleIcon, off: !table.getCanPreviousPage(), go: () => table.setPageIndex(0) },
    { label: "Previous page", icon: ArrowLeft01Icon, off: !table.getCanPreviousPage(), go: () => table.previousPage() },
    { label: "Next page", icon: ArrowRight01Icon, off: !table.getCanNextPage(), go: () => table.nextPage() },
    { label: "Last page", icon: ArrowRightDoubleIcon, off: !table.getCanNextPage(), go: () => table.setPageIndex(table.getPageCount() - 1) },
  ]
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3 px-1 text-sm">
      <span className="text-muted-foreground">
        {selected === 0 ? "0 rows selected." : `${selected.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} ${total === 1 ? "row" : "rows"} selected.`}
      </span>
      <div className="flex flex-wrap items-center gap-4 font-medium sm:gap-6">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap">Rows per page</span>
          <Select items={items} value={String(pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-20 rounded-md border-border bg-background" aria-label="Rows per page"><SelectValue /></SelectTrigger>
            <SelectContent>
              {items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <span className="whitespace-nowrap">Page {pageIndex + 1} of {Math.max(1, table.getPageCount())}</span>
        <div className="flex gap-1.5">
          {buttons.map((b) => (
            <Button key={b.label} variant="outline" size="icon-sm" className="rounded-md" aria-label={b.label} disabled={b.off} onClick={b.go}>
              <HugeiconsIcon icon={b.icon} strokeWidth={2} className="size-4" />
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
