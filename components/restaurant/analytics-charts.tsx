"use client"

import { BarPlot, ChartCard, DonutPlot, TrendPlot, label } from "@/components/charts/charts"

export type AnalyticsData = {
  days: number
  daily: { date: string; orders: number; revenue: number }[]
  hours: { hour: string; orders: number }[]
  weekdays: { day: string; orders: number; revenue: number }[]
  dishes: { name: string; revenue: number }[]
  types: { key: string; count: number }[]
  statuses: { key: string; count: number }[]
  guests: { key: string; count: number }[]
}

const ORDERS = [{ key: "orders", name: "Orders" }]
const slices = (rows: { key: string; count: number }[]) => rows.map((r) => ({ name: label(r.key), value: r.count }))

export function AnalyticsCharts({ d }: { d: AnalyticsData }) {
  const hint = `Last ${d.days} days`
  return (
    <div className="grid gap-4 lg:grid-cols-6">
      <ChartCard className="lg:col-span-4" hint={hint} title="Revenue per day">
        <TrendPlot money data={d.daily} series={[{ key: "revenue", name: "Revenue (₹)" }]} />
      </ChartCard>
      <ChartCard className="lg:col-span-2" hint={hint} title="Orders by status">
        <DonutPlot data={slices(d.statuses)} />
      </ChartCard>
      <ChartCard className="lg:col-span-3" hint={hint} title="Busiest hours">
        <BarPlot data={d.hours} category="hour" series={ORDERS} />
      </ChartCard>
      <ChartCard className="lg:col-span-3" hint={hint} title="Busiest days">
        <BarPlot data={d.weekdays} category="day" series={ORDERS} />
      </ChartCard>
      <ChartCard className="lg:col-span-3" hint={hint} title="Top dishes by revenue">
        <BarPlot horizontal money data={d.dishes} category="name" series={[{ key: "revenue", name: "Revenue (₹)" }]} />
      </ChartCard>
      <ChartCard className="lg:col-span-3" hint={hint} title="Delivery, pickup and dine in">
        <DonutPlot data={slices(d.types)} />
      </ChartCard>
      <ChartCard className="lg:col-span-2" hint={hint} title="New and returning guests">
        <DonutPlot data={d.guests.map((g) => ({ name: g.key, value: g.count }))} />
      </ChartCard>
    </div>
  )
}

export function AreaChart({ days, rows }: { days: number; rows: { pincode: string; orders: number }[] }) {
  return (
    <ChartCard hint={`Last ${days} days`} title="Top pincodes by orders">
      <BarPlot horizontal data={rows} category="pincode" series={ORDERS} />
    </ChartCard>
  )
}
