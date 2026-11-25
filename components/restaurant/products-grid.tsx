"use client"

import { Clock01Icon, Copy01Icon, Delete02Icon, Image01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ColumnDef } from "@tanstack/react-table-v9"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState, useTransition } from "react"

import { createMenuItem, deleteMenuItem, saveProductCells } from "@/app/(admin)/(shell)/menu/actions"
import { DataGrid } from "@/components/data-grid/data-grid"
import { getDataGridActionsColumn } from "@/components/data-grid/data-grid-actions-column"
import { DataGridFilterMenu } from "@/components/data-grid/data-grid-filter-menu"
import { DataGridKeyboardShortcuts } from "@/components/data-grid/data-grid-keyboard-shortcuts"
import { DataGridRowHeightMenu } from "@/components/data-grid/data-grid-row-height-menu"
import { getDataGridSelectColumn } from "@/components/data-grid/data-grid-select-column"
import { DataGridSortMenu } from "@/components/data-grid/data-grid-sort-menu"
import { DataGridViewMenu } from "@/components/data-grid/data-grid-view-menu"
import { CategoryIcon } from "@/components/restaurant/category-icon"
import { MenuItemForm, type CategoryOption } from "@/components/restaurant/menu-item-form"
import { type StockChange, StockPanel } from "@/components/restaurant/stock-panel"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useDataGrid } from "@/hooks/use-data-grid"
import type { DataGridFeatures } from "@/lib/data-grid-features"
import { getFilterFn } from "@/lib/data-grid-filters"
import type { CellChange, DataChangeDetails, DataGridColumnMeta } from "@/lib/data-grid-types"
import type { ProductDetails } from "@/lib/restaurant/bulk-import"
import { type CellEdit, DETAIL_TEXT, DETAIL_TEXT_FIELDS, type DetailTextField, GRID_FIELDS, type GridField, MAX_CELL_EDITS } from "@/lib/restaurant/grid-edit"
import type { MenuItemDraft } from "@/lib/restaurant/menu"
import { toast } from "@/lib/toast"
import { storeTerms } from "@/lib/verticals/terms"

export type MenuRow = {
  id: string
  name: string
  imageUrl: string | null
  categoryId: string | null
  price: number
  mrp: number | null
  /** Null when stock is not counted for this product. */
  quantity: number | null
  isVeg: boolean
  isAvailable: boolean
  isFeatured: boolean
  description: string
  details: ProductDetails
  history: StockChange[]
  draft: MenuItemDraft
}

/** One line of the grid: the cells the owner can type in. A new line keeps a "new-" id until it is saved. */
type Line = {
  id: string
  name: string
  categoryId: string
  price: number | null
  mrp: number | null
  stock: number | null
  status: "available" | "sold_out"
  diet: "veg" | "nonveg"
  bestseller: boolean
  description: string
  gst: number | null
} & Record<DetailTextField, string>

const NONE = "none"
const NEW = "new-"
const isNew = (id: string) => id.startsWith(NEW)
const newId = () => `${NEW}${crypto.randomUUID()}`

const toLine = (r: MenuRow): Line => ({
  id: r.id,
  name: r.name,
  categoryId: r.categoryId ?? NONE,
  price: r.price,
  mrp: r.mrp,
  stock: r.quantity,
  status: r.isAvailable ? "available" : "sold_out",
  diet: r.isVeg ? "veg" : "nonveg",
  bestseller: r.isFeatured,
  description: r.description,
  gst: r.details.gst ?? null,
  ...(Object.fromEntries(DETAIL_TEXT_FIELDS.map((f) => [f, r.details[f] ?? ""])) as Record<DetailTextField, string>),
})

const FIELD_NAME: Record<GridField, string> = { name: "Name", categoryId: "Category", price: "Price", mrp: "Original price", stock: "Stock", status: "Status", diet: "Type", bestseller: "Bestseller", description: "Description", gst: "GST %", ...(Object.fromEntries(DETAIL_TEXT_FIELDS.map((f) => [f, DETAIL_TEXT[f].label])) as Record<DetailTextField, string>) }

const toEdits = (changes: CellChange[]): CellEdit[] =>
  changes.flatMap((c) =>
    (GRID_FIELDS as readonly string[]).includes(c.columnId)
      ? [{ id: c.rowId, field: c.columnId as GridField, previous: (c.previousValue ?? null) as CellEdit["previous"], value: (c.newValue ?? null) as CellEdit["value"] }]
      : [],
  )

/** A category's icon in its colour, small enough to sit inside the grid's category pill and its menu. */
const categoryBadgeIcon = (name: string) =>
  function CategoryBadgeIcon() {
    return <CategoryIcon name={name} className="size-4 rounded-sm" iconClassName="size-3" />
  }

/** The catalogue as a spreadsheet (the tablecn data grid): type in a cell and it saves. Photos, descriptions and sizes are under Edit. */
export function ProductsGrid({ rows, categories, industry, businessType, canAdd }: { rows: MenuRow[]; categories: CategoryOption[]; industry?: string; businessType?: string | null; canAdd: boolean }) {
  const t = storeTerms(industry, businessType)
  const router = useRouter()
  const [pending, start] = useTransition()

  // What is on screen: the saved products, plus lines still being filled in. It follows the server whenever the list is reloaded.
  const [data, setData] = useState<Line[]>(() => rows.map(toLine))
  const [seen, setSeen] = useState(rows)
  if (seen !== rows) {
    setSeen(rows)
    setData((current) => [...rows.map(toLine), ...current.filter((l) => isNew(l.id))])
  }
  const reset = () => setData((current) => [...rows.map(toLine), ...current.filter((l) => isNew(l.id))])

  const [review, setReview] = useState<CellEdit[] | null>(null)
  const [removing, setRemoving] = useState<string[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [stockId, setStockId] = useState<string | null>(null)
  const editing = rows.find((r) => r.id === editingId) ?? null
  const stocking = rows.find((r) => r.id === stockId) ?? null

  // One save at a time, in the order the cells were changed.
  const queue = useRef(Promise.resolve())
  const save = (edits: CellEdit[]) => {
    queue.current = queue.current.then(async () => {
      const res = await saveProductCells(edits).catch(() => ({ ok: false as const, error: "Could not save those changes. Try again." }))
      if (res.ok) toast.success(edits.length === 1 ? "Saved." : `${edits.length} changes saved.`)
      else {
        toast.error(res.error)
        reset()
      }
      router.refresh()
    })
  }

  function onDataChange(next: Line[], details: DataChangeDetails<Line>) {
    if (details.reason === "delete-rows") {
      const ids = details.removedRows.map((l) => l.id)
      const saved = ids.filter((id) => !isNew(id))
      // Unsaved lines simply go. Saved products stay where they are until the owner confirms.
      setData(data.filter((l) => !(isNew(l.id) && ids.includes(l.id))))
      if (saved.length) setRemoving(saved)
      return
    }
    if (details.addedRows.some((l) => !isNew(l.id))) {
      toast.error("A deleted product cannot be brought back.")
      reset()
      return
    }
    setData(next)
    const edits = toEdits(details.changes.filter((c) => !isNew(c.rowId)))
    if (edits.length === 0) return
    // Many cells at once (paste, fill, clear, undo), or emptying a stock count, is shown first and saved only when confirmed.
    if (edits.length > 1 || (edits[0].field === "stock" && edits[0].value === null)) setReview(edits)
    else save(edits)
  }

  const categoryOptions = useMemo(() => [{ value: NONE, label: "No category" }, ...categories.map((c) => ({ value: c.id, label: c.name, icon: categoryBadgeIcon(c.name) }))], [categories])
  const nameOf = (id: string) => data.find((l) => l.id === id)?.name || "New line"
  const shown = (field: GridField, value: unknown) => {
    if (value === null || value === "" || value === undefined) return "empty"
    if (field === "categoryId") return categoryOptions.find((o) => o.value === value)?.label ?? "No category"
    if (field === "status") return value === "available" ? "Available" : "Sold out"
    if (field === "diet") return value === "veg" ? "Veg" : "Non-veg"
    if (typeof value === "boolean") return value ? "Yes" : "No"
    return String(value)
  }

  // Pictures come from the saved products, not from the editable cells: they are changed under Edit.
  const photos = useMemo(() => new Map(rows.map((r) => [r.id, r.imageUrl])), [rows])

  const columns = useMemo<ColumnDef<DataGridFeatures, Line>[]>(() => {
    const filterFn = getFilterFn<Line>()
    // The picture sits in the product's own cell, before its name. A line not saved yet has no product to add one to.
    const photo = (rowId: string) => {
      const url = photos.get(rowId)
      const picture = url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <HugeiconsIcon icon={Image01Icon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
      )
      const frame = "flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted"
      if (isNew(rowId)) return <span className={frame}>{picture}</span>
      const label = url ? "Change photo" : "Add photo"
      // Pressing the picture opens the product; it must not also select or start editing the cell behind it.
      const keep = (e: React.SyntheticEvent) => e.stopPropagation()
      return (
        <button
          type="button"
          tabIndex={-1}
          aria-label={label}
          title={label}
          className={frame}
          onMouseDown={keep}
          onMouseUp={keep}
          onDoubleClick={keep}
          onClick={(e) => {
            keep(e)
            setEditingId(rowId)
          }}
        >
          {picture}
        </button>
      )
    }
    const column = (id: GridField, label: string, cell: DataGridColumnMeta, size: number): ColumnDef<DataGridFeatures, Line> => ({
      id,
      accessorKey: id,
      header: label,
      meta: { label, ...cell },
      size,
      filterFn,
    })
    return [
      getDataGridSelectColumn<Line>({ enableRowMarkers: true }),
      column("name", t.Item, { variant: "text", leading: photo }, 300),
      column("brand", DETAIL_TEXT.brand.label, { variant: "text" }, 150),
      column("packSize", DETAIL_TEXT.packSize.label, { variant: "text" }, 180),
      column("categoryId", "Category", { variant: "select", options: categoryOptions }, 200),
      column("price", "Price (₹)", { variant: "number", min: 0 }, 130),
      column("mrp", "Original price (₹)", { variant: "number", min: 1 }, 170),
      column("stock", "Stock", { variant: "number", min: 0 }, 120),
      column("status", "Status", { variant: "select", options: [{ value: "available", label: "Available" }, { value: "sold_out", label: "Sold out" }] }, 150),
      ...(t.diet ? [column("diet", "Type", { variant: "select", options: [{ value: "veg", label: "Veg" }, { value: "nonveg", label: "Non-veg" }] }, 130)] : []),
      column("bestseller", "Bestseller", { variant: "boolean" }, 130),
      column("unit", DETAIL_TEXT.unit.label, { variant: "text" }, 110),
      column("description", "Description", { variant: "long-text" }, 280),
      column("barcode", DETAIL_TEXT.barcode.label, { variant: "text" }, 160),
      column("hsn", DETAIL_TEXT.hsn.label, { variant: "text" }, 130),
      column("gst", "GST %", { variant: "number", min: 0, max: 100 }, 110),
      column("shelfLife", DETAIL_TEXT.shelfLife.label, { variant: "text" }, 150),
      column("origin", DETAIL_TEXT.origin.label, { variant: "text" }, 180),
      getDataGridActionsColumn<Line>({
        actions: ({ row, table }) => (
          <>
            {isNew(row.id) ? null : (
              <>
                <DropdownMenuItem onClick={() => setEditingId(row.id)}>
                  <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStockId(row.id)}>
                  <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} />
                  Stock history
                </DropdownMenuItem>
              </>
            )}
            {canAdd ? (
              // A copy is only a new line on screen: nothing is created until "Save new".
              <DropdownMenuItem onClick={() => table.addRows([{ ...row.original, id: newId(), name: `${row.original.name} copy`.trim().slice(0, 80), stock: null }], { afterRowId: row.id })}>
                <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                Duplicate
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => table.deleteRows([row.id])}>
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              {isNew(row.id) ? "Discard line" : "Delete"}
            </DropdownMenuItem>
          </>
        ),
      }),
    ]
  }, [t.Item, t.diet, categoryOptions, canAdd, photos])

  const blankLine = (): Line => ({ id: newId(), name: "", categoryId: NONE, price: null, mrp: null, stock: null, status: "available", diet: "veg", bestseller: false, description: "", gst: null, ...(Object.fromEntries(DETAIL_TEXT_FIELDS.map((f) => [f, ""])) as Record<DetailTextField, string>) })

  const grid = useDataGrid<Line>({
    data,
    columns,
    getRowId: (l) => l.id,
    onDataChange,
    createRow: canAdd ? blankLine : undefined,
    enableSearch: true,
    enablePaste: true,
    initialState: { columnPinning: { start: ["select", "name"], end: ["actions"] } },
  })

  const unsaved = data.filter((l) => isNew(l.id))
  const ready = unsaved.filter((l) => l.name.trim().length >= 2 && l.price !== null)

  const saveNew = () =>
    start(async () => {
      for (const line of ready) {
        const res = await createMenuItem({
          name: line.name,
          categoryId: line.categoryId === NONE ? null : line.categoryId,
          price: line.price,
          description: line.description,
          compareAtPrice: line.mrp,
          isAvailable: line.status === "available",
          isVeg: line.diet === "veg",
          isFeatured: line.bestseller,
        })
        if (!res.ok) {
          toast.error(`${line.name}: ${res.error}`)
          break
        }
        setData((current) => current.filter((l) => l.id !== line.id))
        // Stock and the product facts are saved onto the new product, under the same rules as editing its cells.
        const rest: CellEdit[] = [
          ...(line.stock !== null ? [{ id: res.id, field: "stock" as const, previous: null, value: line.stock }] : []),
          ...(line.gst !== null ? [{ id: res.id, field: "gst" as const, value: line.gst }] : []),
          ...DETAIL_TEXT_FIELDS.filter((f) => line[f].trim()).map((f) => ({ id: res.id, field: f, value: line[f] })),
        ]
        if (rest.length) {
          const filled = await saveProductCells(rest)
          if (!filled.ok) toast.error(filled.error)
        }
        toast.success(`${line.name} added.`)
      }
      router.refresh()
    })

  const remove = (ids: string[]) =>
    start(async () => {
      for (const id of ids) {
        const res = await deleteMenuItem(id)
        if (!res.ok) {
          toast.error(res.error)
          break
        }
      }
      setRemoving(null)
      router.refresh()
    })

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <div role="toolbar" aria-label="Grid tools" className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Double-click a cell to edit. It saves when you leave it. Search with ⌘F or Ctrl+F.</p>
        <div className="flex flex-wrap items-center gap-2">
          <DataGridKeyboardShortcuts enableSearch enablePaste enableRowCreation={canAdd} enableRowDeletion />
          <DataGridFilterMenu table={grid.table} />
          <DataGridSortMenu table={grid.table} />
          <DataGridRowHeightMenu table={grid.table} />
          <DataGridViewMenu table={grid.table} />
        </div>
      </div>
      {unsaved.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <span>
            {unsaved.length} new {unsaved.length === 1 ? "line is" : "lines are"} not saved. Each needs a name and a price.
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pending} onClick={() => setData((current) => current.filter((l) => !isNew(l.id)))}>
              Discard
            </Button>
            <Button size="sm" disabled={pending || ready.length === 0} onClick={saveNew}>
              {pending ? "Saving..." : `Save ${ready.length} new`}
            </Button>
          </div>
        </div>
      ) : null}

      <DataGrid {...grid} stretchColumns height={Math.min(640, 44 + 37 * Math.max(data.length, 6))} aria-label={t.catalogue} />

      <AlertDialog open={review !== null} onOpenChange={(open) => { if (!open) { setReview(null); reset() } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{review && review.length > 1 ? `Save ${review.length} changes?` : "Save this change?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {review && review.length > MAX_CELL_EDITS ? `That is too many at once. Change at most ${MAX_CELL_EDITS} cells at a time.` : "They show in your store as soon as they are saved. Emptying a stock count stops counting that product."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-60 divide-y overflow-y-auto rounded-md border text-sm">
            {review?.slice(0, 50).map((e) => (
              <li key={`${e.id}-${e.field}`} className="px-3 py-2">
                <span className="font-medium">{nameOf(e.id)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {FIELD_NAME[e.field]}: {shown(e.field, e.previous)} → {shown(e.field, e.value)}
                </span>
              </li>
            ))}
            {review && review.length > 50 ? <li className="px-3 py-2 text-muted-foreground">and {review.length - 50} more</li> : null}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Undo changes</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(review && review.length > MAX_CELL_EDITS)}
              onClick={() => {
                if (review) save(review)
                setReview(null)
              }}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removing?.length === 1 ? `Delete ${nameOf(removing[0])}?` : `Delete ${removing?.length ?? 0} ${t.items}?`}</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => removing && remove(removing)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={editing !== null} onOpenChange={(open) => { if (!open) setEditingId(null) }}>
        <SheetContent className="overflow-y-auto data-[side=right]:sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{`Edit ${t.item}`}</SheetTitle>
            <SheetDescription>{editing?.name}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            {editing ? <MenuItemForm key={editing.id} industry={industry} businessType={businessType} itemId={editing.id} categories={categories} initial={editing.draft} onDone={() => setEditingId(null)} /> : null}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={stocking !== null} onOpenChange={(open) => { if (!open) setStockId(null) }}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{stocking?.name}</SheetTitle>
            <SheetDescription>Stock levels and changes</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{stocking ? <StockPanel key={stocking.id} row={stocking} item={t.item} onDone={() => setStockId(null)} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
