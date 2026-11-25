"use client"

import { Button } from "@/components/ui/button"
import { MAX_SAVED_ADDRESSES, type SavedAddress } from "@/lib/restaurant/saved-address"
import { cn } from "@/lib/utils"

/**
 * At checkout and on the monthly list: which saved address to deliver to. `selectedId` is null when delivering somewhere
 * else, and the screen then shows its own address boxes.
 */
export function SavedAddressPicker({ signedIn, addresses, selectedId, onSelect, onAdd, otherDetail = "Type an address for this order only" }: { signedIn: boolean; addresses: SavedAddress[]; selectedId: string | null; onSelect: (id: string | null) => void; onAdd: () => void; otherDetail?: string }) {
  if (!signedIn)
    return (
      <p className="text-sm text-muted-foreground">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route that redirects to another host; <Link> cannot follow it */}
        <a href="/api/t/auth/start?next=%2Fcheckout" className="font-semibold text-info">Sign in</a> to use and save your delivery addresses.
      </p>
    )

  const row = (id: string | null, title: string, detail: string) => (
    <button
      key={id ?? "other"}
      type="button"
      role="radio"
      aria-checked={selectedId === id}
      onClick={() => onSelect(id)}
      className={cn("grid gap-0.5 rounded-xl border p-3.5 text-left text-sm transition-colors hover:bg-muted/50 md:text-base", selectedId === id && "border-primary bg-primary/5 ring-1 ring-primary")}
    >
      <span className="font-bold">{title}</span>
      <span className="text-xs text-muted-foreground md:text-sm">{detail}</span>
    </button>
  )

  return (
    <div className="grid gap-2">
      {addresses.length > 0 ? (
        <div className="grid gap-2" role="radiogroup" aria-label="Deliver to">
          {addresses.map((a) => row(a.id, a.label, `${a.line} · ${a.pincode}`))}
          {row(null, "Somewhere else", otherDetail)}
        </div>
      ) : null}
      {addresses.length < MAX_SAVED_ADDRESSES ? (
        <Button type="button" variant="outline" onClick={onAdd}>{addresses.length > 0 ? "Add a new address" : "Save an address with a map pin"}</Button>
      ) : null}
    </div>
  )
}
