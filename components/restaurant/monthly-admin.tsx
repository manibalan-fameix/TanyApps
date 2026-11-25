"use client"

import { type ColumnDef, type SortingState, type VisibilityState, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { DataTableSearch } from "@/components/data-table/data-table-search"
import { selectColumn } from "@/components/data-table/data-table-select-column"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { saveMonthlyOffer } from "@/lib/restaurant/admin-actions"
import { formatRupees } from "@/lib/restaurant/menu"
import { monthlyDiscount, ordinal } from "@/lib/restaurant/monthly"
import type { MonthlyOffer } from "@/lib/restaurant/settings"
import { toast } from "@/lib/toast"

const digits = (v: string) => v.replace(/\D/g, "")

/** The shop's offer to monthly subscribers. One percentage, an optional cap, and free delivery. */
export function MonthlyOfferForm({ initial, disabled }: { initial: MonthlyOffer; disabled: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [s, setS] = useState({ enabled: initial.enabled, percentOff: String(initial.percentOff), maxDiscount: initial.maxDiscount === null ? "" : String(initial.maxDiscount), freeDelivery: initial.freeDelivery })
  const offer: MonthlyOffer = { enabled: s.enabled, percentOff: Math.min(50, Number(s.percentOff || 0)), maxDiscount: s.maxDiscount ? Number(s.maxDiscount) : null, freeDelivery: s.freeDelivery }
  return (
    <FieldGroup className="max-w-md">
      <Field orientation="horizontal">
        <Checkbox id="mo-enabled" checked={s.enabled} disabled={disabled} onCheckedChange={(v) => setS({ ...s, enabled: Boolean(v) })} />
        <div className="grid gap-0.5">
          <FieldLabel htmlFor="mo-enabled">Offer monthly groceries</FieldLabel>
          <FieldDescription>Shows a Monthly tab in your store. Customers build a list once and you deliver it on their chosen date every month.</FieldDescription>
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor="mo-percent">Discount for subscribers (% off every bill)</FieldLabel>
        <Input id="mo-percent" inputMode="numeric" disabled={disabled} value={s.percentOff} onChange={(e) => setS({ ...s, percentOff: digits(e.target.value) })} />
        <FieldDescription>Between 0 and 50. Taken off the items total of every monthly order.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="mo-max">Most you will give off one bill (₹, optional)</FieldLabel>
        <Input id="mo-max" inputMode="numeric" disabled={disabled} value={s.maxDiscount} onChange={(e) => setS({ ...s, maxDiscount: digits(e.target.value) })} />
      </Field>
      <Field orientation="horizontal">
        <Checkbox id="mo-free" checked={s.freeDelivery} disabled={disabled} onCheckedChange={(v) => setS({ ...s, freeDelivery: Boolean(v) })} />
        <FieldLabel htmlFor="mo-free">Free delivery on monthly orders</FieldLabel>
      </Field>
      <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
        Example: a ₹2,000 monthly bill gets <span className="font-semibold text-foreground">{formatRupees(monthlyDiscount(2000, { ...offer, enabled: true }))}</span> off{offer.freeDelivery ? " and free delivery" : ""}.
      </p>
      <Button
        type="button"
        className="w-fit"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            const res = await saveMonthlyOffer(offer)
            if (res.ok) {
              toast.success("Monthly offer saved.")
              router.refresh()
            } else toast.error(res.error)
          })
        }
      >
        Save offer
      </Button>
    </FieldGroup>
  )
}

export type SubscriberRow = {
  id: string
  name: string
  phone: string
  status: "active" | "paused" | "cancelled"
  deliveryDay: number
  next: string
  items: number
  /** What the next bill comes to at today's prices, after the offer. */
  monthly: number
  pincode: string
  problem: string | null
}

const STATUS = { active: "default", paused: "secondary", cancelled: "outline" } as const

/** Everyone on a monthly list, with when they are next delivered and what their bill is worth. */
export function SubscribersTable({ rows }: { rows: SubscriberRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "monthly", desc: true }])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [q, setQ] = useState("")
  const [rowSelection, setRowSelection] = useState({})
  const columns = useMemo<ColumnDef<SubscriberRow>[]>(
    () => [
      selectColumn<SubscriberRow>(),
      { accessorKey: "name", header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { accessorKey: "phone", header: ({ column }) => <DataTableColumnHeader column={column} title="Mobile" /> },
      { accessorKey: "status", header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, cell: ({ row }) => <Badge variant={STATUS[row.original.status]} className="capitalize">{row.original.status}</Badge> },
      { accessorKey: "deliveryDay", header: ({ column }) => <DataTableColumnHeader column={column} title="Day" />, cell: ({ row }) => ordinal(row.original.deliveryDay) },
      { accessorKey: "next", header: ({ column }) => <DataTableColumnHeader column={column} title="Next delivery" />, enableSorting: false },
      { accessorKey: "items", header: ({ column }) => <DataTableColumnHeader column={column} title="Items" /> },
      { accessorKey: "monthly", header: ({ column }) => <DataTableColumnHeader column={column} title="Monthly bill" />, cell: ({ row }) => <span className="font-semibold">{formatRupees(row.original.monthly)}</span> },
      { accessorKey: "pincode", header: ({ column }) => <DataTableColumnHeader column={column} title="Pincode" /> },
      { accessorKey: "problem", header: ({ column }) => <DataTableColumnHeader column={column} title="Last problem" />, enableSorting: false, cell: ({ row }) => (row.original.problem ? <span className="text-destructive">{row.original.problem}</span> : <span className="text-muted-foreground">None</span>) },
    ],
    [],
  )
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (r) => r.id,
    state: { sorting, columnVisibility, rowSelection, globalFilter: q.trim() },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    initialState: { pagination: { pageSize: 10 } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
  })
  return (
    <DataTable
      table={table}
      toolbar={
        <DataTableToolbar table={table}>
          <DataTableSearch value={q} onChange={setQ} placeholder="Search name, mobile or pincode" className="sm:w-64" />
        </DataTableToolbar>
      }
    />
  )
}
