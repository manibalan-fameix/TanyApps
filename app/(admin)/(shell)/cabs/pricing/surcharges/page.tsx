import { SurchargesManager } from "@/components/cabs/pricing"
import { PageHeader } from "@/components/restaurant/page-header"
import { classOptions, loadClasses, loadPricing } from "@/lib/cabs/page-data"
import { requireIndustry } from "@/lib/core/guards"
import { scopedDb } from "@/lib/db/scoped"

export const metadata = { title: "Extra charges" }
export const dynamic = "force-dynamic"

export default async function SurchargesPage() {
  const { dealer, owner } = await requireIndustry("cabs")
  const db = scopedDb(dealer.id)
  const [classes, pricing] = await Promise.all([loadClasses(db), loadPricing(db)])
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Extra charges" description="Night, hill, permit, airport and festival charges. Each one is added to the fare automatically when a trip matches, and shown to the customer as its own line." />
      <SurchargesManager rows={pricing.charges} classes={classOptions(classes)} owner={owner} />
    </div>
  )
}
