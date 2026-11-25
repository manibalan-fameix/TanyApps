"use client";

import type {
  CellContext,
  ColumnDef,
  Row,
  RowData,
} from "@tanstack/react-table-v9";

import * as React from "react";

import type { DataGridFeatures } from "@/lib/data-grid-features";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";

/** tablecn's menu card: small and only slightly rounded, with slim rows. Shared by the "..." menu and the right-click menu. */
export const GRID_MENU_CARD =
  "w-40 min-w-0 rounded-lg p-1 [&_[data-slot=dropdown-menu-item]]:gap-2 [&_[data-slot=dropdown-menu-item]]:rounded-md [&_[data-slot=dropdown-menu-item]]:px-2 [&_[data-slot=dropdown-menu-item]]:py-1.5 [&_[data-slot=dropdown-menu-item]]:font-normal";

type DataGridActionsContext<TData extends RowData> = Pick<
  CellContext<DataGridFeatures, TData>,
  "row" | "table"
>;

interface GetDataGridActionsColumnOptions<TData extends RowData> extends Omit<
  Partial<ColumnDef<DataGridFeatures, TData>>,
  "id" | "header" | "cell"
> {
  actions: (context: DataGridActionsContext<TData>) => React.ReactNode;
  getAriaLabel?: (row: Row<DataGridFeatures, TData>) => string;
}

export function getDataGridActionsColumn<TData extends RowData>({
  actions,
  getAriaLabel = (row) => `Open actions for row ${row.getDisplayIndex() + 1}`,
  size = 56,
  minSize = size,
  enableHiding = false,
  enableResizing = false,
  enableSorting = false,
  ...props
}: GetDataGridActionsColumnOptions<TData>): ColumnDef<DataGridFeatures, TData> {
  return {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row, table }) => (
      <DataGridActionsCell
        table={table}
        row={row}
        actions={actions}
        getAriaLabel={getAriaLabel}
      />
    ),
    size,
    minSize,
    enableHiding,
    enableResizing,
    enableSorting,
    ...props,
  };
}

interface DataGridActionsCellProps<
  TData extends RowData,
> extends DataGridActionsContext<TData> {
  actions: (context: DataGridActionsContext<TData>) => React.ReactNode;
  getAriaLabel: (row: Row<DataGridFeatures, TData>) => string;
}

function DataGridActionsCell<TData extends RowData>({
  table,
  row,
  actions,
  getAriaLabel,
}: DataGridActionsCellProps<TData>) {
  return (
    <div className="-mx-3 flex justify-center">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={getAriaLabel(row)}
              variant="ghost"
              size="icon-sm"
              tabIndex={-1}
              className="size-6 translate-y-[-0.5px] text-muted-foreground transition-none data-popup-open:bg-accent"
            />
          }
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
        </DropdownMenuTrigger>
        <DropdownMenuContent data-grid-popover align="end" className={GRID_MENU_CARD}>
          {actions({ row, table })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
