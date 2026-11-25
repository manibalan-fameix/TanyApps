"use client"

import { BarPlot, ChartCard, DonutPlot, TrendPlot, label } from "@/components/charts/charts"

export type SourceRow = { source: string; views: number; clicks: number }
export type ListingRow = {
  car: string
  views: number
  clicks: number
  chats: number
}
export type StageRow = { stage: string; count: number }
export type StatusRow = { status: string; count: number }
export type TrendRow = { date: string; leads: number }

export function DashboardCharts({
  days,
  sources,
  listings,
  stages,
  statuses,
  trend,
}: {
  days: number
  sources: SourceRow[]
  listings: ListingRow[]
  stages: StageRow[]
  statuses: StatusRow[]
  trend: TrendRow[]
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-6">
      <ChartCard className="lg:col-span-4" hint="Last 30 days" title="New leads per day">
        <TrendPlot data={trend} series={[{ key: "leads", name: "Leads" }]} />
      </ChartCard>
      <ChartCard className="lg:col-span-2" hint="All your cars" title="Inventory by status">
        <DonutPlot data={statuses.map((s) => ({ name: label(s.status), value: s.count }))} />
      </ChartCard>
      <ChartCard className="lg:col-span-3" hint={`Last ${days} days`} title="Where visitors come from">
        <BarPlot
          data={sources.map((s) => ({ ...s, source: label(s.source) }))}
          category="source"
          series={[
            { key: "views", name: "Views" },
            { key: "clicks", name: "Link clicks" },
          ]}
        />
      </ChartCard>
      <ChartCard className="lg:col-span-3" hint={`Last ${days} days`} title="Top cars">
        <BarPlot
          horizontal
          stacked
          data={listings}
          category="car"
          series={[
            { key: "views", name: "Views" },
            { key: "clicks", name: "Link clicks" },
            { key: "chats", name: "Chats" },
          ]}
        />
      </ChartCard>
      <ChartCard className="lg:col-span-6" hint="Last 30 days" title="Lead pipeline">
        <BarPlot horizontal data={stages.map((s) => ({ ...s, stage: label(s.stage) }))} category="stage" series={[{ key: "count", name: "Leads" }]} />
      </ChartCard>
    </div>
  )
}
