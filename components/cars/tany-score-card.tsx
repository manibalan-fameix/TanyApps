import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  HelpCircleIcon,
} from "@hugeicons/core-free-icons"

import type { CheckStatus, ScoreBand, TanyScore } from "@/lib/cars/score"
import { cn } from "@/lib/utils"

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const bandLabel: Record<ScoreBand, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  caution: "Needs caution",
}

const bandColour: Record<ScoreBand, string> = {
  excellent: "text-success",
  good: "text-success",
  fair: "text-primary",
  caution: "text-destructive",
}

const barColour = (ratio: number) =>
  ratio >= 0.75 ? "bg-success" : ratio >= 0.5 ? "bg-primary" : "bg-destructive"

function ScoreRing({ score, band }: { score: number; band: ScoreBand }) {
  return (
    <div
      className="relative size-32 shrink-0"
      role="img"
      aria-label={`Tany Score ${score} out of 100`}
    >
      <svg viewBox="0 0 128 128" className="size-full -rotate-90">
        <circle
          cx="64"
          cy="64"
          r={RADIUS}
          fill="none"
          strokeWidth="10"
          className="stroke-border"
        />
        <circle
          cx="64"
          cy="64"
          r={RADIUS}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - score / 100)}
          className={cn("stroke-current", bandColour[band])}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl leading-none font-semibold tabular-nums">
          {score}
        </span>
        <span className="mt-1 text-xs text-muted-foreground">out of 100</span>
      </div>
    </div>
  )
}

const statusIcon: Record<
  CheckStatus,
  { icon: typeof Alert02Icon; className: string }
> = {
  good: { icon: CheckmarkCircle02Icon, className: "text-success" },
  ok: { icon: CheckmarkCircle02Icon, className: "text-primary" },
  concern: { icon: Alert02Icon, className: "text-destructive" },
  unknown: { icon: HelpCircleIcon, className: "text-muted-foreground" },
}

function CheckItem({
  label,
  detail,
  status,
}: {
  label: string
  detail: string
  status: CheckStatus
}) {
  const { icon, className } = statusIcon[status]
  return (
    <li className="flex items-start gap-3 text-sm">
      <HugeiconsIcon
        icon={icon}
        strokeWidth={2}
        className={cn("mt-0.5 size-5 shrink-0", className)}
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground"> · {detail}</span>
      </span>
    </li>
  )
}

// Buyer-facing summary of the Tany Score: the number, the reasoning behind it, and what to verify.
export function TanyScoreCard({ result }: { result: TanyScore }) {
  const {
    score,
    band,
    verdict,
    coverage,
    capNote,
    categories,
    strengths,
    watchouts,
  } = result
  return (
    <section
      className="rounded-lg bg-muted p-5"
      aria-labelledby="tany-score-heading"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="tany-score-heading"
          className="text-xl font-medium tracking-tight"
        >
          Tany Score
        </h2>
        {coverage < 60 ? (
          <span className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium">
            Preliminary
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-5">
        <ScoreRing score={score} band={band} />
        <div className="min-w-0">
          <p className={cn("text-lg font-semibold", bandColour[band])}>
            {bandLabel[band]}
          </p>
          <p className="mt-1 text-sm">{verdict}</p>
          {capNote ? (
            <p className="mt-2 text-xs text-destructive">{capNote}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        {categories.map((category) => {
          const ratio = category.max ? category.points / category.max : 0
          return (
            <div key={category.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{category.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {Math.round(category.points)} / {category.max}
                </span>
              </div>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-background"
                role="progressbar"
                aria-label={category.label}
                aria-valuemin={0}
                aria-valuemax={category.max}
                aria-valuenow={Math.round(category.points)}
              >
                <div
                  className={cn("h-full rounded-full", barColour(ratio))}
                  style={{ width: `${ratio * 100}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {strengths.length ? (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold">Why it scores well</h3>
          <ul className="grid gap-2.5">
            {strengths.map((c) => (
              <CheckItem
                key={c.key}
                label={c.label}
                detail={c.detail}
                status="good"
              />
            ))}
          </ul>
        </div>
      ) : null}

      {watchouts.length ? (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold">
            Check before you decide
          </h3>
          <ul className="grid gap-2.5">
            {watchouts.map((c) => (
              <CheckItem
                key={c.key}
                label={c.label}
                detail={c.detail}
                status={c.status}
              />
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-6 text-xs text-muted-foreground">
        Based on {coverage}% of checks with details from the dealer. Missing
        details add no points, so ask the dealer about them. Always inspect the
        car in person before paying.
      </p>
    </section>
  )
}
