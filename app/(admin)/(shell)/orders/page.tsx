import { desc } from "drizzle-orm"

import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { type OrderRow, OrdersGrid } from "@/components/restaurant/restaurant-grids"
import { orders } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { expireUnpaidOrders } from "@/lib/restaurant/payments"
import { FULFILMENT_LABEL, type Fulfilment } from "@/lib/restaurant/settings"

export const metadata = { title: "Orders" }
export const dynamic = "force-dynamic"

export default async function OrdersPage() {
  const { dealer } = await requireRestaurant()
  await expireUnpaidOrders(dealer.id)
  const all = await scopedDb(dealer.id).orders.select(undefined, { orderBy: [desc(orders.createdAt)], limit: 500 })
  const rows: OrderRow[] = all.map((o) => ({
    id: o.id,
    code: o.code,
    customer: o.customerName,
    phone: o.customerPhone,
    fulfilment: FULFILMENT_LABEL[o.fulfilment as Fulfilment],
    summary: o.lines.map((l) => `${l.qty}× ${l.name}`).join(", "),
    total: o.total,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
  }))
  const fresh = all.filter((o) => o.status === "new").length
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Orders" description={`${fresh} new · latest ${all.length} shown`} />
      {rows.length === 0 ? (
        <EmptyState title="No orders yet" body="Orders from your menu page show up here as soon as guests place them." />
      ) : (
        <OrdersGrid rows={rows} />
      )}
    </div>
  )
}
