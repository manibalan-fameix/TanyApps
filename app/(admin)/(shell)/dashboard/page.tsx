import Link from "next/link"
import {
  Car01Icon,
  CheckmarkBadge01Icon,
  CursorPointer01Icon,
  UserMultiple02Icon,
  ViewIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"

import { fetchPerformance } from "@/lib/analytics/query"
import { billingState } from "@/lib/billing/state"
import { WelcomeDialog } from "@/components/dashboard/welcome-dialog"
import { DashboardCharts } from "@/components/dashboard/performance-charts"
import { StatCard, type StatCardProps } from "@/components/dashboard/stat-card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { copy } from "@/lib/copy"
import { RestaurantDashboard } from "@/components/restaurant/restaurant-dashboard"
import { loadDashboardStats } from "@/lib/dashboard/stats"
import { getDealerContext } from "@/lib/auth/context"
import { tenantUrl } from "@/lib/env"
import { cn } from "@/lib/utils"

const isRecent = (created: Date) => Date.now() - created.getTime() < 7 * 86_400_000

export const metadata = { title: copy.admin.dashboard.title }

export default async function DashboardPage() {
  const ctx = await getDealerContext()

  if (ctx.status !== "ok") {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{copy.admin.dashboard.noDealerTitle}</CardTitle>
          <CardDescription>{copy.admin.dashboard.noDealerBody}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const { dealer, plan } = ctx
  if (dealer.industry === "restaurants") {
    return <RestaurantDashboard dealer={dealer} role={ctx.role} />
  }
  const stats = ctx.dealerInDb ? await loadDashboardStats(dealer.id) : null
  const liveCount =
    stats?.statusCounts.find((s) => s.status === "live")?.count ?? 0
  const publicUrl = tenantUrl(dealer.slug)
  const billing = billingState(dealer)
  const performance = ctx.dealerInDb
    ? await fetchPerformance(dealer.id, 7)
    : null
  const perf = performance?.ok ? performance.data : null
  const billingNote =
    billing.phase === "trial"
      ? `Free trial · ${billing.daysLeft} ${billing.daysLeft === 1 ? "day" : "days"} left`
      : billing.phase === "suspended"
        ? "Offline · add payment"
        : billing.cancelling
          ? "Cancelled"
          : billing.phase === "grace"
            ? "Payment pending"
            : null

  const n = (v: number) => v.toLocaleString("en-IN")
  const money = (v: number) =>
    v >= 1e7
      ? `₹${(v / 1e7).toFixed(2)} Cr`
      : v >= 1e5
        ? `₹${(v / 1e5).toFixed(2)} L`
        : `₹${n(v)}`

  const kpis: StatCardProps[] = [
    {
      icon: Car01Icon,
      label: copy.admin.dashboard.liveCars,
      value: copy.admin.dashboard.capUsage(liveCount, plan.maxLiveCars),
      pill: stats?.drafts
        ? `${stats.drafts} ${stats.drafts === 1 ? "draft" : "drafts"}`
        : undefined,
      progress: (liveCount / plan.maxLiveCars) * 100,
      href: "/cars",
    },
    {
      icon: Wallet01Icon,
      label: "Stock value",
      value: money(stats?.inventoryValue ?? 0),
      pill:
        stats?.avgDaysLive != null ? `${stats.avgDaysLive}d avg` : undefined,
    },
    {
      icon: CheckmarkBadge01Icon,
      label: "Sold · 30 days",
      value: String(stats?.soldLast30.count ?? 0),
      pill: stats?.soldLast30.count
        ? money(stats.soldLast30.revenue)
        : undefined,
      href: "/cars",
    },
    {
      icon: UserMultiple02Icon,
      label: "New leads",
      value: String(stats?.newLeads ?? 0),
      pill: `${stats?.leadsLast7 ?? 0} this week`,
      href: "/leads",
    },
    {
      icon: ViewIcon,
      label: "Views · 7 days",
      value: perf ? n(perf.totals.views) : "–",
      pill: perf ? `${n(perf.storeViews)} store` : undefined,
      href: "/reports",
    },
    {
      icon: CursorPointer01Icon,
      label: "Link clicks · 7 days",
      value: perf ? n(perf.totals.shareClicks) : "–",
      pill: perf ? `${n(perf.totals.chats)} chats` : undefined,
      href: "/reports",
    },
  ]

  return (
    <div className="flex w-full flex-col gap-4">
      <WelcomeDialog
        dealerId={dealer.id}
        isNew={isRecent(dealer.createdAt)}
        name={dealer.displayName}
        planLabel={plan.label}
        maxLiveCars={plan.maxLiveCars}
        free={billing.phase === "free"}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {copy.admin.dashboard.welcome(dealer.displayName)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here is how your showroom is doing.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {copy.admin.dashboard.openPage}
          </a>
          <Link href="/cars/new" className={cn(buttonVariants())}>
            Add a car
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </div>

      {stats ? (
        <DashboardCharts
          days={7}
          sources={
            perf
              ? Object.entries(perf.sourceTotals).map(([source, v]) => ({
                  source,
                  views: v.views,
                  clicks: v.clicks,
                }))
              : []
          }
          listings={(perf?.listings ?? [])
            .slice(0, 6)
            .map((l) => ({
              car: stats.carTitle[l.carSlug] ?? l.carSlug,
              views: l.views,
              clicks: l.shareClicks,
              chats: l.chats,
            }))}
          stages={stats.leadStages}
          statuses={stats.statusCounts}
          trend={stats.leadTrend}
        />
      ) : null}

      {stats ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardDescription>Latest enquiries</CardDescription>
              <CardTitle className="text-base">Recent leads</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y text-sm">
              {stats.recentLeads.length === 0 ? (
                <p className="text-muted-foreground">
                  No leads yet. Share a car link to get started.
                </p>
              ) : (
                stats.recentLeads.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.name}</p>
                      <p className="truncate text-muted-foreground">
                        {l.car} · {l.source.replace("_", " ")} · {l.ago}
                      </p>
                    </div>
                    <Badge
                      variant={l.status === "new" ? "default" : "secondary"}
                    >
                      {l.status}
                    </Badge>
                  </div>
                ))
              )}
              <Link href="/leads" className="pt-3 font-medium underline">
                See all leads
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Needs attention</CardDescription>
              <CardTitle className="text-base">Longest on the lot</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y text-sm">
              {stats.aging.length === 0 ? (
                <p className="text-muted-foreground">No live cars yet.</p>
              ) : (
                stats.aging.map((c) => (
                  <Link
                    key={c.id}
                    href={`/cars/${c.id}`}
                    className="flex items-center justify-between gap-3 py-2 hover:underline"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {c.title}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {c.price ? money(c.price) + " · " : ""}
                      {c.days} {c.days === 1 ? "day" : "days"}
                    </span>
                  </Link>
                ))
              )}
              <Link href="/reports" className="pt-3 font-medium underline">
                See how each car is doing
              </Link>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>{copy.admin.dashboard.plan}</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              {plan.label}
              <Badge variant="secondary">{ctx.role}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {billingNote ? (
              <p className="text-muted-foreground">{billingNote}</p>
            ) : null}
            <Link href="/settings/billing" className="font-medium underline">
              Manage billing
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{copy.admin.dashboard.publicPage}</CardDescription>
            <CardTitle className="text-base font-medium break-all">
              {publicUrl}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}
