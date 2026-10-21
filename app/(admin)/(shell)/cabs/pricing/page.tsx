import { FareCalculator } from "@/components/cabs/calculator"
import { RateCardsManager } from "@/components/cabs/pricing"
import { PageHeader } from "@/components/restaurant/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { classOptions, loadClasses, loadPricing } from "@/lib/cabs/page-data"
import { requireIndustry } from "@/lib/core/guards"
import { scopedDb } from "@/lib/db/scoped"

export const metadata = { title: "Rate cards" }
export const dynamic = "force-dynamic"

export default async function PricingPage() {
  const { dealer, owner } = await requireIndustry("cabs")
  const db = scopedDb(dealer.id)
  const [classes, pricing] = await Promise.all([loadClasses(db), loadPricing(db)])
  const options = classOptions(classes)
  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title="Rate cards" description="What you charge for each kind of trip, by vehicle class. Extra charges, tour packages and GST are set on their own pages." />
      <RateCardsManager cards={pricing.cards} classes={options} owner={owner} />
      <Card>
        <CardHeader>
          <CardTitle>Try a fare</CardTitle>
          <CardDescription>The same calculation a booking uses, with your saved rate cards, extra charges and settings. Nothing here is saved.</CardDescription>
        </CardHeader>
        <CardContent>
          <FareCalculator classes={options} data={pricing.calc} homeState={pricing.settings.stateCode} />
        </CardContent>
      </Card>
    </div>
  )
}
