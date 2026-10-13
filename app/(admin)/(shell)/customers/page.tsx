import { desc } from "drizzle-orm"

import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { type CustomerRow, CustomersGrid } from "@/components/restaurant/restaurant-grids"
import { orders } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { summariseCustomers } from "@/lib/restaurant/customers"
import { requireRestaurant } from "@/lib/restaurant/guard"

export const metadata = { title: "Customers" }
export const dynamic = "force-dynamic"

export default async function CustomersPage() {
  const { dealer } = await requireRestaurant()
  const rows = await scopedDb(dealer.id).orders.select(undefined, { orderBy: [desc(orders.createdAt)], limit: 2000 })
  const customers: CustomerRow[] = summariseCustomers(rows).map((c) => ({ id: c.phone, name: c.name, phone: c.phone, orders: c.orders, spent: c.spent, lastOrderAt: c.lastOrderAt.toISOString() }))
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Customers" description="Guests who have ordered, grouped by mobile number." />
      {customers.length === 0 ? <EmptyState title="No guests yet" body="Guests appear here after their first order." /> : <CustomersGrid rows={customers} />}
    </div>
  )
}
