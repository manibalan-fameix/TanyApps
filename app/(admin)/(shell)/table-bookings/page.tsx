import { desc } from "drizzle-orm"

import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { type TableBookingRow, TableBookingsGrid } from "@/components/restaurant/restaurant-grids"
import { tableBookings } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"

export const metadata = { title: "Table bookings" }
export const dynamic = "force-dynamic"

export default async function TableBookingsPage() {
  const { dealer } = await requireRestaurant()
  const all = await scopedDb(dealer.id).tableBookings.select(undefined, { orderBy: [desc(tableBookings.createdAt)], limit: 200 })
  const rows: TableBookingRow[] = all.map((b) => ({
    id: b.id,
    name: b.name,
    phone: b.phone,
    guests: b.guests,
    // Stored as the restaurant's own date and time; the grid shows it in the same clock.
    when: new Date(`${b.bookingDate}T${b.bookingTime}:00+05:30`).toISOString(),
    note: b.note,
    status: b.status as TableBookingRow["status"],
    createdAt: b.createdAt.toISOString(),
  }))
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Table bookings" description="Tables guests ask for from your site. Call them to confirm." />
      {rows.length === 0 ? <EmptyState title="No bookings yet" body="Requests from your Book table page appear here." /> : <TableBookingsGrid rows={rows} />}
    </div>
  )
}
