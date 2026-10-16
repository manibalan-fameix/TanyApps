import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { BusinessesGrid } from "@/components/super/super-grids"
import { loadBusinesses } from "@/lib/super/data"

export const metadata = { title: "Businesses" }

export default async function BusinessesPage() {
  const rows = await loadBusinesses()
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Businesses"
        description="Every dealership and restaurant on Tany. Open one for the full picture."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No businesses yet"
          body="Businesses appear here after they finish onboarding."
        />
      ) : (
        <BusinessesGrid rows={rows} />
      )}
    </div>
  )
}
