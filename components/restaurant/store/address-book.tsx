"use client"

import { useState, useTransition } from "react"
import { Delete02Icon, Location01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { deleteDeliveryAddress } from "@/app/(tenant)/sites/[dealer]/address-actions"
import { AddressFormDialog } from "@/components/restaurant/store/address-form-dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { mapsUrl } from "@/lib/restaurant/location"
import { MAX_SAVED_ADDRESSES, type SavedAddress } from "@/lib/restaurant/saved-address"
import { toast } from "@/lib/toast"

/** The customer's saved delivery addresses: add, change and delete. */
export function AddressBook({ initial, centre, themeVars }: { initial: SavedAddress[]; centre: { lat: number; lng: number } | null; themeVars: React.CSSProperties }) {
  const [addresses, setAddresses] = useState(initial)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SavedAddress | null>(null)
  const [removing, setRemoving] = useState<SavedAddress | null>(null)
  const [pending, start] = useTransition()

  function edit(a: SavedAddress | null) {
    setEditing(a)
    setOpen(true)
  }

  function remove(a: SavedAddress) {
    start(async () => {
      const res = await deleteDeliveryAddress(a.id).catch(() => null)
      setRemoving(null)
      if (!res) return void toast.error("Could not delete the address. Please try again.")
      if (!res.ok) return void toast.error(res.error)
      setAddresses(res.addresses)
      toast.success("Address deleted.")
    })
  }

  return (
    <div className="grid gap-4">
      {addresses.length === 0 ? (
        <p className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">No saved addresses yet. Add one with a map pin so your orders reach the right door.</p>
      ) : (
        <ul className="grid gap-3">
          {addresses.map((a) => (
            <li key={a.id} className="flex items-start gap-3 rounded-2xl border bg-card p-4">
              <HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{a.label}</p>
                <p className="text-sm text-muted-foreground">{a.line} · {a.pincode}</p>
                <a className="text-sm font-medium underline" href={mapsUrl(a.lat, a.lng)} target="_blank" rel="noreferrer">Check the pin on the map</a>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${a.label}`} onClick={() => edit(a)}>
                <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${a.label}`} onClick={() => setRemoving(a)}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {addresses.length < MAX_SAVED_ADDRESSES ? (
        <Button type="button" size="lg" onClick={() => edit(null)}>Add a new address</Button>
      ) : (
        <p className="text-center text-sm text-muted-foreground">You have {MAX_SAVED_ADDRESSES} saved addresses. Delete one to add another.</p>
      )}

      <AddressFormDialog open={open} onOpenChange={setOpen} editing={editing} centre={centre} themeVars={themeVars} onSaved={(list) => setAddresses(list)} />

      <AlertDialog open={removing !== null} onOpenChange={(next) => !next && setRemoving(null)}>
        <AlertDialogContent style={themeVars}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this address?</AlertDialogTitle>
            <AlertDialogDescription>{removing ? `${removing.label}: ${removing.line}. Past orders are not changed.` : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => removing && remove(removing)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
