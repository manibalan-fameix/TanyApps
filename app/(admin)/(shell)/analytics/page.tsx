import { desc, gte } from "drizzle-orm"
import { ChartLineData01Icon, ShoppingBag01Icon, UserMultiple02Icon, Wallet01Icon } from "@hugeicons/core-free-icons"

import { StatCard } from "@/components/dashboard/stat-card"
import { AnalyticsCharts } from "@/components/restaurant/analytics-charts"
import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { RangeSwitch, parseRange } from "@/components/restaurant/range-switch"
import { orders } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { FULFILMENT_LABEL, type Fulfilment } from "@/lib/restaurant/settings"
import { averageOrderValue, countBy, dailyOrders, ordersByHour, ordersByWeekday, repeatStats, revenueByDish, startOfDayIst } from "@/lib/restaurant/stats"

export const metadata = { title: "Analytics" }
export const dynamic = "force-dynamic"

const money = (v: number) => (v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(2)} L` : `₹${v.toLocaleString("en-IN")}`)

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { dealer } = await requireRestaurant()
  const days = parseRange((await searchParams).days)
  const since = new Date(startOfDayIst(new Date()).getTime() - (days - 1) * 86_400_000)
  const rows = await scopedDb(dealer.id).orders.select(gte(orders.createdAt, since), { orderBy: [desc(orders.createdAt)], limit: 5000 })
  const kept = rows.filter((o) => o.status !== "cancelled")
  const revenue = kept.reduce((n, o) => n + o.total, 0)
  const repeat = repeatStats(rows)
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Analytics" description={`Worked out from your orders in the last ${days} days${rows.length >= 5000 ? " (latest 5,000)" : ""}. Cancelled orders are left out of sales.`}>
        <RangeSwitch path="/analytics" days={days} />
      </PageHeader>
      {rows.length === 0 ? (
        <EmptyState title="No orders in this period" body="Charts appear once guests place orders." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Wallet01Icon} label="Revenue" value={money(revenue)} />
            <StatCard icon={ShoppingBag01Icon} label="Orders" value={String(kept.length)} pill={rows.length - kept.length ? `${rows.length - kept.length} cancelled` : undefined} />
            <StatCard icon={ChartLineData01Icon} label="Average order" value={money(averageOrderValue(rows))} />
            <StatCard icon={UserMultiple02Icon} label="Guests" value={String(repeat.guests)} pill={`${repeat.repeatRate}% returning`} />
          </div>
          <AnalyticsCharts
            d={{
              days,
              daily: dailyOrders(rows, days),
              hours: ordersByHour(rows),
              weekdays: ordersByWeekday(rows),
              dishes: revenueByDish(rows).map((x) => ({ name: x.name, revenue: x.revenue })),
              types: countBy(kept, (o) => FULFILMENT_LABEL[o.fulfilment as Fulfilment] ?? o.fulfilment),
              statuses: countBy(rows, (o) => o.status),
              guests: [
                { key: "New", count: repeat.new },
                { key: "Returning", count: repeat.returning },
              ],
            }}
          />
        </>
      )}
    </div>
  )
}
