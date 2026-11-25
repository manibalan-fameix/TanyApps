"use client"

import { BarPlot, ChartCard, DonutPlot, TrendPlot, label } from "@/components/charts/charts"

export type DayRow = { date: string; orders: number; revenue: number }
export type DishRow = { name: string; qty: number }
export type CountRow = { key: string; count: number }

export function RestaurantCharts({ days, daily, statuses, dishes, types }: { days: number; daily: DayRow[]; statuses: CountRow[]; dishes: DishRow[]; types: CountRow[] }) {
  const hint = `Last ${days} days`
  return (
    <div className="grid gap-4 lg:grid-cols-6">
      <ChartCard className="lg:col-span-4" hint={hint} title="Orders per day">
        <TrendPlot data={daily} series={[{ key: "orders", name: "Orders" }]} />
      </ChartCard>
      <ChartCard className="lg:col-span-2" hint={hint} title="Orders by status">
        <DonutPlot data={statuses.map((s) => ({ name: label(s.key), value: s.count }))} />
      </ChartCard>
      <ChartCard className="lg:col-span-3" hint={hint} title="Best-selling dishes">
        <BarPlot horizontal data={dishes} category="name" series={[{ key: "qty", name: "Sold" }]} />
      </ChartCard>
      <ChartCard className="lg:col-span-3" hint={hint} title="Delivery, pickup and dine in">
        <BarPlot data={types.map((t) => ({ type: label(t.key), count: t.count }))} category="type" series={[{ key: "count", name: "Orders" }]} />
      </ChartCard>
    </div>
  )
}
