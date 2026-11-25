import Link from "next/link"
import {
  Building03Icon,
  ChartLineData01Icon,
  Invoice01Icon,
  Wallet01Icon,
  CheckmarkBadge01Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons"

import { PageHeader } from "@/components/restaurant/page-header"
import { ListCard, Metric, MixCard } from "@/components/super/metrics"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SimpleTable } from "@/components/data-table/simple-table"
import { PLANS, SELLABLE_PLAN_KEYS, planPrice } from "@/lib/plans"
import { loadOverview } from "@/lib/super/data"
import {
  PHASE_LABEL,
  fmtDate,
  label,
  money,
  num,
  rupees,
} from "@/lib/super/format"

export const metadata = { title: "Revenue & plans" }

export default async function RevenuePage() {
  const o = await loadOverview()
  const trial = o.byPhase.find((p) => p.phase === "trial")?.count ?? 0
  const free = o.byPhase.find((p) => p.phase === "free")?.count ?? 0
  const arpa = o.payingBusinesses ? Math.round(o.mrr / o.payingBusinesses) : 0
  const convertible = trial + free
  const link = (id: string) => `/super/businesses/${id}`
  const yearly = o.paying.filter((r) => r.billingCycle === "yearly")
  const cycle = [
    { key: "monthly", count: o.paying.length - yearly.length },
    { key: "yearly", count: yearly.length },
  ]

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Revenue & plans"
        description="What Tany earns from subscriptions, what is at risk, and where the next revenue will come from."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Wallet01Icon}
          label="Monthly revenue (MRR)"
          value={money(o.mrr)}
          note={`${o.payingBusinesses} paying businesses`}
        />
        <Metric
          icon={ChartLineData01Icon}
          label="Yearly run rate (ARR)"
          value={money(o.arr)}
        />
        <Metric
          icon={UserMultiple02Icon}
          label="Average per business (ARPA)"
          value={rupees(arpa)}
          note="MRR ÷ paying businesses"
        />
        <Metric
          icon={Building03Icon}
          label="Free and trial accounts"
          value={num(convertible)}
          note={`${trial} on trial · ${free} free`}
        />
        <Metric
          icon={CheckmarkBadge01Icon}
          label="If trials convert"
          value={money(o.trialMrr)}
          note="Extra MRR at their chosen plan"
        />
        <Metric
          icon={Wallet01Icon}
          label="MRR at risk"
          value={money(o.atRiskMrr)}
          note="Paying but quiet or in payment trouble"
          invert
        />
        <Metric
          icon={Invoice01Icon}
          label="Cancelling"
          value={num(o.cancelling.length)}
          note="Access ends at period end"
          invert
        />
        <Metric
          icon={Invoice01Icon}
          label="Booking tokens paid"
          value={money(o.bookings.value)}
          note={`${num(o.bookings.paid)} bookings · paid to dealers, not Tany`}
          href="/super/bookings"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Businesses and revenue per plan</CardDescription>
            <CardTitle className="text-base">Plan mix</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleTable
              columns={[{ title: "Plan" }, { title: "Businesses", align: "right" }, { title: "MRR", align: "right" }]}
              rows={o.byPlan.map((p) => ({ id: p.plan, cells: [<span key="n" className="font-medium">{p.label}</span>, num(p.count), p.mrr ? rupees(p.mrr) : "—"] }))}
            />
          </CardContent>
        </Card>
        <MixCard
          title="Billing status"
          hint="Where every business is"
          rows={o.byPhase.map((p) => ({ key: p.phase, count: p.count }))}
          format={(k) => PHASE_LABEL[k] ?? label(k)}
        />
        <MixCard title="Billing cycle" hint="Paying businesses" rows={cycle} />
      </div>

      <Card>
        <CardHeader>
          <CardDescription>
            Everyone who pays today, biggest first
          </CardDescription>
          <CardTitle className="text-base">Paying businesses</CardTitle>
        </CardHeader>
        <CardContent>
          {o.paying.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No paying business yet.
            </p>
          ) : (
            <SimpleTable
              columns={[{ title: "Business" }, { title: "Plan" }, { title: "Cycle" }, { title: "Status" }, { title: "Paid through" }, { title: "MRR", align: "right" }]}
              rows={o.paying.map((r) => ({ id: r.id, cells: [<Link key="n" href={link(r.id)} className="font-medium hover:underline">{r.name}</Link>, r.planLabel, <span key="c" className="capitalize">{r.billingCycle}</span>, <Badge key="s" variant={r.phase === "active" ? "default" : "secondary"}>{PHASE_LABEL[r.phase]}</Badge>, fmtDate(r.paidThrough), rupees(r.mrr)] }))}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard
          title="Renewals in 30 days"
          hint="Paid plans coming up"
          empty="No paid plan renews in the next 30 days."
          rows={o.renewals.map((r) => ({
            key: r.id,
            href: link(r.id),
            primary: r.name,
            secondary: `${r.planLabel} · ${r.billingCycle}`,
            right: `${fmtDate(r.paidThrough)} · ${rupees(r.mrr)}`,
          }))}
        />
        <ListCard
          title="Trials ending in 7 days"
          hint="Call these first"
          empty="No trials end this week."
          rows={o.trialsEndingSoon.map((r) => ({
            key: r.id,
            href: link(r.id),
            primary: r.name,
            secondary: `${r.planLabel} · ${r.leads} leads · ${r.orders} orders`,
            right: fmtDate(r.trialEndsAt),
          }))}
        />
        <ListCard
          title="Payment problems"
          hint="Failed or retrying"
          empty="No payment problems."
          rows={o.paymentIssues.map((r) => ({
            key: r.id,
            href: link(r.id),
            primary: r.name,
            secondary: `${r.planLabel} · ${r.owner || r.phone}`,
            right: PHASE_LABEL[r.phase],
          }))}
        />
        <ListCard
          title="Ready to upgrade"
          hint="Free or trial, with real usage"
          empty="No free or trial business has real usage yet."
          rows={o.upgradeLeads.map((r) => ({
            key: r.id,
            href: link(r.id),
            primary: r.name,
            secondary: `${r.planLabel} · ${PHASE_LABEL[r.phase]}`,
            right: `${r.leads} leads · ${r.orders} orders`,
          }))}
        />
        <ListCard
          title="Cancelling"
          hint="Asked to cancel"
          empty="Nobody has cancelled."
          rows={o.cancelling.map((r) => ({
            key: r.id,
            href: link(r.id),
            primary: r.name,
            secondary: `${r.planLabel} · ${r.owner || r.phone}`,
            right: `Until ${fmtDate(r.paidThrough)}`,
          }))}
        />
        <Card>
          <CardHeader>
            <CardDescription>What we charge today</CardDescription>
            <CardTitle className="text-base">Price list</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleTable
              columns={[{ title: "Plan" }, { title: "Monthly", align: "right" }, { title: "Yearly", align: "right" }, { title: "Live cars", align: "right" }]}
              rows={SELLABLE_PLAN_KEYS.map((k) => ({ id: k, cells: [<span key="n" className="font-medium">{PLANS[k].label}</span>, rupees(planPrice(k, "monthly")), rupees(planPrice(k, "yearly")), PLANS[k].maxLiveCars] }))}
            />
            <p className="pt-3 text-xs text-muted-foreground">
              Prices exclude GST. Change them in lib/plans.ts.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
