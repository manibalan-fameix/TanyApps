import Link from "next/link"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { label } from "@/lib/super/format"

/** Change against the previous period of the same length. Green up, red down, nothing when there is no baseline. */
export function Delta({
  value,
  invert,
}: {
  value: number | null | undefined
  invert?: boolean
}) {
  if (value == null) return null
  const good = invert ? value <= 0 : value >= 0
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        value === 0
          ? "text-muted-foreground"
          : good
            ? "text-primary"
            : "text-destructive"
      )}
    >
      {value === 0 ? null : (
        <HugeiconsIcon
          icon={value > 0 ? ArrowUp01Icon : ArrowDown01Icon}
          strokeWidth={2}
          className="size-3.5"
        />
      )}
      {Math.abs(value)}%
    </span>
  )
}

/** Same card as the dealer dashboard's stat card, with a period-over-period change and a one-line note. */
export function Metric({
  icon,
  label: title,
  value,
  delta,
  note,
  href,
  invert,
}: {
  icon: IconSvgElement
  label: string
  value: string
  delta?: number | null
  note?: string
  href?: string
  invert?: boolean
}) {
  const body = (
    <Card className="gap-0 p-5 transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
          <HugeiconsIcon icon={icon} strokeWidth={2} className="size-5" />
        </span>
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <Delta value={delta} invert={invert} />
      </div>
      {note ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{note}</p>
      ) : null}
    </Card>
  )
  return href ? <Link href={href}>{body}</Link> : body
}

/** A ranked list of how a total splits: label, count and a slim bar, like the dealer dashboard's status lists. */
export function MixCard({
  title,
  hint,
  rows,
  format,
  empty = "Nothing yet.",
}: {
  title: string
  hint: string
  rows: { key: string; count: number }[]
  format?: (key: string) => string
  empty?: string
}) {
  const total = rows.reduce((s, r) => s + r.count, 0)
  return (
    <Card>
      <CardHeader>
        <CardDescription>{hint}</CardDescription>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">{empty}</p>
        ) : null}
        {rows.map((r) => (
          <div key={r.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">
                {format ? format(r.key) : label(r.key)}
              </span>
              <span className="text-muted-foreground">
                {r.count.toLocaleString("en-IN")} ·{" "}
                {total ? Math.round((r.count / total) * 100) : 0}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${total ? (r.count / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/** Steps with how many made it, and the share kept from the step before. */
export function FunnelCard({
  title,
  hint,
  steps,
}: {
  title: string
  hint: string
  steps: { label: string; count: number }[]
}) {
  const top = steps[0]?.count || 1
  return (
    <Card>
      <CardHeader>
        <CardDescription>{hint}</CardDescription>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {steps.map((s, i) => (
          <div key={s.label} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span>{s.label}</span>
              <span className="text-muted-foreground">
                {s.count.toLocaleString("en-IN")}
                {i > 0 && steps[i - 1]!.count
                  ? ` · ${Math.round((s.count / steps[i - 1]!.count) * 100)}% of previous`
                  : ""}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(s.count / top) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

const HEALTH: Record<
  string,
  {
    label: string
    variant: "default" | "secondary" | "destructive" | "outline"
  }
> = {
  healthy: { label: "Healthy", variant: "default" },
  new: { label: "New", variant: "secondary" },
  at_risk: { label: "At risk", variant: "destructive" },
  dormant: { label: "Dormant", variant: "outline" },
}
export const healthLabel = (h: string) => HEALTH[h]?.label ?? label(h)
export function HealthBadge({ health }: { health: string }) {
  const h = HEALTH[health]
  return (
    <Badge variant={h?.variant ?? "secondary"}>
      {h?.label ?? label(health)}
    </Badge>
  )
}

/** A titled list inside a card. Rows are links when they carry an href. */
export function ListCard({
  title,
  hint,
  rows,
  empty,
  footer,
}: {
  title: string
  hint: string
  rows: {
    key: string
    href?: string
    primary: string
    secondary?: string
    right?: React.ReactNode
  }[]
  empty: string
  footer?: { href: string; label: string }
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{hint}</CardDescription>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">{empty}</p>
        ) : null}
        {rows.map((r) => {
          const inner = (
            <>
              <div className="min-w-0">
                <p className="truncate font-medium">{r.primary}</p>
                {r.secondary ? (
                  <p className="truncate text-muted-foreground">
                    {r.secondary}
                  </p>
                ) : null}
              </div>
              {r.right != null ? (
                <div className="shrink-0 text-muted-foreground">{r.right}</div>
              ) : null}
            </>
          )
          return r.href ? (
            <Link
              key={r.key}
              href={r.href}
              className="flex items-center justify-between gap-3 py-2 hover:underline"
            >
              {inner}
            </Link>
          ) : (
            <div
              key={r.key}
              className="flex items-center justify-between gap-3 py-2"
            >
              {inner}
            </div>
          )
        })}
        {footer ? (
          <Link href={footer.href} className="pt-3 font-medium underline">
            {footer.label}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  )
}
