"use client"

import { useMemo } from "react"
import { AllCommunityModule, ModuleRegistry, type AgChartOptions } from "ag-charts-community"

import { ChartCard, base, label, useChartTokens } from "@/components/dashboard/performance-charts"

ModuleRegistry.registerModules([AllCommunityModule])

export type DayRow = { date: string; orders: number; revenue: number }
export type DishRow = { name: string; qty: number }
export type CountRow = { key: string; count: number }

// Same chart setup as the motors dashboard: theme tokens for colours, area / donut / bar series.
export function RestaurantCharts({ days, daily, statuses, dishes, types }: { days: number; daily: DayRow[]; statuses: CountRow[]; dishes: DishRow[]; types: CountRow[] }) {
  const tokens = useChartTokens()
  const opts = useMemo(() => {
    if (!tokens) return null
    const b = base(tokens)
    const o = (x: object) => ({ ...b, ...x }) as AgChartOptions
    return {
      trend: o({
        data: daily.map((r) => ({ ...r, date: new Date(r.date) })),
        series: [{ type: "area", xKey: "date", yKey: "orders", yName: "Orders" }],
        axes: [
          { type: "time", position: "bottom", label: { format: "%d %b" } },
          { type: "number", position: "left", nice: true, interval: { minSpacing: 30 }, label: { format: "d" } },
        ],
        legend: { enabled: false },
      }),
      statuses: o({
        data: statuses.filter((s) => s.count > 0).map((s) => ({ count: s.count, status: label(s.key) })),
        series: [{ type: "donut", angleKey: "count", legendItemKey: "status", innerRadiusRatio: 0.65 }],
      }),
      types: o({
        data: types.map((t) => ({ type: label(t.key), count: t.count })),
        series: [{ type: "bar", xKey: "type", yKey: "count", yName: "Orders" }],
        legend: { enabled: false },
      }),
      dishes: o({
        data: dishes,
        series: [{ type: "bar", direction: "horizontal", xKey: "name", yKey: "qty", yName: "Sold" }],
        legend: { enabled: false },
      }),
    }
  }, [tokens, daily, statuses, dishes, types])

  return (
    <div className="grid gap-4 lg:grid-cols-6">
      <ChartCard className="lg:col-span-4" hint={`Last ${days} days`} title="Orders per day" options={opts?.trend ?? null} />
      <ChartCard className="lg:col-span-2" hint={`Last ${days} days`} title="Orders by status" options={opts?.statuses ?? null} />
      <ChartCard className="lg:col-span-3" hint={`Last ${days} days`} title="Best-selling dishes" options={opts?.dishes ?? null} />
      <ChartCard className="lg:col-span-3" hint={`Last ${days} days`} title="Delivery, pickup and dine in" options={opts?.types ?? null} />
    </div>
  )
}
