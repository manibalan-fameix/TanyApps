"use client"

import { flexRender, type Row, type RowData, type Table as TanstackTable } from "@tanstack/react-table"
import { Reorder, useDragControls } from "motion/react"
import { createContext, useContext } from "react"

import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

declare module "@tanstack/react-table" {
  // Per-column looks that TanStack itself has no setting for.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    minWidth?: number
    headerClassName?: string
    cellClassName?: string
  }
}

/**
 * Our default table, in the style of tablecn (https://www.tablecn.com): a TanStack Table instance rendered with the shadcn Table, plus
 * sortable column headers, a toolbar with column visibility, and pagination (see the data-table-* files beside this one).
 * Build the table with `useReactTable`, then render `<DataTable table={table} toolbar={...} />`.
 *
 * `reorder` turns on drag-to-reorder: rows must be in the order of `values` (no sorting, no filter, one page), and a cell that renders
 * `<DataTableDragHandle />` becomes the grip. Only the grip starts a drag, so buttons and inputs in the row still work.
 */
export type DataTableReorder<TData> = {
  values: TData[]
  onReorder: (next: TData[]) => void
  onDragEnd: () => void
  enabled: boolean
}

type DragApi = { start: (e: React.PointerEvent) => void; enabled: boolean }
const DragCtx = createContext<DragApi | null>(null)

/** The grip that starts a row drag. Renders a disabled grip when reordering is switched off (a search or sort is active). */
export function DataTableDragHandle({ label, children }: { label: string; children: React.ReactNode }) {
  const api = useContext(DragCtx)
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!api?.enabled}
      onPointerDown={(e) => api?.enabled && api.start(e)}
      className="flex size-7 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function ReorderRow<TData>({ row, enabled, onDragEnd }: { row: Row<TData>; enabled: boolean; onDragEnd: () => void }) {
  const controls = useDragControls()
  return (
    <DragCtx.Provider value={{ start: (e) => controls.start(e), enabled }}>
      <Reorder.Item
        as="tr"
        value={row.original}
        data-state={row.getIsSelected() ? "selected" : undefined}
        dragListener={false}
        dragControls={controls}
        onDragEnd={onDragEnd}
        whileDrag={{ boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)", zIndex: 10 }}
        className="border-b bg-card transition-colors last:border-b-0 hover:bg-muted/50"
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id} style={{ width: cell.column.getSize() === 150 ? undefined : cell.column.getSize() }}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </Reorder.Item>
    </DragCtx.Provider>
  )
}

export function DataTable<TData>({
  table,
  toolbar,
  reorder,
  empty = "No results.",
  pagination = true,
  className,
  rowHeight,
  rowTestId,
  footer,
}: {
  table: TanstackTable<TData>
  /** Search, filters and the column menu, shown above the table (see DataTableToolbar). */
  toolbar?: React.ReactNode
  reorder?: DataTableReorder<TData>
  empty?: React.ReactNode
  pagination?: boolean
  className?: string
  rowHeight?: number
  rowTestId?: (row: TData) => string | undefined
  /** A totals line, by column id. */
  footer?: Record<string, React.ReactNode>
}) {
  const rows = table.getRowModel().rows
  const colSpan = table.getVisibleLeafColumns().length
  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-3", className)}>
      {toolbar}
      <div className="overflow-hidden rounded-md border [&_td_[data-slot=badge]:not([data-variant=destructive])]:border-border [&_td_[data-slot=badge]:not([data-variant=destructive])]:bg-transparent [&_td_[data-slot=badge]:not([data-variant=destructive])]:text-foreground">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    className={cn("h-10", header.column.columnDef.meta?.headerClassName)}
                    style={{ width: header.getSize() === 150 ? undefined : header.getSize(), minWidth: header.column.columnDef.meta?.minWidth }}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          {reorder && rows.length > 0 ? (
            <Reorder.Group as="tbody" axis="y" values={reorder.values} onReorder={reorder.onReorder} className="[&_tr:last-child]:border-0">
              {rows.map((row) => (
                <ReorderRow key={row.id} row={row} enabled={reorder.enabled} onDragEnd={reorder.onDragEnd} />
              ))}
            </Reorder.Group>
          ) : (
            <TableBody>
              {rows.length ? (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    data-testid={rowTestId?.(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cn("py-2", cell.column.columnDef.meta?.cellClassName)} style={{ height: rowHeight, minWidth: cell.column.columnDef.meta?.minWidth }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
                    {empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          )}
          {footer && rows.length > 0 ? (
            <TableFooter>
              <TableRow>
                {table.getVisibleLeafColumns().map((column) => (
                  <TableCell key={column.id} className={column.columnDef.meta?.cellClassName}>
                    {footer[column.id]}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>
      {pagination ? <DataTablePagination table={table} /> : null}
    </div>
  )
}
