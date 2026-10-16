import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { CarsGrid } from "@/components/super/super-grids"
import { loadCars } from "@/lib/super/data"

export const metadata = { title: "Cars" }

export default async function Page() {
  const rows = await loadCars()
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Cars"
        description="Every car listed across all dealers."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No cars yet"
          body="Cars appear here once a dealer adds one."
        />
      ) : (
        <CarsGrid rows={rows} />
      )}
    </div>
  )
}
