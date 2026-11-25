/* eslint-disable @typescript-eslint/no-explicit-any -- columns of different row types and cell renderers with their own props share one shape */
import type { ComponentType } from "react"

/** What a list column can say about itself. `DataGrid` turns each one into a TanStack column on the shadcn table. */
export type ColDef<T = any> = {
  /** The row property this column shows. */
  field?: string
  /** Needed when there is no `field`, e.g. the actions column. */
  colId?: string
  headerName?: string
  /** "hdr-icon hdr-<name>" shows `icons.<name>` before the title. */
  headerClass?: string
  width?: number
  minWidth?: number
  /** The column takes spare width; long text in it is cut off with an ellipsis. */
  flex?: number
  cellClass?: string
  /** Draws the cell. Without it the (formatted) value is shown as text. */
  cellRenderer?: ComponentType<any>
  valueFormatter?: (params: ValueFormatterParams<T>) => unknown
  /** The value to show, sort and search, when it is not simply `row[field]`. */
  valueGetter?: (params: { data?: T }) => unknown
  filter?: "options" | "number" | "date" | false
  filterParams?: OptionsParams
  sortable?: boolean
  /** Keeps the column in view when a wide table scrolls sideways. */
  pinned?: "right"
}

export type ValueFormatterParams<T = any> = { value: any; data?: T }

export type CustomCellRendererProps<TData = any, TValue = any, TContext = any> = {
  data: TData | undefined
  value: TValue
  context: TContext
}

export type OptionsParams = {
  options?: readonly string[]
  labels?: Record<string, string>
  sort?: (a: string, b: string) => number
}

/** A column filtered by ticking values, e.g. Status. */
export const optionsFilter = (params: OptionsParams = {}) => ({ filter: "options" as const, filterParams: params })
export const numeric = (a: string, b: string) => Number(a) - Number(b)
