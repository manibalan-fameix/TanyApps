"use client"

import { TrendPlot, type Series } from "@/components/charts/charts"

export type TrendSeries = Series & { money?: boolean }

/** A daily trend for one or more measures. */
export function TrendChart({ data, series, height }: { data: Record<string, number | string>[]; series: TrendSeries[]; height?: number }) {
  return <TrendPlot data={data} series={series} height={height} money={series.every((s) => s.money)} />
}
