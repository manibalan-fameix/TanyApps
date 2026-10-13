import { desc } from "drizzle-orm"

import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { type ReviewRow, ReviewsGrid } from "@/components/restaurant/restaurant-grids"
import { reviews } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"

export const metadata = { title: "Reviews" }
export const dynamic = "force-dynamic"

export default async function ReviewsPage() {
  const { dealer } = await requireRestaurant()
  const all = await scopedDb(dealer.id).reviews.select(undefined, { orderBy: [desc(reviews.createdAt)], limit: 200 })
  const approved = all.filter((r) => r.status === "approved")
  const avg = approved.length ? (approved.reduce((n, r) => n + r.rating, 0) / approved.length).toFixed(1) : null
  const rows: ReviewRow[] = all.map((r) => ({ id: r.id, name: r.name, rating: r.rating, comment: r.comment, status: r.status as ReviewRow["status"], createdAt: r.createdAt.toISOString() }))
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Reviews" description={`${avg ? `${avg} average from ${approved.length} showing. ` : ""}Guests can review after a completed order. Approve a review to show it on your menu page.`} />
      {rows.length === 0 ? <EmptyState title="No reviews yet" body="Reviews arrive after guests receive a completed order." /> : <ReviewsGrid rows={rows} />}
    </div>
  )
}
