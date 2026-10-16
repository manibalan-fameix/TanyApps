import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { OrdersGrid } from "@/components/super/super-grids"
import { loadOrders } from "@/lib/super/data"

export const metadata = { title: "Orders" }

export default async function Page() {
  const rows = await loadOrders()
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Orders"
        description="Every guest order across all restaurants."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No orders yet"
          body="Orders appear when a guest orders from a restaurant."
        />
      ) : (
        <OrdersGrid rows={rows} />
      )}
    </div>
  )
}
