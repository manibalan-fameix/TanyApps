import Link from "next/link"
import { Car01Icon, File02Icon, UserMultiple02Icon, Wallet01Icon } from "@hugeicons/core-free-icons"

import { StatCard } from "@/components/dashboard/stat-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { effectivePlanKey } from "@/lib/billing/state"
import { countExpiry } from "@/lib/cabs/expiry"
import { cabLimitsFor } from "@/lib/cabs/limits"
import { PageHeader } from "@/components/restaurant/page-header"
import { scopedDb } from "@/lib/db/scoped"
import type { dealers } from "@/lib/db/schema"
import { tenantUrl } from "@/lib/env"

type Dealer = typeof dealers.$inferSelect

/** The first screen of a cab operator: how full the plan is, what needs attention, and what is left to set up. */
export async function CabsDashboard({ dealer }: { dealer: Dealer }) {
  const db = scopedDb(dealer.id)
  const now = new Date()
  const [classes, vehicles, drivers, vDocs, dDocs, cards, settings] = await Promise.all([
    db.vehicleClasses.count(),
    db.vehicles.select(),
    db.drivers.select(),
    db.vehicleDocuments.select(),
    db.driverDocuments.select(),
    db.rateCards.count(),
    db.cabSettings.select(),
  ])
  const limits = cabLimitsFor(effectivePlanKey(dealer))
  const docs = countExpiry([...vDocs.map((d) => d.validTill), ...dDocs.map((d) => d.validTill), ...drivers.map((d) => d.licenceValidTill)], now)
  const s = settings[0]

  const steps = [
    { done: classes > 0, label: "Add a vehicle class", href: "/cabs/vehicle-classes", why: "Sedan, SUV, Tempo Traveller: what customers choose." },
    { done: vehicles.length > 0, label: "Add your vehicles", href: "/cabs/vehicles", why: "Your fleet, with RC, insurance and permit dates." },
    { done: drivers.length > 0, label: "Add your drivers", href: "/cabs/drivers", why: "Licences and documents, with reminders before they expire." },
    { done: cards > 0, label: "Set your rates", href: "/cabs/pricing", why: "Per km, minimum km per day, packages. Nothing is priced until you do." },
    { done: s?.gstRateBps != null && s?.stateCode != null, label: "Set your GST and state", href: "/cabs/settings", why: "Needed before a fare can be quoted. Enter 0 if you do not charge GST." },
  ]
  const remaining = steps.filter((x) => !x.done).length

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title={dealer.displayName} description={`Your booking page: ${tenantUrl(dealer.slug)}`} />

      {docs.expired > 0 || docs.soon > 0 ? (
        <Alert variant={docs.expired > 0 ? "destructive" : "default"}>
          <AlertTitle>{docs.expired > 0 ? `${docs.expired} document${docs.expired === 1 ? " has" : "s have"} expired` : `${docs.soon} document${docs.soon === 1 ? "" : "s"} expiring within 30 days`}</AlertTitle>
          <AlertDescription>
            {docs.expired > 0 && docs.soon > 0 ? `${docs.soon} more expire within 30 days. ` : ""}
            Check <Link className="font-medium underline" href="/cabs/vehicles">vehicles</Link> and <Link className="font-medium underline" href="/cabs/drivers">drivers</Link>.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Car01Icon} label="Vehicles" value={`${vehicles.length}${limits ? ` / ${limits.vehicles}` : ""}`} progress={limits ? Math.min(100, (vehicles.length * 100) / limits.vehicles) : undefined} href="/cabs/vehicles" />
        <StatCard icon={UserMultiple02Icon} label="Drivers" value={`${drivers.length}${limits ? ` / ${limits.drivers}` : ""}`} progress={limits ? Math.min(100, (drivers.length * 100) / limits.drivers) : undefined} href="/cabs/drivers" />
        <StatCard icon={File02Icon} label="Documents needing attention" value={String(docs.expired + docs.soon)} pill={docs.expired > 0 ? `${docs.expired} expired` : undefined} />
        <StatCard icon={Wallet01Icon} label="Rate cards" value={String(cards)} href="/cabs/pricing" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{remaining === 0 ? "You are set up" : `${remaining} ${remaining === 1 ? "step" : "steps"} left to set up`}</CardTitle>
          <CardDescription>{remaining === 0 ? "Customers can be quoted a fare. Bookings open in the next release." : "Do these in order and you can quote your first fare."}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col divide-y">
            {steps.map((x, i) => (
              <li key={x.label} className="flex items-start gap-3 py-3">
                <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${x.done ? "bg-primary text-primary-foreground" : "border"}`}>{x.done ? "✓" : i + 1}</span>
                <span className="flex flex-col">
                  <Link href={x.href} className={`font-medium ${x.done ? "text-muted-foreground line-through" : "underline"}`}>{x.label}</Link>
                  <span className="text-sm text-muted-foreground">{x.why}</span>
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
