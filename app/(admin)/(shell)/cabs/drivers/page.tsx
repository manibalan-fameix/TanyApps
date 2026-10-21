import { DriversGrid } from "@/components/cabs/drivers"
import { PageHeader } from "@/components/restaurant/page-header"
import { effectivePlanKey } from "@/lib/billing/state"
import { cabLimitsFor } from "@/lib/cabs/limits"
import { loadDrivers } from "@/lib/cabs/page-data"
import { requireIndustry } from "@/lib/core/guards"
import { scopedDb } from "@/lib/db/scoped"

export const metadata = { title: "Drivers" }
export const dynamic = "force-dynamic"

export default async function DriversPage() {
  const { dealer } = await requireIndustry("cabs")
  const rows = await loadDrivers(scopedDb(dealer.id), new Date())
  const limit = cabLimitsFor(effectivePlanKey(dealer))?.drivers ?? 0
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Drivers" description={`Your drivers, their licences and documents. ${rows.length} of ${limit} drivers used on your plan.`} />
      <DriversGrid rows={rows} usage={{ used: rows.length, limit }} />
    </div>
  )
}
