import { ClassesManager } from "@/components/cabs/fleet"
import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { loadClasses } from "@/lib/cabs/page-data"
import { requireIndustry } from "@/lib/core/guards"
import { scopedDb } from "@/lib/db/scoped"

export const metadata = { title: "Vehicle classes" }
export const dynamic = "force-dynamic"

export default async function VehicleClassesPage() {
  const { dealer } = await requireIndustry("cabs")
  const rows = await loadClasses(scopedDb(dealer.id))
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Vehicle classes" description="What a customer chooses: Sedan, SUV, Tempo Traveller. Set seats, bags and a picture here; add the vehicles themselves under Vehicles." />
      {rows.length === 0 ? <EmptyState title="No vehicle classes yet" body="Add your first class, such as Sedan. You need at least one before you can add vehicles or prices." /> : null}
      <ClassesManager rows={rows} />
    </div>
  )
}
