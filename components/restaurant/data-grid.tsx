"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import type { ColDef, FilterChangedEvent, RowClickedEvent } from "ag-grid-community"
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community"
import { AgGridReact } from "ag-grid-react"
import { renderToStaticMarkup } from "react-dom/server"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { type OptionsModel, gridTheme } from "@/components/cars/cars-grid"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

ModuleRegistry.registerModules([AllCommunityModule])

export type GridTab = { key: string; label: string }

/** Header icons are hugeicons rendered to SVG data URIs; globals.css masks them in front of each header label. */
function headerIconCss(icons: Record<string, IconSvgElement>) {
  return Object.entries(icons)
    .map(([k, icon]) => {
      const svg = renderToStaticMarkup(<HugeiconsIcon icon={icon} size={16} color="black" />)
      return `.ag-header-cell.hdr-${k}{--hdr-icon:url("data:image/svg+xml,${encodeURIComponent(svg)}")}`
    })
    .join("")
}

const PAGE_SIZES = [10, 20, 50]

/**
 * The restaurant admin's table: the same AG Grid setup as the cars list (token theme, header icons, tabs with
 * counts that drive the Status filter, quick search, pagination), so every list looks and behaves alike.
 */
export function DataGrid<T extends { id: string }>({
  rows,
  columns,
  icons,
  tabs,
  tabField = "status",
  searchPlaceholder,
  noMatches,
  rowHeight = 64,
  onRowClick,
  context,
  hideColumns,
  toolbar,
}: {
  rows: T[]
  columns: ColDef<T>[]
  icons: Record<string, IconSvgElement>
  /** Tabs filter the column named by `tabField`. Omit for a plain table. */
  tabs?: GridTab[]
  tabField?: string
  searchPlaceholder: string
  noMatches: string
  rowHeight?: number
  onRowClick?: (row: T) => void
  context?: object
  /** Column fields to leave out, e.g. the business column on a page that is already about one business. */
  hideColumns?: string[]
  /** Extra controls next to the search box, e.g. an export link. */
  toolbar?: React.ReactNode
}) {
  const gridRef = useRef<AgGridReact<T>>(null)
  const [tab, setTab] = useState("all")
  const [search, setSearch] = useState("")
  const css = useMemo(() => headerIconCss(icons), [icons])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length }
    for (const r of rows) {
      const v = String((r as Record<string, unknown>)[tabField] ?? "")
      c[v] = (c[v] ?? 0) + 1
    }
    return c
  }, [rows, tabField])

  const defaultColDef = useMemo<ColDef>(() => ({ resizable: false, filter: false }), [])

  // Keep the tabs in step with the column's header filter.
  const onFilterChanged = useCallback(
    (e: FilterChangedEvent<T>) => {
      const values = (e.api.getFilterModel()[tabField] as OptionsModel | undefined)?.values
      setTab(values?.length === 1 && tabs?.some((t) => t.key === values[0]) ? values[0] : "all")
    },
    [tabField, tabs],
  )
  const onTab = useCallback(
    (next: string) => {
      setTab(next)
      gridRef.current?.api?.setFilterModel(next === "all" ? null : { [tabField]: { values: [next] } })
    },
    [tabField],
  )
  const onRowClicked = useCallback(
    (e: RowClickedEvent<T>) => {
      if (!e.data || !onRowClick) return
      if ((e.event?.target as HTMLElement | null)?.closest("a, button, [data-row-action]")) return
      onRowClick(e.data)
    },
    [onRowClick],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {tabs ? (
          <Tabs value={tab} onValueChange={(v) => onTab(String(v))}>
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                  <span className="text-xs text-muted-foreground">{counts[t.key] ?? 0}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {toolbar}
          <div className="relative">
            <HugeiconsIcon
              icon={Search01Icon}
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder} className="w-64 pl-9" />
          </div>
        </div>
      </div>
      <div style={{ height: "calc(100vh - 14rem)", minHeight: 420 }}>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <AgGridReact<T>
          ref={gridRef}
          theme={gridTheme}
          rowData={rows}
          columnDefs={hideColumns ? columns.filter((c) => !hideColumns.includes(String(c.field))) : columns}
          defaultColDef={defaultColDef}
          getRowId={(p) => p.data.id}
          rowHeight={rowHeight}
          quickFilterText={search}
          onFilterChanged={onFilterChanged}
          onRowClicked={onRowClicked}
          context={context}
          rowClass={onRowClick ? "cursor-pointer" : undefined}
          pagination
          paginationPageSize={10}
          paginationPageSizeSelector={PAGE_SIZES}
          suppressCellFocus
          overlayNoRowsTemplate={noMatches}
        />
      </div>
    </div>
  )
}
