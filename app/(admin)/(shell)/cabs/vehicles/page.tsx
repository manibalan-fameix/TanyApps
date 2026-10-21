import { VehiclesGrid } from "@/components/cabs/fleet"
import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { cabLimitsFor } from "@/lib/cabs/limits"
import { classOptions, loadClasses, loadVehicles } from "@/lib/cabs/page-data"
import { effectivePlanKey } from "@/lib/billing/state"
import { requireIndustry } from "@/lib/core/guards"
import { scopedDb } from "@/lib/db/scoped"

export const metadata = { title: "Vehicles" }
export const dynamic = "force-dynamic"

export default async function VehiclesPage() {
  const { dealer } = await requireIndustry("cabs")
  const db = scopedDb(dealer.id)
  const [rows, classes] = await Promise.all([loadVehicles(db, new Date()), loadClasses(db)])
  const limit = cabLimitsFor(effectivePlanKey(dealer))?.vehicles ?? 0
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Vehicles" description={`Your fleet and its paperwork. ${rows.length} of ${limit} vehicles used on your plan.`} />
      {classes.length === 0 ? <EmptyState title="Add a vehicle class first" body="Every vehicle belongs to a class such as Sedan or SUV. Add one under Vehicle classes." /> : null}
      <VehiclesGrid rows={rows} classes={classOptions(classes)} usage={{ used: rows.length, limit }} />
    </div>
  )
}
