import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { ReviewsGrid } from "@/components/super/super-grids"
import { loadReviews } from "@/lib/super/queries"

export const metadata = { title: "Reviews" }

export default async function Page() {
  const rows = await loadReviews()
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Reviews"
        description="What guests say about each restaurant, including reviews waiting for approval."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No reviews yet"
          body="Reviews appear after guests rate an order."
        />
      ) : (
        <ReviewsGrid rows={rows} />
      )}
    </div>
  )
}
