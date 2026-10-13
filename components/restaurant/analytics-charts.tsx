"use client"

import { useMemo } from "react"
import { AllCommunityModule, ModuleRegistry, type AgChartOptions } from "ag-charts-community"

import { ChartCard, base, label, useChartTokens } from "@/components/dashboard/performance-charts"

ModuleRegistry.registerModules([AllCommunityModule])

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

/** Same chart setup and tokens as the motors dashboard. */
export function AnalyticsCharts({ d }: { d: AnalyticsData }) {
  const tokens = useChartTokens()
  const o = useMemo(() => {
    if (!tokens) return null
    const b = base(tokens)
    const make = (x: object) => ({ ...b, ...x }) as AgChartOptions
    const money = { type: "number", position: "left", nice: true, label: { format: "₹,.0f" } }
    return {
      revenue: make({
        data: d.daily.map((r) => ({ ...r, date: new Date(r.date) })),
        series: [{ type: "area", xKey: "date", yKey: "revenue", yName: "Revenue (₹)" }],
        axes: [{ type: "time", position: "bottom", label: { format: "%d %b" } }, money],
        legend: { enabled: false },
      }),
      hours: make({ data: d.hours, series: [{ type: "bar", xKey: "hour", yKey: "orders", yName: "Orders" }], legend: { enabled: false } }),
      weekdays: make({ data: d.weekdays, series: [{ type: "bar", xKey: "day", yKey: "orders", yName: "Orders" }], legend: { enabled: false } }),
      dishes: make({ data: d.dishes, series: [{ type: "bar", direction: "horizontal", xKey: "name", yKey: "revenue", yName: "Revenue (₹)" }], legend: { enabled: false } }),
      types: make({ data: d.types.map((t) => ({ count: t.count, type: label(t.key) })), series: [{ type: "donut", angleKey: "count", legendItemKey: "type", innerRadiusRatio: 0.65 }] }),
      statuses: make({ data: d.statuses.filter((s) => s.count > 0).map((s) => ({ count: s.count, status: label(s.key) })), series: [{ type: "donut", angleKey: "count", legendItemKey: "status", innerRadiusRatio: 0.65 }] }),
      guests: make({ data: d.guests.filter((s) => s.count > 0).map((s) => ({ count: s.count, kind: s.key })), series: [{ type: "donut", angleKey: "count", legendItemKey: "kind", innerRadiusRatio: 0.65 }] }),
    }
  }, [tokens, d])
  const hint = `Last ${d.days} days`
  return (
    <div className="grid gap-4 lg:grid-cols-6">
      <ChartCard className="lg:col-span-4" hint={hint} title="Revenue per day" options={o?.revenue ?? null} />
      <ChartCard className="lg:col-span-2" hint={hint} title="Orders by status" options={o?.statuses ?? null} />
      <ChartCard className="lg:col-span-3" hint={hint} title="Busiest hours" options={o?.hours ?? null} />
      <ChartCard className="lg:col-span-3" hint={hint} title="Busiest days" options={o?.weekdays ?? null} />
      <ChartCard className="lg:col-span-3" hint={hint} title="Top dishes by revenue" options={o?.dishes ?? null} />
      <ChartCard className="lg:col-span-3" hint={hint} title="Delivery, pickup and dine in" options={o?.types ?? null} />
      <ChartCard className="lg:col-span-2" hint={hint} title="New and returning guests" options={o?.guests ?? null} />
    </div>
  )
}

export function AreaChart({ days, rows }: { days: number; rows: { pincode: string; orders: number }[] }) {
  const tokens = useChartTokens()
  const options = useMemo(() => {
    if (!tokens) return null
    return { ...base(tokens), data: rows, series: [{ type: "bar", direction: "horizontal", xKey: "pincode", yKey: "orders", yName: "Orders" }], legend: { enabled: false } } as AgChartOptions
  }, [tokens, rows])
  return <ChartCard hint={`Last ${days} days`} title="Top pincodes by orders" options={options} />
}
