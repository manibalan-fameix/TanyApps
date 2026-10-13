"use client"

import { useMemo, useSyncExternalStore } from "react"
import { AgCharts } from "ag-charts-react"
import {
  AllCommunityModule,
  ModuleRegistry,
  type AgChartOptions,
} from "ag-charts-community"
import { useTheme } from "next-themes"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

ModuleRegistry.registerModules([AllCommunityModule])

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

export type Tokens = { palette: string[]; text: string; grid: string }

/** Reads the theme's chart tokens so the charts follow globals.css instead of hard-coded colours. */
export function useChartTokens() {
  const { resolvedTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  return useMemo<Tokens | null>(() => {
    if (!mounted || !resolvedTheme) return null
    const css = getComputedStyle(document.documentElement)
    const v = (name: string) => css.getPropertyValue(name).trim()
    return {
      palette: [1, 2, 3, 4, 5].map((i) => v(`--chart-${i}`)),
      text: v("--muted-foreground"),
      grid: v("--border"),
    }
  }, [mounted, resolvedTheme])
}

export function base(t: Tokens): AgChartOptions {
  return {
    background: { visible: false },
    theme: {
      palette: { fills: t.palette, strokes: t.palette },
      overrides: {
        common: {
          axes: {
            category: { label: { color: t.text }, line: { stroke: t.grid } },
            number: {
              label: { color: t.text },
              gridLine: { style: [{ stroke: t.grid }] },
            },
            time: { label: { color: t.text }, line: { stroke: t.grid } },
          },
          legend: { item: { label: { color: t.text } } },
        },
      },
    },
  }
}

export const label = (s: string) =>
  s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())

export function ChartCard({
  title,
  hint,
  options,
  className,
}: {
  title: string
  hint: string
  options: AgChartOptions | null
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardDescription>{hint}</CardDescription>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {options ? (
          <AgCharts options={options} style={{ height: "100%" }} />
        ) : null}
      </CardContent>
    </Card>
  )
}

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
  const tokens = useChartTokens()
  const opts = useMemo(() => {
    if (!tokens) return null
    const b = base(tokens)
    const o = (x: object) => ({ ...b, ...x }) as AgChartOptions
    return {
      trend: o({
        data: trend.map((r) => ({ ...r, date: new Date(r.date) })),
        series: [{ type: "area", xKey: "date", yKey: "leads", yName: "Leads" }],
        axes: [
          { type: "time", position: "bottom", label: { format: "%d %b" } },
          {
            type: "number",
            position: "left",
            nice: true,
            interval: { minSpacing: 30 },
            label: { format: "d" },
          },
        ],
        legend: { enabled: false },
      }),
      sources: o({
        data: sources.map((s) => ({ ...s, source: label(s.source) })),
        series: [
          { type: "bar", xKey: "source", yKey: "views", yName: "Views" },
          { type: "bar", xKey: "source", yKey: "clicks", yName: "Link clicks" },
        ],
      }),
      listings: o({
        data: listings,
        series: [
          {
            type: "bar",
            direction: "horizontal",
            xKey: "car",
            yKey: "views",
            yName: "Views",
            stacked: true,
          },
          {
            type: "bar",
            direction: "horizontal",
            xKey: "car",
            yKey: "clicks",
            yName: "Link clicks",
            stacked: true,
          },
          {
            type: "bar",
            direction: "horizontal",
            xKey: "car",
            yKey: "chats",
            yName: "Chats",
            stacked: true,
          },
        ],
      }),
      stages: o({
        data: stages.map((s) => ({ ...s, stage: label(s.stage) })),
        series: [
          {
            type: "bar",
            direction: "horizontal",
            xKey: "stage",
            yKey: "count",
            yName: "Leads",
          },
        ],
        legend: { enabled: false },
      }),
      statuses: o({
        data: statuses
          .filter((s) => s.count > 0)
          .map((s) => ({ ...s, status: label(s.status) })),
        series: [
          {
            type: "donut",
            angleKey: "count",
            legendItemKey: "status",
            innerRadiusRatio: 0.65,
          },
        ],
      }),
    }
  }, [tokens, sources, listings, stages, statuses, trend])

  return (
    <div className="grid gap-4 lg:grid-cols-6">
      <ChartCard
        className="lg:col-span-4"
        hint="Last 30 days"
        title="New leads per day"
        options={opts?.trend ?? null}
      />
      <ChartCard
        className="lg:col-span-2"
        hint="All your cars"
        title="Inventory by status"
        options={opts?.statuses ?? null}
      />
      <ChartCard
        className="lg:col-span-3"
        hint={`Last ${days} days`}
        title="Where visitors come from"
        options={opts?.sources ?? null}
      />
      <ChartCard
        className="lg:col-span-3"
        hint={`Last ${days} days`}
        title="Top cars"
        options={opts?.listings ?? null}
      />
      <ChartCard
        className="lg:col-span-6"
        hint="Last 30 days"
        title="Lead pipeline"
        options={opts?.stages ?? null}
      />
    </div>
  )
}
