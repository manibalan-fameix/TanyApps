"use client"

import { useMemo } from "react"
import { AgCharts } from "ag-charts-react"
import {
  AllCommunityModule,
  ModuleRegistry,
  type AgChartOptions,
} from "ag-charts-community"

import { base, useChartTokens } from "@/components/dashboard/performance-charts"

ModuleRegistry.registerModules([AllCommunityModule])

export type TrendSeries = {
  key: string
  name: string
  type?: "area" | "bar" | "line"
  money?: boolean
}

/** A daily trend for one or more measures, drawn with the same chart tokens as the dealer dashboard. */
export function TrendChart({
  data,
  series,
  height = 256,
}: {
  data: Record<string, number | string>[]
  series: TrendSeries[]
  height?: number
}) {
  const tokens = useChartTokens()
  const options = useMemo<AgChartOptions | null>(() => {
    if (!tokens) return null
    const money = series.every((s) => s.money)
    return {
      ...base(tokens),
      data: data.map((d) => ({ ...d, date: new Date(String(d.date)) })),
      series: series.map((s) => ({
        type: s.type ?? "area",
        xKey: "date",
        yKey: s.key,
        yName: s.name,
        ...(s.type === "bar" || !s.type ? {} : {}),
      })),
      axes: [
        { type: "time", position: "bottom", label: { format: "%d %b" } },
        {
          type: "number",
          position: "left",
          nice: true,
          interval: { minSpacing: 30 },
          label: {
            formatter: ({ value }: { value: number }) =>
              money
                ? value >= 1e5
                  ? `₹${value / 1e5}L`
                  : value >= 1e3
                    ? `₹${value / 1e3}k`
                    : `₹${value}`
                : String(value),
          },
        },
      ],
      legend: { enabled: series.length > 1 },
    } as unknown as AgChartOptions
  }, [tokens, data, series])
  return (
    <div style={{ height }}>
      {options ? (
        <AgCharts options={options} style={{ height: "100%" }} />
      ) : null}
    </div>
  )
}

/** Kept for the overview page's signups chart. */
export function SignupsChart({
  data,
}: {
  data: { date: string; businesses: number }[]
}) {
  return (
    <TrendChart
      data={data}
      series={[{ key: "businesses", name: "New businesses" }]}
    />
  )
}
