import { PageHeader } from "@/components/restaurant/page-header"
import { ListCard } from "@/components/super/metrics"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { FEATURES } from "@/lib/core/usage"
import { label } from "@/lib/super/format"
import { loadUsageOverview } from "@/lib/super/usage"

import { submitUsageLimit } from "./actions"

export const metadata = { title: "Usage and cost" }
export const dynamic = "force-dynamic"

const rupees = (micros: number) => `₹${(micros / 1_000_000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

// Where infrastructure cost comes from, per product, per business and per feature. ESTIMATES from the unit costs set below; real provider
// invoices are tracked separately. New limits start in "observe" (measure and warn, never block).
export default async function UsagePage() {
  const o = await loadUsageOverview()
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Usage and cost" description={`${o.period}. Estimated cost so far ${rupees(o.estMicros)}${o.projectedMicros !== null ? `, projected ${rupees(o.projectedMicros)} for the month` : ". Set a unit cost on a feature to see rupee estimates."}`} />
      <ListCard
        title="By product and feature"
        hint="Biggest estimated cost first"
        empty="Nothing metered yet this month."
        rows={o.byProduct.map((r) => ({ key: `${r.product}-${r.feature}`, primary: `${label(r.product)} · ${label(r.feature)}`, secondary: `${r.quantity.toLocaleString("en-IN")} ${FEATURES[r.feature as keyof typeof FEATURES]?.unit ?? "units"}`, right: r.estMicros ? rupees(r.estMicros) : "no unit cost" }))}
      />
      <ListCard
        title="Top businesses"
        hint="By estimated cost, then volume"
        empty="Nothing metered yet."
        rows={o.topTenants.map((r) => ({ key: `${r.businessId}-${r.feature}`, href: `/super/businesses/${r.businessId}`, primary: r.name, secondary: `${label(r.feature)} · ${r.quantity.toLocaleString("en-IN")}`, right: r.estMicros ? rupees(r.estMicros) : "—" }))}
      />
      <ListCard
        title="Unusual today"
        hint="At least 3x the previous 7-day daily average, and enough to matter (20 requests, an hour of processing, 100 MB); top 5 per feature"
        empty="Nothing unusual."
        rows={o.abnormal.map((r) => ({ key: `${r.businessId}-${r.feature}`, href: `/super/businesses/${r.businessId}`, primary: `${r.name} · ${label(r.feature)}`, secondary: `${r.today} today, ${r.avg7} a day before`, right: `${r.ratio}x` }))}
      />
      <ListCard
        title="Allowance use"
        hint="Businesses with a monthly allowance set"
        empty="No monthly allowances are set (everything is measure-only)."
        rows={o.utilization.map((r) => ({ key: `${r.businessId}-${r.feature}`, href: `/super/businesses/${r.businessId}`, primary: `${r.name} · ${label(r.feature)}`, secondary: `${r.used.toLocaleString("en-IN")} of ${r.included.toLocaleString("en-IN")} · ${r.mode}`, right: `${r.pct}%` }))}
      />
      <Card>
        <CardHeader>
          <CardTitle>Set a limit</CardTitle>
          <CardDescription>Leave the business empty for the platform default of a feature. Leave a number empty for no limit. The daily abuse ceiling is enforced as soon as it is set; the monthly allowance only warns unless mode is enforce. Every change is recorded in the security trail.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={submitUsageLimit} className="grid gap-3 sm:grid-cols-2">
            <select name="feature" required className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Feature">
              {Object.keys(FEATURES).map((f) => (
                <option key={f} value={f}>{label(f)}</option>
              ))}
            </select>
            <Input name="business" placeholder="Business id (empty = platform default)" aria-label="Business id" />
            <Input name="includedMonthly" type="number" min={0} placeholder="Included per month" aria-label="Included per month" />
            <Input name="abuseDaily" type="number" min={0} placeholder="Abuse ceiling per day" aria-label="Abuse ceiling per day" />
            <Input name="estUnitCostMicros" type="number" min={0} placeholder="Estimated cost per unit (micro-rupees)" aria-label="Estimated cost per unit in micro-rupees" />
            <Input name="topupQuantity" type="number" min={0} placeholder="Top-up this month" aria-label="Top-up this month" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="exempt" /> Exempt from blocking</label>
            <select name="mode" className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Mode" defaultValue="observe">
              <option value="observe">Observe (warn only)</option>
              <option value="enforce">Enforce (block over allowance)</option>
            </select>
            <Button type="submit" className="sm:col-span-2">Save limit</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
