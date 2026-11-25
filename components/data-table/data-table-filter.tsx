"use client"

import type { Column } from "@tanstack/react-table"
import { Calendar03Icon, PlusSignCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

import type { FilterValue } from "@/components/data-table/data-grid-filters"
import type { OptionsParams } from "@/components/data-table/data-grid-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

const chip = "rounded-sm px-1.5 font-normal capitalize"

/** What a filter button shows after its name once something is chosen. */
function Chosen({ values }: { values: string[] }) {
  if (values.length === 0) return null
  return (
    <>
      <Separator orientation="vertical" className="mx-0.5 data-vertical:h-4 data-vertical:self-auto" />
      {values.length > 2 ? (
        <Badge variant="secondary" className={chip}>{values.length} selected</Badge>
      ) : (
        values.map((v) => (
          <Badge key={v} variant="secondary" className={chip}>{v}</Badge>
        ))
      )}
    </>
  )
}

/** Tick the values to keep, each with how many rows have it. */
function OptionsFilter<T>({ column, title, params }: { column: Column<T, unknown>; title: string; params: OptionsParams }) {
  const selected = (column.getFilterValue() as FilterValue | undefined)?.values ?? []
  const counts = new Map<string, number>((params.options ?? []).map((o) => [o, 0]))
  for (const row of column.getFacetedRowModel().flatRows) {
    const v = row.getValue(column.id)
    if (v !== null && v !== undefined && v !== "") counts.set(String(v), (counts.get(String(v)) ?? 0) + 1)
  }
  const keys = [...counts.keys()]
  const options = params.sort ? keys.sort(params.sort) : keys
  const name = (v: string) => params.labels?.[v] ?? v
  const toggle = (value: string, on: boolean) => {
    const next = on ? [...selected, value] : selected.filter((v) => v !== value)
    column.setFilterValue(next.length ? { values: next } : undefined)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-8 rounded-md" />}>
        <HugeiconsIcon icon={PlusSignCircleIcon} strokeWidth={2} className="size-4" />
        {title}
        <Chosen values={selected.map(name)} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-y-auto">
        {options.length === 0 ? <DropdownMenuItem disabled>Nothing to filter</DropdownMenuItem> : null}
        {options.map((value) => (
          <DropdownMenuCheckboxItem key={value} checked={selected.includes(value)} onCheckedChange={(on) => toggle(value, Boolean(on))}>
            <span className="flex-1 capitalize">{name(value)}</span>
            <span className="font-mono text-xs text-muted-foreground">{counts.get(value)}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => column.setFilterValue(undefined)}>Clear filter</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A lowest and highest number, or a first and last day. */
function RangeFilter<T>({ column, title, kind }: { column: Column<T, unknown>; title: string; kind: "number" | "date" }) {
  const saved = column.getFilterValue() as FilterValue | undefined
  const [low, high] = kind === "number" ? (["min", "max"] as const) : (["from", "to"] as const)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<FilterValue>({})
  const labels = kind === "number" ? ["At least", "At most"] : ["From", "To"]
  const apply = (value: FilterValue) => {
    column.setFilterValue(value[low] || value[high] ? value : undefined)
    setOpen(false)
  }
  const chosen = saved ? [saved[low] && `${labels[0]} ${saved[low]}`, saved[high] && `${labels[1]} ${saved[high]}`].filter((v): v is string => Boolean(v)) : []
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-md"
        onClick={() => {
          setDraft(saved ?? {})
          setOpen(true)
        }}
      >
        <HugeiconsIcon icon={kind === "date" ? Calendar03Icon : PlusSignCircleIcon} strokeWidth={2} className="size-4" />
        {title}
        <Chosen values={chosen} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{`Filter by ${title.toLowerCase()}`}</DialogTitle>
            <DialogDescription>Leave a box empty for no limit.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              apply(draft)
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              {([low, high] as const).map((key, i) => (
                <div key={key} className="grid gap-1.5">
                  <Label htmlFor={`filter-${column.id}-${key}`}>{labels[i]}</Label>
                  <Input id={`filter-${column.id}-${key}`} type={kind} value={draft[key] ?? ""} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => apply({})}>Clear</Button>
              <Button type="submit">Apply</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function DataTableFilter<T>({ column, title, kind, params = {} }: { column: Column<T, unknown>; title: string; kind: "options" | "number" | "date"; params?: OptionsParams }) {
  return kind === "options" ? <OptionsFilter column={column} title={title} params={params} /> : <RangeFilter column={column} title={title} kind={kind} />
}
