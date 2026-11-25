"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { adjustStock, setStockTracking } from "@/lib/restaurant/admin-actions"
import { toast } from "@/lib/toast"

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
const digits = (v: string) => v.replace(/\D/g, "")

type Result = { ok: true } | { ok: false; error: string }

export type StockChange = { delta: number; after: number; reason: string; at: string }
export type StockRow = { id: string; quantity: number | null; history: StockChange[] }

/** One product's stock: start or stop counting it, add or remove units, and see the recent changes. */
export function StockPanel({ row, item, onDone }: { row: StockRow; item: string; onDone: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [opening, setOpening] = useState("")
  const run = (fn: () => Promise<Result>, ok: string, clear = true) =>
    start(async () => {
      const res = await fn()
      if (res.ok) {
        toast.success(ok)
        if (clear) {
          setAmount("")
          setReason("")
          setOpening("")
        }
        router.refresh()
      } else toast.error(res.error)
    })
  const n = Number(amount)

  if (row.quantity === null)
    return (
      <FieldGroup>
        <p className="text-sm text-muted-foreground">Stock is not tracked for this {item}. Turn tracking on and the count goes down with every order. At zero the {item} is marked sold out by itself.</p>
        <Field>
          <FieldLabel htmlFor="st-open">Opening quantity</FieldLabel>
          <Input id="st-open" inputMode="numeric" value={opening} placeholder="e.g. 40" onChange={(e) => setOpening(digits(e.target.value))} />
        </Field>
        <Button className="w-fit" disabled={pending || opening === ""} onClick={() => run(() => setStockTracking(row.id, Number(opening)), "Stock tracking started.")}>
          Start tracking
        </Button>
      </FieldGroup>
    )

  return (
    <FieldGroup>
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">In stock now</p>
        <p className="text-3xl font-semibold tracking-tight">{row.quantity}</p>
      </div>
      <Field>
        <FieldLabel htmlFor="st-amount">Quantity</FieldLabel>
        <Input id="st-amount" inputMode="numeric" value={amount} placeholder="e.g. 10" onChange={(e) => setAmount(digits(e.target.value))} />
      </Field>
      <Field>
        <FieldLabel htmlFor="st-reason">Reason (optional)</FieldLabel>
        <Input id="st-reason" value={reason} placeholder="Delivery from supplier" maxLength={80} onChange={(e) => setReason(e.target.value)} />
        <FieldDescription>Every change is recorded below with its reason.</FieldDescription>
      </Field>
      <div className="flex gap-2">
        <Button disabled={pending || !n} onClick={() => run(() => adjustStock(row.id, n, reason || "Manual restock"), "Stock added.")}>Add stock</Button>
        <Button variant="outline" disabled={pending || !n} onClick={() => run(() => adjustStock(row.id, -n, reason || "Manual deduction"), "Stock removed.")}>Remove stock</Button>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Recent changes</p>
        {row.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {row.history.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{h.reason}</span>
                  <span className="text-xs text-muted-foreground">{dateTimeFmt.format(new Date(h.at))}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={h.delta < 0 ? "font-medium text-destructive" : "font-medium text-success"}>{h.delta > 0 ? `+${h.delta}` : h.delta}</span>
                  <span className="block text-xs text-muted-foreground">left {h.after}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button variant="ghost" className="w-fit" disabled={pending} onClick={() => window.confirm(`Stop tracking this ${item}? It will go back to Available / Sold out only.`) && run(() => setStockTracking(row.id, null), "Stock tracking stopped.", false)}>
        Stop tracking
      </Button>
      <Button variant="outline" className="w-fit" onClick={onDone}>Close</Button>
    </FieldGroup>
  )
}
