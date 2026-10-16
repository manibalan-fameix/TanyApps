import {
  Building03Icon,
  Car01Icon,
  ChartLineData01Icon,
  Invoice01Icon,
  ShoppingBag01Icon,
  UserMultiple02Icon,
  Wallet01Icon,
  CheckmarkBadge01Icon,
} from "@hugeicons/core-free-icons"

import { PageHeader } from "@/components/restaurant/page-header"
import { RangeSwitch, parseRange } from "@/components/restaurant/range-switch"
import {
  FunnelCard,
  ListCard,
  Metric,
  MixCard,
  healthLabel,
} from "@/components/super/metrics"
import { TrendChart } from "@/components/super/super-charts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { loadOverview } from "@/lib/super/data"
import { loadActivity, loadPlatformAnalytics } from "@/lib/super/queries"
import {
  PHASE_LABEL,
  fmtDate,
  fmtDateTime,
  label,
  money,
  num,
  rupees,
} from "@/lib/super/format"

export const metadata = { title: "Overview" }

export default async function SuperOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const days = parseRange((await searchParams).days)
  const [o, a, activity] = await Promise.all([
    loadOverview(),
    loadPlatformAnalytics(days),
    loadActivity(12),
  ])
  const arpa = o.payingBusinesses ? Math.round(o.mrr / o.payingBusinesses) : 0
  const link = (id: string) => `/super/businesses/${id}`

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Tany overview"
        description={`Everything across every business on the platform. Changes compare with the ${days} days before.`}
      >
        <RangeSwitch path="/super" days={days} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Building03Icon}
          label="Businesses"
          value={num(o.businesses)}
          delta={a.signups.delta}
          note={`${a.signups.value} joined in ${days} days · ${o.payingBusinesses} paying`}
          href="/super/businesses"
        />
        <Metric
          icon={Wallet01Icon}
          label="Monthly revenue (MRR)"
          value={money(o.mrr)}
          note={`ARPA ${rupees(arpa)} · ${money(o.trialMrr)} more if trials convert`}
          href="/super/revenue"
        />
        <Metric
          icon={ChartLineData01Icon}
          label="Yearly run rate (ARR)"
          value={money(o.arr)}
          note={`${money(o.atRiskMrr)} MRR at risk`}
          href="/super/revenue"
        />
        <Metric
          icon={CheckmarkBadge01Icon}
          label="Platform sales (GMV)"
          value={money(a.gmv.value)}
          delta={a.gmv.delta}
          note={`${num(a.orders.value)} orders · avg ${rupees(a.aov.value)}`}
          href="/super/orders"
        />
        <Metric
          icon={ShoppingBag01Icon}
          label="Orders"
          value={num(a.orders.value)}
          delta={a.orders.delta}
          note={`${num(o.orders.total)} all time`}
          href="/super/orders"
        />
        <Metric
          icon={UserMultiple02Icon}
          label="Leads"
          value={num(a.leads.value)}
          delta={a.leads.delta}
          note={`${num(o.leads.total)} all time`}
          href="/super/leads"
        />
        <Metric
          icon={Invoice01Icon}
          label="Booking tokens paid"
          value={money(a.bookingValue.value)}
          delta={a.bookingValue.delta}
          note={`${num(o.bookings.paid)} bookings all time`}
          href="/super/bookings"
        />
        <Metric
          icon={Car01Icon}
          label="Cars live"
          value={num(o.cars.live)}
          note={`${num(o.cars.total)} listed · ${num(o.cars.sold)} sold`}
          href="/super/cars"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Last {days} days</CardDescription>
            <CardTitle className="text-base">
              Sales from restaurant orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={a.series}
              series={[{ key: "gmv", name: "Sales (₹)", money: true }]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Last {days} days</CardDescription>
            <CardTitle className="text-base">
              Leads, orders and new businesses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={a.series}
              series={[
                { key: "leads", name: "Leads", type: "line" },
                { key: "orders", name: "Orders", type: "line" },
                { key: "signups", name: "New businesses", type: "line" },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <FunnelCard
          title="Activation funnel"
          hint="From sign-up to paying"
          steps={a.funnel}
        />
        <MixCard
          title="Business health"
          hint="Active in the last 30 days, at risk or dormant"
          rows={a.health}
          format={healthLabel}
        />
        <MixCard
          title="Billing status"
          hint="Where each business is"
          rows={o.byPhase.map((p) => ({ key: p.phase, count: p.count }))}
          format={(k) => PHASE_LABEL[k] ?? label(k)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard
          title="Payment problems"
          hint="Needs attention"
          empty="No payment problems."
          rows={o.paymentIssues.slice(0, 6).map((r) => ({
            key: r.id,
            href: link(r.id),
            primary: r.name,
            secondary: `${r.planLabel} · ${r.owner || r.phone}`,
            right: PHASE_LABEL[r.phase] ?? r.phase,
          }))}
        />
        <ListCard
          title="Trials ending soon"
          hint="Follow up this week"
          empty="No trials end in the next 7 days."
          rows={o.trialsEndingSoon.slice(0, 6).map((r) => ({
            key: r.id,
            href: link(r.id),
            primary: r.name,
            secondary: `${r.planLabel} · ${r.leads} leads · ${r.orders} orders`,
            right: `Ends ${fmtDate(r.trialEndsAt)}`,
          }))}
        />
        <ListCard
          title="Paying but gone quiet"
          hint="Most likely to cancel"
          empty="Every paying business was active this month."
          rows={o.dormantPaying.slice(0, 6).map((r) => ({
            key: r.id,
            href: link(r.id),
            primary: r.name,
            secondary: `${rupees(r.mrr)} / month`,
            right: r.lastActivityAt
              ? `Last active ${fmtDate(r.lastActivityAt)}`
              : "Never active",
          }))}
        />
        <ListCard
          title="Ready to upgrade"
          hint="Trial or free, and already getting customers"
          empty="No free or trial business has real usage yet."
          rows={o.upgradeLeads.slice(0, 6).map((r) => ({
            key: r.id,
            href: link(r.id),
            primary: r.name,
            secondary: `${r.planLabel} · ${PHASE_LABEL[r.phase]}`,
            right: `${r.leads} leads · ${r.orders} orders`,
          }))}
        />
        <ListCard
          title="Renewals in 30 days"
          hint="Paid plans coming up"
          empty="No paid plan renews in the next 30 days."
          rows={o.renewals.slice(0, 6).map((r) => ({
            key: r.id,
            href: link(r.id),
            primary: r.name,
            secondary: `${r.planLabel} · ${r.billingCycle}`,
            right: fmtDate(r.paidThrough),
          }))}
        />
        <ListCard
          title="Live activity"
          hint="Latest across the platform"
          empty="Nothing has happened yet."
          footer={{ href: "/super/activity", label: "See all activity" }}
          rows={activity.map((x, i) => ({
            key: `${x.kind}${i}`,
            href: link(x.businessId),
            primary: x.title,
            secondary: `${x.business}${x.detail ? ` · ${x.detail}` : ""}`,
            right: fmtDateTime(x.at),
          }))}
        />
      </div>
    </div>
  )
}
