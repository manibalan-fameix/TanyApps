"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Idea01Icon } from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { copy } from "@/lib/copy"
import {
  FREE_PLAN_KEY,
  PLAN_KEYS,
  PLANS,
  SELLABLE_PLAN_KEYS,
  planPrice,
  YEARLY_PAID_MONTHS,
  type BillingCycle,
  type PlanKey,
  type SellablePlanKey,
} from "@/lib/plans"
import { cn } from "@/lib/utils"

const t = copy.admin.pricing
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`
/** What a year on this plan saves against twelve monthly payments: the months that are free. */
const yearlySaving = (plan: SellablePlanKey) =>
  (PLANS[plan].monthlyPrice as number) * (12 - YEARLY_PAID_MONTHS)
/** What one live car costs a month on this plan when it is full: the plan's price, spread over its cars. */
const perCar = (plan: SellablePlanKey, cycle: BillingCycle) =>
  Math.round(
    planPrice(plan, cycle) /
      (cycle === "yearly" ? 12 : 1) /
      PLANS[plan].maxLiveCars
  )
/** The sum behind it, in the open: "₹2,999 ÷ 25 cars". */
const perCarSum = (plan: SellablePlanKey, cycle: BillingCycle) =>
  cycle === "yearly"
    ? `${rupees(planPrice(plan, cycle))} ÷ 12 months ÷ ${PLANS[plan].maxLiveCars} cars`
    : `${rupees(planPrice(plan, cycle))} ÷ ${PLANS[plan].maxLiveCars} cars`
const rank = (p: PlanKey) => PLAN_KEYS.indexOf(p)
const TONE: Record<PlanStatus["tone"], string> = {
  success: "border-success/30 bg-success/15 text-success",
  primary: "border-primary/30 bg-primary/10 text-primary",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
}
const POPULAR: PlanKey = "growth"

/** Film grain as an inline SVG, so there is nothing to download. A different seed and grain size per plan. */
const noise = (seed: number, freq: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.1 -0.1'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`
  )}")`

const mix = (token: string, pct: number) =>
  `color-mix(in oklab, var(${token}) ${pct}%, transparent)`

/** What each plan card fills with on hover: its own blend of blue and red, and its own grain. Green is kept for the active plan. */
const HOVER_FILL: Record<PlanKey, { gradient: string; noise: string }> = {
  free: {
    gradient: `radial-gradient(120% 90% at 0% 0%, ${mix("--success", 30)} 0%, transparent 60%), radial-gradient(90% 80% at 100% 100%, ${mix("--primary", 14)} 0%, transparent 65%)`,
    noise: noise(1, 0.75),
  },
  starter: {
    gradient: `radial-gradient(120% 90% at 0% 0%, ${mix("--primary", 40)} 0%, transparent 60%), radial-gradient(90% 80% at 100% 100%, ${mix("--primary", 20)} 0%, transparent 65%)`,
    noise: noise(3, 0.8),
  },
  growth: {
    gradient: `radial-gradient(110% 90% at 100% 0%, ${mix("--primary", 42)} 0%, transparent 58%), radial-gradient(100% 90% at 0% 100%, ${mix("--destructive", 30)} 0%, transparent 62%)`,
    noise: noise(11, 0.65),
  },
  pro: {
    gradient: `linear-gradient(160deg, ${mix("--primary", 38)} 0%, transparent 50%), radial-gradient(110% 90% at 100% 100%, ${mix("--destructive", 30)} 0%, transparent 62%)`,
    noise: noise(21, 0.9),
  },
  scale: {
    gradient: `radial-gradient(100% 100% at 50% 0%, ${mix("--destructive", 36)} 0%, transparent 60%), radial-gradient(110% 90% at 0% 100%, ${mix("--primary", 30)} 0%, transparent 64%)`,
    noise: noise(35, 0.55),
  },
}

/** The plan the dealer is on: green, so it reads as "this one is live" and can never be mistaken for a hover. */
const ACTIVE_FILL = {
  gradient: `radial-gradient(120% 95% at 0% 0%, ${mix("--success", 46)} 0%, transparent 62%), radial-gradient(100% 90% at 100% 100%, ${mix("--success", 26)} 0%, transparent 66%), radial-gradient(70% 60% at 100% 0%, ${mix("--primary", 14)} 0%, transparent 70%)`,
  noise: noise(7, 0.7),
}

/** Where the dealer stands on the plan they are on, shown inside that plan's card. */
export type PlanStatus = {
  badge: string
  /** The pill's colour: green when paid, blue for a trial, red when something needs attention. */
  tone: "success" | "primary" | "destructive" | "muted"
  headline: string
  lines: string[]
}

type Props = {
  /** The plan those details belong to (the one in force now, which can differ from `currentPlan` when a switch is queued). */
  statusPlan: PlanKey
  status: PlanStatus
  cycle: BillingCycle
  onCycle: (c: BillingCycle) => void
  /** The plan the dealer is on (or is about to switch to). */
  currentPlan: PlanKey
  currentCycle: BillingCycle
  hasPaymentMethod: boolean
  cancelling: boolean
  canManage: boolean
  pending: boolean
  onChoose: (plan: SellablePlanKey) => void
  /** Small print in the strip under the plans. */
  note?: React.ReactNode
}

/** Button text for one plan, given where the dealer is now. */
function ctaLabel(plan: SellablePlanKey, p: Props) {
  const name = PLANS[plan].label
  if (!p.hasPaymentMethod)
    return p.cancelling ? `Restart with ${name}` : `Choose ${name}`
  if (plan === p.currentPlan && p.cycle === p.currentCycle)
    return "Current plan"
  if (plan === p.currentPlan)
    return p.cycle === "yearly" ? "Switch to yearly" : "Switch to monthly"
  return rank(plan) > rank(p.currentPlan)
    ? `Upgrade to ${name}`
    : `Downgrade to ${name}`
}

/** The plans side by side: a gradient header, one big button, then what is included. */
export function PricingTable(props: Props) {
  const {
    cycle,
    onCycle,
    statusPlan,
    status,
    currentPlan,
    currentCycle,
    hasPaymentMethod,
    canManage,
    pending,
    onChoose,
    note,
  } = props
  const yearly = cycle === "yearly"

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <Tabs
        value={cycle}
        onValueChange={(v) => onCycle(v === "yearly" ? "yearly" : "monthly")}
      >
        <TabsList aria-label="Billing period" className="h-12 p-1.5">
          <TabsTrigger
            value="monthly"
            className="h-full min-w-32 px-6 text-base"
          >
            {t.monthly}
          </TabsTrigger>
          <TabsTrigger
            value="yearly"
            className="h-full min-w-32 gap-2 px-6 text-base"
          >
            {t.yearly}
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {t.yearlyBadge}
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="w-full overflow-hidden rounded-[2rem] border border-border bg-card">
        {/* gap-px on a coloured grid draws the thin dividers, whatever the column count. */}
        <div className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-5 md:[&>section:last-child]:col-span-2 xl:[&>section:last-child]:col-span-1">
          {PLAN_KEYS.map((key) => {
            const info = t.plans[key]
            const sellable = (SELLABLE_PLAN_KEYS as readonly string[]).includes(
              key
            )
            // The plan the dealer is on, whichever billing period is showing: it wears the gradient by default, and the others only on hover.
            const isFree = key === FREE_PLAN_KEY
            const isActivePlan =
              (isFree || (sellable && hasPaymentMethod)) && key === currentPlan
            // The exact plan and period already bought: nothing to click.
            const isCurrent = isActivePlan && (isFree || cycle === currentCycle)
            const showStatus = key === statusPlan
            return (
              <section
                key={key}
                className="flex flex-col gap-6 bg-card p-5 sm:p-6"
                data-testid={`plan-${key}`}
              >
                <div className="group/plan relative isolate flex min-h-72 flex-col justify-between gap-8 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-muted via-background to-muted/60 p-6">
                  {/* The gradient: on hover for the other plans, always on for the plan the dealer is already on. */}
                  <div
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-0 -z-10 transition-opacity duration-500 ease-out",
                      isActivePlan
                        ? "opacity-100"
                        : "opacity-0 group-hover/plan:opacity-100"
                    )}
                    style={{
                      backgroundImage: (isActivePlan
                        ? ACTIVE_FILL
                        : HOVER_FILL[key]
                      ).gradient,
                    }}
                  />
                  <div
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-0 -z-10 mix-blend-overlay transition-opacity duration-500 ease-out",
                      isActivePlan
                        ? "opacity-70"
                        : "opacity-0 group-hover/plan:opacity-70"
                    )}
                    style={{
                      backgroundImage: (isActivePlan
                        ? ACTIVE_FILL
                        : HOVER_FILL[key]
                      ).noise,
                    }}
                  />
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-3xl font-medium tracking-tight">
                        {PLANS[key].label}
                      </h3>
                      {key === POPULAR ? (
                        <span className="rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                          {t.mostPopular}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-lg text-muted-foreground">
                      {info.blurb}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    {isFree ? (
                      <>
                        <p className="text-4xl font-medium tracking-tight">
                          {t.freePrice}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t.freeForever}
                        </p>
                      </>
                    ) : sellable ? (
                      <>
                        <p className="flex flex-wrap items-baseline gap-2">
                          <span className="text-4xl font-medium tracking-tight">
                            {rupees(planPrice(key as SellablePlanKey, cycle))}
                          </span>
                          <span className="text-lg text-muted-foreground">
                            {yearly ? t.perYear : t.perMonth}
                          </span>
                        </p>
                        <p
                          className="text-sm text-muted-foreground"
                          data-testid={`plan-gst-${key}`}
                        >
                          {t.exclGst}
                        </p>
                        {yearly ? (
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span
                              className="rounded-full border border-success/30 bg-success/15 px-2.5 py-0.5 font-medium text-success"
                              data-testid={`plan-saving-${key}`}
                            >
                              {t.save(
                                rupees(yearlySaving(key as SellablePlanKey))
                              )}
                            </span>
                            {t.yearlyNote}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-4xl font-medium tracking-tight">
                        {t.custom}
                      </p>
                    )}
                    {showStatus ? (
                      <div
                        className="mt-4 flex flex-col gap-1 border-t border-border/60 pt-4 text-sm"
                        data-testid="plan-status"
                      >
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground">
                            {t.currentPlan}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-6 px-2.5 text-xs",
                              TONE[status.tone]
                            )}
                          >
                            {status.badge}
                          </Badge>
                        </p>
                        <p className="font-medium">{status.headline}</p>
                        {status.lines.map((line) => (
                          <p key={line} className="text-muted-foreground">
                            {line}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                {isFree ? (
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-14 w-full rounded-full text-base"
                    disabled
                    data-testid={`plan-cta-${key}`}
                  >
                    {isCurrent ? t.currentPlan : t.freeCta}
                  </Button>
                ) : sellable ? (
                  <Button
                    size="lg"
                    variant={isCurrent ? "outline" : "default"}
                    className={cn(
                      "h-14 w-full rounded-full text-base",
                      !isCurrent &&
                        "bg-foreground text-background hover:bg-foreground/90"
                    )}
                    disabled={!canManage || pending || isCurrent}
                    onClick={() => onChoose(key as SellablePlanKey)}
                    data-testid={`plan-cta-${key}`}
                  >
                    {pending
                      ? "Please wait..."
                      : ctaLabel(key as SellablePlanKey, props)}
                  </Button>
                ) : (
                  <a
                    href={`mailto:${copy.brand.contactEmail}?subject=${encodeURIComponent(`${copy.brand.name} ${PLANS[key].label}`)}`}
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "h-14 w-full rounded-full bg-foreground text-base text-background hover:bg-foreground/90"
                    )}
                    data-testid={`plan-cta-${key}`}
                  >
                    {t.talkToUs}
                  </a>
                )}

                <ul className="flex flex-col">
                  {sellable ? (
                    <li
                      className="flex items-start gap-3 border-b border-dashed border-border py-4 text-base"
                      data-testid={`plan-per-car-${key}`}
                    >
                      <HugeiconsIcon
                        icon={Idea01Icon}
                        strokeWidth={1.5}
                        className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                      />
                      <span className="flex flex-col">
                        <span className="font-medium">
                          {t.perCar(
                            rupees(perCar(key as SellablePlanKey, cycle))
                          )}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {perCarSum(key as SellablePlanKey, cycle)}
                        </span>
                      </span>
                    </li>
                  ) : null}
                  {info.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-3 border-b border-dashed border-border py-4 text-base last:border-b-0"
                    >
                      <HugeiconsIcon
                        icon={Idea01Icon}
                        strokeWidth={1.5}
                        className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
        <div className="flex flex-col gap-1 border-t border-border px-6 py-6 text-center text-base text-muted-foreground">
          <p className="font-medium text-foreground">{t.gstNote}</p>
          {note ? <p>{note}</p> : null}
        </div>
      </div>
    </div>
  )
}
