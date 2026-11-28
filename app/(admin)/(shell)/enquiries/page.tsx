import { desc } from "drizzle-orm"

import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { type EnquiryRow, EnquiriesGrid } from "@/components/restaurant/restaurant-grids"
import { enquiries } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"

export const metadata = { title: "Enquiries" }
export const dynamic = "force-dynamic"

export default async function EnquiriesPage() {
  const { dealer } = await requireRestaurant()
  const all = await scopedDb(dealer.id).enquiries.select(undefined, { orderBy: [desc(enquiries.createdAt)], limit: 200 })
  const rows: EnquiryRow[] = all.map((e) => ({ id: e.id, name: e.name, phone: e.phone, message: e.message, kind: e.kind, status: e.status as EnquiryRow["status"], createdAt: e.createdAt.toISOString() }))
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Enquiries" description="Questions and product requests customers send from your online store." />
      {rows.length === 0 ? <EmptyState title="No messages yet" body="Questions and product requests from your online store appear here." /> : <EnquiriesGrid rows={rows} />}
    </div>
  )
}
