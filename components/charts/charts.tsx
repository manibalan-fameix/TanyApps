"use client"

import { useId } from "react"
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, Pie, PieChart, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"

// Charts built on shadcn/ui charts (https://ui.shadcn.com/charts). Colours come from the theme's chart tokens.

/** Shades of the Tany red; the first series is the brand red itself. */
const COLORS = [1, 2, 3, 4, 5].map((i) => `var(--chart-${i})`)
const color = (i: number) => COLORS[i % COLORS.length]

export type Series = {
  key: string
  name: string
  type?: "area" | "bar" | "line"
}

/** "ready_for_pickup" becomes "Ready for pickup". */
export const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())

type Row = Record<string, string | number>

const toConfig = (series: Series[]): ChartConfig =>
  Object.fromEntries(series.map((s, i) => [s.key, { label: s.name, color: color(i) }]))

// Dates arrive as YYYY-MM-DD calendar days, so they are formatted in UTC to stay on the same day.
const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })
const day = (value: unknown) => dayFormat.format(new Date(String(value)))

const compact = (n: number) => (n >= 1e7 ? `${+(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `${+(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(n))
const rupees = (n: number) => `₹${compact(n)}`

const short = (value: unknown) => {
  const s = String(value)
  return s.length > 16 ? `${s.slice(0, 15)}…` : s
}

function Empty({ className }: { className?: string }) {
  return <div className={cn("flex h-64 items-center justify-center text-sm text-muted-foreground", className)}>No data yet</div>
}

export function ChartCard({ title, hint, className, children }: { title: string; hint: string; className?: string; children: React.ReactNode }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardDescription>{hint}</CardDescription>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** A daily trend. Each series is drawn as a gradient area unless it asks for a bar or a line. */
export function TrendPlot({ data, series, money = false, height = 256 }: { data: Row[]; series: Series[]; money?: boolean; height?: number }) {
  const id = useId().replace(/:/g, "")
  if (data.length === 0) return <Empty />
  return (
    <ChartContainer config={toConfig(series)} className="aspect-auto w-full" style={{ height }}>
      <ComposedChart accessibilityLayer data={data} margin={{ top: 8, left: 0, right: 12 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${s.key})`} stopOpacity={0.8} />
              <stop offset="95%" stopColor={`var(--color-${s.key})`} stopOpacity={0.1} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={day} />
        <YAxis tickLine={false} axisLine={false} tickMargin={4} width={48} allowDecimals={false} tickFormatter={money ? rupees : compact} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" labelFormatter={(_, payload) => day(payload?.[0]?.payload?.date)} />} />
        {series.map((s) =>
          s.type === "bar" ? (
            <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={4} />
          ) : s.type === "line" ? (
            <Line key={s.key} dataKey={s.key} type="monotone" stroke={`var(--color-${s.key})`} strokeWidth={2} dot={false} />
          ) : (
            // Monotone rather than natural, so the curve never dips below zero between two days.
            <Area key={s.key} dataKey={s.key} type="monotone" fill={`url(#${id}-${s.key})`} stroke={`var(--color-${s.key})`} />
          )
        )}
        {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
      </ComposedChart>
    </ChartContainer>
  )
}

/** Bars per category: grouped or stacked, upright or horizontal (for long names). */
export function BarPlot({
  data,
  category,
  series,
  horizontal = false,
  stacked = false,
  money = false,
}: {
  data: Row[]
  category: string
  series: Series[]
  horizontal?: boolean
  stacked?: boolean
  money?: boolean
}) {
  if (data.length === 0) return <Empty />
  const value = money ? rupees : compact
  return (
    <ChartContainer config={toConfig(series)} className="aspect-auto h-64 w-full">
      <BarChart accessibilityLayer data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, left: 0, right: 12 }}>
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} tickFormatter={value} />
            <YAxis type="category" dataKey={category} tickLine={false} axisLine={false} tickMargin={4} width={112} interval={0} tickFormatter={short} />
          </>
        ) : (
          <>
            <XAxis dataKey={category} tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} tickFormatter={short} />
            <YAxis tickLine={false} axisLine={false} tickMargin={4} width={48} allowDecimals={false} tickFormatter={value} />
          </>
        )}
        <ChartTooltip content={<ChartTooltipContent indicator="dashed" />} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} stackId={stacked ? "stack" : undefined} fill={`var(--color-${s.key})`} radius={stacked ? 0 : 4} />
        ))}
        {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
      </BarChart>
    </ChartContainer>
  )
}

/** A share-of-total donut with a legend. */
export function DonutPlot({ data }: { data: { name: string; value: number }[] }) {
  const slices = data.filter((d) => d.value > 0).map((d, i) => ({ ...d, fill: color(i) }))
  if (slices.length === 0) return <Empty />
  const config: ChartConfig = Object.fromEntries(slices.map((s) => [s.name, { label: s.name }]))
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <PieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
        <Pie data={slices} dataKey="value" nameKey="name" innerRadius="55%" strokeWidth={2} />
        <ChartLegend content={<ChartLegendContent nameKey="name" className="flex-wrap gap-x-4 gap-y-1" />} />
      </PieChart>
    </ChartContainer>
  )
}
