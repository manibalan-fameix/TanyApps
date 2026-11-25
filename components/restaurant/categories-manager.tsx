"use client"

import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { DragDropVerticalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMemo, useState, useTransition } from "react"

import {
  createCategory,
  deleteCategory,
  renameCategory,
  reorderCategories,
} from "@/app/(admin)/(shell)/menu/actions"
import { CategoryIcon } from "@/components/restaurant/category-icon"
import { DataTable, DataTableDragHandle } from "@/components/data-table/data-table"
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { selectColumn } from "@/components/data-table/data-table-select-column"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { PopupToolbar } from "@/components/restaurant/popup"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { toast } from "@/lib/toast"
import { storeTerms } from "@/lib/verticals/terms"

export type CategoryRow = { id: string; name: string; itemCount: number }

export function CategoriesManager({ categories, industry, businessType, dialogs }: { categories: CategoryRow[]; industry?: string; businessType?: string | null; dialogs?: CategoryDialogsState }) {
  const t = storeTerms(industry, businessType)
  const [pending, start] = useTransition()
  // One box does two jobs: it filters the table as you type, and Add creates a category with what you typed.
  const [name, setName] = useState("")
  // Edit opens in a side slider and delete asks in a pop-up; nothing is edited inside the table. Inside a pop-up the parent owns that
  // state and renders the slider and the confirmation beside the pop-up, not inside it (see MenuActions).
  const own = useCategoryDialogs()
  const { setRenaming, setDeleting } = dialogs ?? own
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  // The order on screen. It follows the server's list, and is replaced the moment a drag ends (then saved).
  const [order, setOrder] = useState(categories)
  const [seen, setSeen] = useState(categories)
  if (seen !== categories) {
    setSeen(categories)
    setOrder(categories)
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn()
      if (res.ok) after?.()
      else toast.error(res.error ?? "Something went wrong.")
    })

  const q = name.trim().toLowerCase()
  const exact = categories.some((c) => c.name.toLowerCase() === q)

  const [rowSelection, setRowSelection] = useState({})
  const columns = useMemo<ColumnDef<CategoryRow>[]>(
    () => [
      {
        id: "drag",
        header: () => <span className="sr-only">Move</span>,
        cell: ({ row }) => (
          <DataTableDragHandle label={`Drag to move ${row.original.name}`}>
            <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={1.75} className="size-4" />
          </DataTableDragHandle>
        ),
        enableSorting: false,
        enableHiding: false,
        enableGlobalFilter: false,
        size: 44,
      },
      selectColumn<CategoryRow>(),
      {
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
        cell: ({ row }) => (
          <span className="flex items-center gap-2.5 font-medium">
            <CategoryIcon name={row.original.name} className="size-8 rounded-lg" iconClassName="size-4" />
            {row.original.name}
          </span>
        ),
        enableHiding: false,
        filterFn: "includesString",
      },
      {
        accessorKey: "itemCount",
        header: ({ column }) => <DataTableColumnHeader column={column} title={t.Items} />,
        cell: ({ row }) => <span className="text-muted-foreground tabular-nums">{row.original.itemCount}</span>,
        enableGlobalFilter: false,
        size: 120,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const c = row.original
          return (
            <DataTableRowActions
              label={`More actions for ${c.name}`}
              actions={[
                { label: "Edit", disabled: pending, onClick: () => setRenaming({ id: c.id, name: c.name }) },
                { label: "Delete", destructive: true, disabled: pending, onClick: () => setDeleting(c) },
              ]}
            />
          )
        },
        enableSorting: false,
        enableHiding: false,
        enableGlobalFilter: false,
        size: 80,
      },
    ],
    [pending, t.Items, setRenaming, setDeleting],
  )

  const table = useReactTable({
    data: order,
    columns,
    getRowId: (c) => c.id,
    state: { sorting, columnVisibility, rowSelection, globalFilter: name.trim() },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    initialState: { pagination: { pageSize: 50 } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
  })

  // Dragging changes the saved order, so it only makes sense when the table shows every category in that order: no search, no sort, and a single
  // page. Otherwise the grips are greyed out.
  const canReorder = !q && sorting.length === 0 && table.getPageCount() <= 1

  function saveOrder() {
    start(async () => {
      const res = await reorderCategories(order.map((c) => c.id))
      if (!res.ok) {
        toast.error(res.error)
        setOrder(categories)
      }
    })
  }

  return (
    <div className="grid gap-4">
      <PopupToolbar>
        <DataTableToolbar table={table} labels={{ itemCount: t.Items }}>
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              run(() => createCategory(name), () => setName(""))
            }}
          >
            <Input
              type="search"
              aria-label="Search or add a category"
              value={name}
              placeholder="Search, or type a new category and press Add"
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" disabled={pending || !name.trim() || exact}>
              Add
            </Button>
          </form>
        </DataTableToolbar>
      </PopupToolbar>

      <DataTable
        table={table}
        reorder={{ values: order, onReorder: setOrder, onDragEnd: saveOrder, enabled: canReorder }}
        empty={
          categories.length === 0
            ? `No categories yet. Add one to group your ${t.items} in the ${t.catalogue.toLowerCase()}.`
            : `No category matches “${name.trim()}”. Press Add to create it.`
        }
      />

      {dialogs ? null : <CategoryDialogs state={own} industry={industry} businessType={businessType} />}
    </div>
  )
}

export type CategoryDialogsState = {
  renaming: { id: string; name: string } | null
  setRenaming: React.Dispatch<React.SetStateAction<{ id: string; name: string } | null>>
  deleting: CategoryRow | null
  setDeleting: React.Dispatch<React.SetStateAction<CategoryRow | null>>
}

/** The edit and delete state for a categories table. Hold it where the slider and confirmation are rendered. */
export function useCategoryDialogs(): CategoryDialogsState {
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<CategoryRow | null>(null)
  return { renaming, setRenaming, deleting, setDeleting }
}

/** The Edit slider and the Delete confirmation. Render it next to the table, never inside a pop-up that holds the table. */
export function CategoryDialogs({ state, industry, businessType }: { state: CategoryDialogsState; industry?: string; businessType?: string | null }) {
  const t = storeTerms(industry, businessType)
  const { renaming, setRenaming, deleting, setDeleting } = state
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after: () => void) =>
    start(async () => {
      const res = await fn()
      if (res.ok) after()
      else toast.error(res.error ?? "Something went wrong.")
    })
  return (
    <>
      <Sheet open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <SheetContent>
          <form
            className="flex h-full flex-col"
            onSubmit={(e) => {
              e.preventDefault()
              if (renaming) run(() => renameCategory(renaming.id, renaming.name), () => setRenaming(null))
            }}
          >
            <SheetHeader>
              <SheetTitle>Edit category</SheetTitle>
              <SheetDescription>{`The ${t.items} in it keep their place. The new name shows on your ${industry === "retail" ? "store" : "menu"} page straight away.`}</SheetDescription>
            </SheetHeader>
            <div className="grid gap-2 px-4">
              <Label htmlFor="rename-category">Category name</Label>
              <Input id="rename-category" autoFocus value={renaming?.name ?? ""} onChange={(e) => setRenaming((r) => (r ? { ...r, name: e.target.value } : r))} />
            </div>
            <SheetFooter className="mt-auto flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !renaming?.name.trim()}>
                {pending ? "Saving..." : "Save"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete “${deleting?.name ?? ""}”?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.itemCount
                ? `Its ${deleting.itemCount} ${deleting.itemCount === 1 ? t.item : t.items} stay in your ${t.catalogue.toLowerCase()} but will have no category.`
                : "No products are in it. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => deleting && run(() => deleteCategory(deleting.id), () => setDeleting(null))}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
