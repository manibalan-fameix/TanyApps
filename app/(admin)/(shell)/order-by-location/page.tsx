import { gte } from "drizzle-orm"
import { Location01Icon, ShoppingBag01Icon, Wallet01Icon } from "@hugeicons/core-free-icons"

import { StatCard } from "@/components/dashboard/stat-card"
import { AreaChart } from "@/components/restaurant/analytics-charts"
import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { AreasGrid } from "@/components/restaurant/ops-grids"
import { RangeSwitch, parseRange } from "@/components/restaurant/range-switch"
import { orders } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { ordersByPincode, startOfDayIst } from "@/lib/restaurant/stats"

export const metadata = { title: "Order by location" }
export const dynamic = "force-dynamic"

export default async function OrderByLocationPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { dealer } = await requireRestaurant()
  const days = parseRange((await searchParams).days)
  const since = new Date(startOfDayIst(new Date()).getTime() - (days - 1) * 86_400_000)
  const rows = await scopedDb(dealer.id).orders.select(gte(orders.createdAt, since), { limit: 5000 })
  const areas = ordersByPincode(rows)
  const delivered = areas.reduce((n, a) => n + a.orders, 0)
  const revenue = areas.reduce((n, a) => n + a.revenue, 0)
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Order by location" description="Where your delivery orders go, grouped by pincode. Pickup and dine-in orders have no address, so they are not counted.">
        <RangeSwitch path="/order-by-location" days={days} />
      </PageHeader>
      {areas.length === 0 ? (
        <EmptyState title="No delivery orders in this period" body="Orders with a delivery pincode show up here." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={Location01Icon} label="Areas served" value={String(areas.length)} pill={`Top: ${areas[0].pincode}`} />
            <StatCard icon={ShoppingBag01Icon} label="Delivery orders" value={String(delivered)} />
            <StatCard icon={Wallet01Icon} label="Delivery revenue" value={`₹${revenue.toLocaleString("en-IN")}`} />
          </div>
          <AreaChart days={days} rows={areas.slice(0, 10).map((a) => ({ pincode: a.zone ? `${a.pincode} ${a.zone}` : a.pincode, orders: a.orders }))} />
          <AreasGrid rows={areas.map((a) => ({ id: a.pincode, ...a }))} />
        </>
      )}
    </div>
  )
}
