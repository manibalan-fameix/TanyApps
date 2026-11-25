"use client"

import { MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { Fragment, useState } from "react"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Common = { label: string; disabled?: boolean; testId?: string }

/** Does one thing, or goes somewhere. With `confirm`, it asks first. A `destructive` one sits below a line. */
type CommandAction = Common & { onClick?: () => void; href?: string; destructive?: boolean; confirm?: { title: string; description?: string }; options?: undefined }

/** Changes one value of the row: a submenu with the current choice ticked. */
type ChoiceAction = Common & { value: string; options: { value: string; label: string }[]; onSelect: (value: string) => void; destructive?: undefined }

export type RowAction = CommandAction | ChoiceAction

// tablecn's menu: small, narrow and only slightly rounded.
const PANEL = "w-40 rounded-md p-1"
const ITEM = "rounded-sm py-1 font-normal"

/** The "..." at the end of a row, holding everything that can be done with it. */
export function DataTableRowActions({ label, actions, testId }: { label: string; actions: (RowAction | false | null | undefined)[]; testId?: string }) {
  const [asking, setAsking] = useState<CommandAction | null>(null)
  const items = actions.filter((a): a is RowAction => Boolean(a))
  if (items.length === 0) return null
  const ordered = [...items.filter((a) => !a.destructive), ...items.filter((a) => a.destructive)]
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="size-8 rounded-md data-popup-open:bg-muted" aria-label={label} data-testid={testId} />}>
          <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={PANEL}>
          {ordered.map((a, i) => (
            <Fragment key={a.label}>
              {a.destructive && i > 0 && !ordered[i - 1].destructive ? <DropdownMenuSeparator /> : null}
              {a.options ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className={ITEM} disabled={a.disabled} data-testid={a.testId}>
                    {a.label}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className={PANEL}>
                    <DropdownMenuRadioGroup value={a.value} onValueChange={(v) => { if (v !== a.value) a.onSelect(String(v)) }}>
                      {a.options.map((o) => (
                        <DropdownMenuRadioItem key={o.value} value={o.value} className={ITEM}>
                          {o.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                <DropdownMenuItem
                  className={ITEM}
                  disabled={a.disabled}
                  onClick={a.confirm ? () => setAsking(a) : a.onClick}
                  render={a.href ? <Link href={a.href} /> : undefined}
                  data-testid={a.testId}
                >
                  {a.label}
                </DropdownMenuItem>
              )}
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={asking !== null} onOpenChange={(open) => { if (!open) setAsking(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{asking?.confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{asking?.confirm?.description ?? "This cannot be undone."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                asking?.onClick?.()
                setAsking(null)
              }}
            >
              {asking?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** The actions column on its own, for a list whose rows only open a page. */
export const rowActionsColumn = <T,>(cell: (row: T) => { label: string; actions: (RowAction | false | null | undefined)[] }) => ({
  colId: "actions",
  headerName: "",
  cellRenderer: ({ data }: { data: T | undefined }) => (data ? <DataTableRowActions {...cell(data)} /> : null),
  width: 56,
  sortable: false,
  filter: false as const,
  pinned: "right" as const,
})
