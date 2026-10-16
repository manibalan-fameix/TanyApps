import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { CouponsGrid } from "@/components/super/super-grids"
import { loadCoupons } from "@/lib/super/queries"

export const metadata = { title: "Coupons" }

export default async function Page() {
  const rows = await loadCoupons()
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Coupons"
        description="Every discount code restaurants offer, and how often it is used."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No coupons yet"
          body="Coupons appear when a restaurant creates one."
        />
      ) : (
        <CouponsGrid rows={rows} />
      )}
    </div>
  )
}
