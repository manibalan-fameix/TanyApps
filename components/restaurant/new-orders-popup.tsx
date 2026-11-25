"use client"

import { Popup, PopupFooter } from "@/components/restaurant/popup"
import { Button } from "@/components/ui/button"
import type { OrderAlert } from "@/lib/restaurant/admin-actions"
import type { ReturnAlert } from "@/lib/returns/shop"
import { FULFILMENT_LABEL, type Fulfilment } from "@/lib/restaurant/settings"

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" })

const RETURN_LABEL: Record<ReturnAlert["kind"], string> = {
  request: "New return request",
  help: "Needs help",
  message: "New message",
  overdue: "Still waiting for your reply",
  withdrawn: "Return cancelled by customer",
}

const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

/** Every new order and return conversation waiting to be looked at, stacked in one pop-up. Open while there is at least one. */
export function NewOrdersPopup({ orders, returns, onOpen, onOpenReturn, onDismissAll }: { orders: OrderAlert[]; returns: ReturnAlert[]; onOpen: (id: string) => void; onOpenReturn: (id: string) => void; onDismissAll: () => void }) {
  const title = [orders.length ? count(orders.length, "new order") : "", returns.length ? count(returns.length, "return update") : ""].filter(Boolean).join(" · ")
  return (
    <Popup
      open={orders.length + returns.length > 0}
      onOpenChange={(open) => !open && onDismissAll()}
      title={title}
      description="Newest first. Open one to act on it."
      size="sm"
      keepOpenOnOutsideClick
    >
      <ul aria-live="polite" className="grid gap-2">
        {returns.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <div className="grid min-w-0 gap-0.5">
              <p className="font-medium">
                {RETURN_LABEL[r.kind]} · {r.code}
              </p>
              <p className="truncate text-muted-foreground">{r.customerName}</p>
              <p className="text-xs text-muted-foreground">
                Order {r.orderCode} · {timeFmt.format(new Date(r.at))}
              </p>
            </div>
            <Button type="button" size="sm" className="shrink-0" onClick={() => onOpenReturn(r.id)}>
              Open chat
            </Button>
          </li>
        ))}
        {orders.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
            <div className="grid min-w-0 gap-0.5">
              <p className="font-medium">
                {o.code} · ₹{o.total.toLocaleString("en-IN")}
              </p>
              <p className="truncate text-muted-foreground">{o.customerName}</p>
              <p className="text-xs text-muted-foreground">
                {o.itemCount} {o.itemCount === 1 ? "item" : "items"} · {FULFILMENT_LABEL[o.fulfilment as Fulfilment]} · {timeFmt.format(new Date(o.createdAt))}
              </p>
            </div>
            <Button type="button" size="sm" className="shrink-0" onClick={() => onOpen(o.id)}>
              Open
            </Button>
          </li>
        ))}
      </ul>
      <PopupFooter>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onDismissAll}>
            Dismiss all
          </Button>
        </div>
      </PopupFooter>
    </Popup>
  )
}
