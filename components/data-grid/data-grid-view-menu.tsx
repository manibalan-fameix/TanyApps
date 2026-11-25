"use client";

import {
  type ReactTable,
  type RowData,
  Subscribe,
} from "@tanstack/react-table-v9";
import { cn } from "cn";
import * as React from "react";

import type { DataGridFeatures } from "@/lib/data-grid-features";

import { Button } from "@/components/ui/button";
import { useDirection } from "@/components/ui/direction";
import {
  Faceted,
  FacetedContent,
  FacetedEmpty,
  FacetedGroup,
  FacetedInput,
  FacetedItem,
  FacetedItemIndicator,
  FacetedList,
  FacetedTrigger,
} from "@/components/ui/faceted";
import { HugeiconsIcon } from "@hugeicons/react";
import { Settings05Icon } from "@hugeicons/core-free-icons";

interface DataGridViewMenuProps<
  TData extends RowData,
> extends React.ComponentProps<typeof FacetedContent> {
  table: ReactTable<DataGridFeatures, TData, unknown>;
  disabled?: boolean;
}

export function DataGridViewMenu<TData extends RowData>({
  table,
  disabled,
  className,
  ...props
}: DataGridViewMenuProps<TData>) {
  const dir = useDirection();

  const columns = React.useMemo(
    () =>
      table
        .getAllColumns()
        .filter(
          (column) =>
            typeof column.accessorFn !== "undefined" && column.getCanHide(),
        ),
    [table],
  );

  return (
    <Subscribe source={table.atoms.columnVisibility}>
      {(columnVisibility) => (
        <Faceted
          multiple
          value={columns
            .filter((column) => columnVisibility[column.id] !== false)
            .map((column) => column.id)}
        >
          <FacetedTrigger
            render={
              <Button
                aria-label="Toggle columns"
                role="combobox"
                dir={dir}
                variant="outline"
                className="ms-auto"
                disabled={disabled}
              />
            }
          >
            <HugeiconsIcon icon={Settings05Icon} strokeWidth={2} className="text-muted-foreground" />
            View
          </FacetedTrigger>
          <FacetedContent
            dir={dir}
            align="center"
            className={cn("w-44", className)}
            {...props}
          >
            <FacetedInput placeholder="Search columns..." />
            <FacetedList>
              <FacetedEmpty>No columns found.</FacetedEmpty>
              <FacetedGroup>
                {columns.map((column) => (
                  <FacetedItem
                    key={column.id}
                    value={column.id}
                    keywords={[column.columnDef.meta?.label ?? column.id]}
                    onSelect={() => column.toggleVisibility()}
                  >
                    <bdi className="truncate">
                      {column.columnDef.meta?.label ?? column.id}
                    </bdi>
                    <FacetedItemIndicator />
                  </FacetedItem>
                ))}
              </FacetedGroup>
            </FacetedList>
          </FacetedContent>
        </Faceted>
      )}
    </Subscribe>
  );
}
