import { desc } from "drizzle-orm"
import { CheckmarkBadge01Icon, Clock01Icon, Money03Icon, Wallet01Icon } from "@hugeicons/core-free-icons"

import { StatCard } from "@/components/dashboard/stat-card"
import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { type PaymentRow, PaymentsGrid } from "@/components/restaurant/ops-grids"
import { orders } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { expireUnpaidOrders } from "@/lib/restaurant/payments"
import { startOfDayIst } from "@/lib/restaurant/stats"

export const metadata = { title: "Payments" }
export const dynamic = "force-dynamic"

const money = (v: number) => `₹${v.toLocaleString("en-IN")}`

export default async function PaymentsPage() {
  const { dealer } = await requireRestaurant()
  await expireUnpaidOrders(dealer.id)
  const all = await scopedDb(dealer.id).orders.select(undefined, { orderBy: [desc(orders.createdAt)], limit: 500 })
  const today = startOfDayIst(new Date())
  const rows: PaymentRow[] = all.map((o) => ({
    id: o.id,
    code: o.code,
    customer: o.customerName,
    phone: o.customerPhone,
    method: o.paymentMethod === "online" ? "Online (Razorpay)" : o.fulfilment === "delivery" ? "Cash on delivery" : "Pay at restaurant",
    online: o.paymentMethod === "online",
    total: o.total,
    status: o.status === "cancelled" && o.paymentStatus !== "refunded" ? "cancelled" : (o.paymentStatus as PaymentRow["status"]),
    placedAt: o.createdAt.toISOString(),
    paidAt: o.paidAt ? o.paidAt.toISOString() : null,
  }))
  const sum = (f: (r: PaymentRow) => boolean) => rows.filter(f).reduce((n, r) => n + r.total, 0)
  const collectedToday = sum((r) => r.status === "paid" && r.paidAt !== null && new Date(r.paidAt) >= today)
  const collected = sum((r) => r.status === "paid")
  // Cash still to collect. An online order that is unpaid is not owed by anyone yet.
  const pending = sum((r) => r.status === "pending" && !r.online)
  const online = sum((r) => r.online && r.status === "paid")
  const refunded = sum((r) => r.status === "refunded")
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Payments" description="Money collected and still to collect. Guests pay on delivery or pickup, so mark an order paid once you have the cash. Online payments are marked paid automatically." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Wallet01Icon} label="Collected today" value={money(collectedToday)} />
        <StatCard icon={CheckmarkBadge01Icon} label="Collected (latest 500 orders)" value={money(collected)} />
        <StatCard icon={Clock01Icon} label="Cash still to collect" value={money(pending)} pill={`${rows.filter((r) => r.status === "pending" && !r.online).length} orders`} />
        <StatCard icon={Money03Icon} label="Paid online" value={money(online)} pill={refunded ? `${money(refunded)} refunded` : undefined} />
      </div>
      {rows.length === 0 ? <EmptyState title="No payments yet" body="Orders and their payment status appear here." /> : <PaymentsGrid rows={rows} />}
    </div>
  )
}
