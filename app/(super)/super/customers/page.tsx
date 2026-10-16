import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { CustomersGrid } from "@/components/super/super-grids"
import { loadCustomers } from "@/lib/super/queries"

export const metadata = { title: "Customers" }

export default async function Page() {
  const rows = await loadCustomers()
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Customers"
        description="Every guest who has ordered from any restaurant, with how often and how much. Phone numbers show the last four digits only."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No guests yet"
          body="Guests appear after their first order."
        />
      ) : (
        <CustomersGrid rows={rows} />
      )}
    </div>
  )
}
