import { PackagesManager } from "@/components/cabs/packages"
import { PageHeader } from "@/components/restaurant/page-header"
import { classOptions, loadClasses, loadPricing } from "@/lib/cabs/page-data"
import { requireIndustry } from "@/lib/core/guards"
import { scopedDb } from "@/lib/db/scoped"

export const metadata = { title: "Tour packages" }
export const dynamic = "force-dynamic"

export default async function PackagesPage() {
  const { dealer, owner } = await requireIndustry("cabs")
  const db = scopedDb(dealer.id)
  const [classes, pricing] = await Promise.all([loadClasses(db), loadPricing(db)])
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Tour packages" description="Multi-day tours sold at a fixed price for each vehicle class, with a day-by-day itinerary." />
      <PackagesManager rows={pricing.packages} classes={classOptions(classes)} owner={owner} />
    </div>
  )
}
