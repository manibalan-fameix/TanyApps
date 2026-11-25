"use client"

import { type ColumnDef, type RowSelectionState, type VisibilityState, getCoreRowModel, getFacetedRowModel, getFilteredRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table"
import { DragDropVerticalIcon, PlusSignCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRouter } from "next/navigation"
import { type CSSProperties, useMemo, useState, useTransition } from "react"

import { DataTable, DataTableDragHandle } from "@/components/data-table/data-table"
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions"
import { DataTableSearch } from "@/components/data-table/data-table-search"
import { selectColumn } from "@/components/data-table/data-table-select-column"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { type BannerDestination, BannerForm, type BannerValues } from "@/components/restaurant/simple-forms"
import { PromoBanner } from "@/components/restaurant/store/promo-banners"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { deleteBanner, reorderBanners, setBannerActive } from "@/lib/restaurant/admin-actions"
import { toast } from "@/lib/toast"

export type BannerRow = BannerValues & { status: "showing" | "hidden" }

type Result = { ok: true } | { ok: false; error: string }

const STATUS_LABEL = { showing: "Showing", hidden: "Hidden" }

/** A banner's place among those showing, which decides its colour on the home page. */
const homeLook = (rows: BannerRow[], id: string) => rows.slice(0, rows.findIndex((r) => r.id === id)).filter((r) => r.status === "showing").length

/** The banners, in the order the home page lists them. The owner drags a row by its grip to change that order. */
export function BannersTable({ rows, owner, destinations, storeTheme }: { rows: BannerRow[]; owner: boolean; destinations: BannerDestination[]; storeTheme: CSSProperties }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [statuses, setStatuses] = useState<string[]>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<BannerRow | null>(null)
  const [deleting, setDeleting] = useState<BannerRow | null>(null)

  // The order on screen. It follows the server's list, and is saved the moment a drag ends.
  const [order, setOrder] = useState(rows)
  const [seen, setSeen] = useState(rows)
  if (seen !== rows) {
    setSeen(rows)
    setOrder(rows)
  }

  const q = search.trim().toLowerCase()
  const visible = useMemo(
    () => order.filter((b) => (statuses.length === 0 || statuses.includes(b.status)) && (!q || `${b.title} ${b.subtitle}`.toLowerCase().includes(q))),
    [order, statuses, q],
  )

  const columns = useMemo<ColumnDef<BannerRow>[]>(() => {
    const run = (fn: () => Promise<Result>) =>
      start(async () => {
        const res = await fn()
        if (res.ok) router.refresh()
        else toast.error(res.error)
      })
    return [
      ...(owner
        ? [
            {
              id: "drag",
              header: () => <span className="sr-only">Move</span>,
              cell: ({ row }) => (
                <DataTableDragHandle label={`Drag to move ${row.original.title}`}>
                  <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={1.75} className="size-4" />
                </DataTableDragHandle>
              ),
              size: 44,
            } satisfies ColumnDef<BannerRow>,
          ]
        : []),
      selectColumn<BannerRow>(),
      {
        accessorKey: "title",
        header: "Banner",
        enableHiding: false,
        cell: ({ row }) => {
          const b = row.original
          return (
            <div className="flex items-center gap-3">
              {/* The banner exactly as the home page draws it, at half size. It is a picture only, so it cannot be tapped. */}
              <div inert aria-hidden style={storeTheme} className="h-20 w-45 shrink-0 overflow-hidden rounded-lg">
                <PromoBanner banner={b} look={homeLook(order, b.id)} className="w-90 origin-top-left scale-50" />
              </div>
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate font-medium">{b.title}</span>
                {b.subtitle ? <span className="truncate text-xs text-muted-foreground">{b.subtitle}</span> : null}
                {b.linkUrl ? <span className="truncate text-xs text-muted-foreground">{b.buttonLabel ? `"${b.buttonLabel}" → ` : "→ "}{b.linkUrl}</span> : null}
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant={row.original.status === "showing" ? "default" : "secondary"}>{row.original.status === "showing" ? "Showing" : "Hidden"}</Badge>,
        size: 110,
      },
      ...(owner
        ? [
            {
              id: "actions",
              header: () => <span className="sr-only">Actions</span>,
              cell: ({ row }) => {
                const b = row.original
                return (
                  <DataTableRowActions
                    label={`Actions for ${b.title}`}
                    actions={[
                      { label: "Edit", onClick: () => setEditing(b) },
                      { label: "Status", disabled: pending, value: b.status, options: [{ value: "showing", label: "Showing" }, { value: "hidden", label: "Hidden" }], onSelect: (v) => run(() => setBannerActive(b.id, v === "showing")) },
                      { label: "Delete", destructive: true, disabled: pending, onClick: () => setDeleting(b) },
                    ]}
                  />
                )
              },
              enableHiding: false,
              size: 56,
            } satisfies ColumnDef<BannerRow>,
          ]
        : []),
    ]
  }, [owner, pending, router, order, storeTheme])

  const table = useReactTable({
    data: visible,
    columns,
    getRowId: (b) => b.id,
    state: { columnVisibility, rowSelection },
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    // The order is the owner's own, set by dragging, so the columns do not sort.
    enableSorting: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  // Dragging changes the saved order, so it needs every banner on screen: no search, no filter and a single page.
  const canReorder = statuses.length === 0 && !q && !pending && table.getPageCount() <= 1

  function saveOrder() {
    if (order.every((b, i) => b.id === rows[i]?.id)) return
    start(async () => {
      const res = await reorderBanners(order.map((b) => b.id))
      if (res.ok) {
        toast.success("Banner order saved.")
        router.refresh()
      } else {
        toast.error(res.error)
        setOrder(rows)
      }
    })
  }

  return (
    <>
      <DataTable
        table={table}
        reorder={owner ? { values: visible, onReorder: (next) => { if (canReorder) setOrder(next) }, onDragEnd: saveOrder, enabled: canReorder } : undefined}
        empty="No banners match."
        toolbar={
          <DataTableToolbar table={table} labels={{ status: "Status" }} sortable={false}>
            <DataTableSearch value={search} onChange={setSearch} placeholder="Search banners..." />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-8 rounded-md" />}>
                <HugeiconsIcon icon={PlusSignCircleIcon} strokeWidth={2} className="size-4" />
                Status
                {statuses.map((v) => (
                  <Badge key={v} variant="secondary" className="rounded-sm px-1.5 font-normal">{STATUS_LABEL[v as BannerRow["status"]]}</Badge>
                ))}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {(Object.keys(STATUS_LABEL) as BannerRow["status"][]).map((v) => (
                  <DropdownMenuCheckboxItem key={v} checked={statuses.includes(v)} onCheckedChange={(on) => setStatuses((all) => (on ? [...all, v] : all.filter((x) => x !== v)))}>
                    <span className="flex-1">{STATUS_LABEL[v]}</span>
                    <span className="font-mono text-xs text-muted-foreground">{order.filter((b) => b.status === v).length}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {statuses.length || search ? (
              <Button variant="ghost" size="sm" className="h-8" onClick={() => { setStatuses([]); setSearch("") }}>Reset</Button>
            ) : null}
          </DataTableToolbar>
        }
      />

      <Sheet open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit banner</SheetTitle>
            <SheetDescription>Changes show on your home page as soon as you save.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            {editing ? <BannerForm key={editing.id} banner={editing} destinations={destinations} storeTheme={storeTheme} look={homeLook(order, editing.id)} onDone={() => setEditing(null)} /> : null}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete “${deleting?.title ?? ""}”?`}</AlertDialogTitle>
            <AlertDialogDescription>It leaves your home page. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const target = deleting
                if (!target) return
                start(async () => {
                  const res = await deleteBanner(target.id)
                  if (!res.ok) return void toast.error(res.error)
                  setDeleting(null)
                  toast.success("Banner deleted.")
                  router.refresh()
                })
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
