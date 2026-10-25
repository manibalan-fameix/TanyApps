"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import { riderSignIn, riderSignOut, riderUpdate } from "@/app/(tenant)/sites/[dealer]/delivery/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type RiderOrder = { id: string; code: string; customerName: string; phone: string; address: string; pincode: string; lat: number | null; lng: number | null; note: string; total: number; paid: boolean; status: string; items: string }

export function RiderSignIn({ code, restaurant }: { code: string; restaurant: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [id, setId] = useState(code)
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setError("")
        start(async () => {
          const res = await riderSignIn(id, pin)
          if (res.ok) router.refresh()
          else setError(res.error)
        })
      }}
    >
      <p className="text-sm text-muted-foreground">Sign in to see the orders {restaurant} has given you.</p>
      <div className="grid gap-2">
        <label htmlFor="rd-id" className="text-sm font-medium">Rider ID</label>
        <Input id="rd-id" value={id} autoCapitalize="characters" onChange={(e) => setId(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <label htmlFor="rd-pin" className="text-sm font-medium">PIN</label>
        <Input id="rd-pin" type="password" inputMode="numeric" maxLength={6} autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" size="lg" disabled={pending || pin.length < 4}>{pending ? "Signing in..." : "Sign in"}</Button>
    </form>
  )
}

export function RiderOrders({ name, orders }: { name: string; orders: RiderOrder[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (o: RiderOrder, cash: boolean) =>
    start(async () => {
      const res = await riderUpdate(o.id, cash)
      if (res.ok) {
        toast.success(o.status === "out_for_delivery" ? "Marked delivered." : "On the way.")
        router.refresh()
      } else toast.error(res.error)
    })
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Signed in as {name}</p>
        <Button variant="ghost" size="sm" onClick={() => riderSignOut().then(() => router.refresh())}>Sign out</Button>
      </div>
      {orders.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">No orders assigned right now. This list updates when you pull to refresh.</p>
      ) : (
        orders.map((o) => (
          <section key={o.id} className="grid gap-3 rounded-2xl border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{o.code} · {o.customerName}</p>
                <a href={`tel:${o.phone}`} className="text-sm underline">{o.phone}</a>
              </div>
              <Badge variant={o.status === "out_for_delivery" ? "default" : "secondary"}>{o.status === "out_for_delivery" ? "On the way" : "Ready to take"}</Badge>
            </div>
            <p className="text-sm">{o.address}{o.pincode ? ` · ${o.pincode}` : ""}</p>
            {o.lat !== null && o.lng !== null ? (
              <a className="w-fit text-sm font-medium underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`}>Navigate to the guest&apos;s location</a>
            ) : (
              <a className="w-fit text-sm font-medium underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address} ${o.pincode}`)}`}>Find the address in Maps</a>
            )}
            <p className="text-sm text-muted-foreground">{o.items}</p>
            {o.note ? <p className="rounded-md bg-muted p-2 text-sm">Note: {o.note}</p> : null}
            <p className="text-sm font-medium">{o.paid ? "Already paid" : `Collect ₹${o.total.toLocaleString("en-IN")} in cash`}</p>
            {o.status === "out_for_delivery" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button size="lg" disabled={pending} onClick={() => run(o, !o.paid)}>{o.paid ? "Delivered" : "Delivered, cash collected"}</Button>
                {!o.paid ? <Button size="lg" variant="outline" disabled={pending} onClick={() => run(o, false)}>Delivered, not paid</Button> : null}
              </div>
            ) : (
              <Button size="lg" disabled={pending} onClick={() => run(o, false)}>I have picked it up</Button>
            )}
          </section>
        ))
      )}
    </div>
  )
}
