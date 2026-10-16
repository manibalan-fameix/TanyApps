import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { BookingsGrid } from "@/components/super/super-grids"
import { loadBookings } from "@/lib/super/data"

export const metadata = { title: "Bookings" }

export default async function Page() {
  const rows = await loadBookings()
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Bookings"
        description="Token payments buyers made to hold a car."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          body="Bookings appear when a buyer pays a token."
        />
      ) : (
        <BookingsGrid rows={rows} />
      )}
    </div>
  )
}
