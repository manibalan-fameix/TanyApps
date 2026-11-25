import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { STATUS_LABEL } from "@/lib/returns/flow"
import { returnsForOrder } from "@/lib/returns/shop"

/** An order's returns on the order's own screen, with what the shop keeps after the approved ones. */
export async function OrderReturnsBox({ dealerId, orderId, total }: { dealerId: string; orderId: string; total: number }) {
  const rows = await returnsForOrder(dealerId, orderId)
  if (rows.length === 0) return null
  const back = rows.filter((r) => r.status === "refund_due" || r.status === "refunded").reduce((n, r) => n + (r.amount ?? 0), 0)
  return (
    <section aria-label="Returns" className="grid gap-2 rounded-2xl border p-3 text-sm">
      <h3 className="font-semibold">Returns</h3>
      <ul className="grid gap-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{r.code}</span>
            <Badge variant="outline">{r.status === "draft" ? "Needs help" : STATUS_LABEL[r.status]}</Badge>
            {r.amount !== null ? <span className="tabular-nums">₹{r.amount.toLocaleString("en-IN")}</span> : null}
            <Link href={`/returns?id=${r.id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "ml-auto" })}>Open chat</Link>
          </li>
        ))}
      </ul>
      {back > 0 ? <p className="text-muted-foreground">Kept after returns: ₹{(total - back).toLocaleString("en-IN")} of ₹{total.toLocaleString("en-IN")}</p> : null}
    </section>
  )
}
