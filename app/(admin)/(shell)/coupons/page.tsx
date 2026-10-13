import { desc } from "drizzle-orm"

import { OffersTabs } from "@/components/restaurant/offers-tabs"
import { NewSheet } from "@/components/restaurant/new-sheet"
import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { type CouponRow, CouponsGrid } from "@/components/restaurant/restaurant-grids"
import { coupons } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"

export const metadata = { title: "Coupons" }
export const dynamic = "force-dynamic"

export default async function CouponsPage() {
  const { dealer, owner } = await requireRestaurant()
  const all = await scopedDb(dealer.id).coupons.select(undefined, { orderBy: [desc(coupons.createdAt)] })
  const now = new Date()
  const rows: CouponRow[] = all.map((c) => ({
    id: c.id,
    code: c.code,
    offer: c.kind === "percent" ? `${c.value}% off${c.maxDiscount ? ` up to ₹${c.maxDiscount}` : ""}` : `₹${c.value} off`,
    minOrder: c.minOrder,
    used: c.usedCount,
    expires: c.expiresAt ? c.expiresAt.toISOString() : null,
    status: c.expiresAt && c.expiresAt < now ? "expired" : c.isActive ? "active" : "paused",
  }))
  return (
    <div className="flex w-full flex-col gap-4">
      <OffersTabs active="coupons" />
      <PageHeader title="Coupons" description="Guests enter a code at checkout. The discount is checked again when they place the order.">
        {owner ? <NewSheet kind="coupon" /> : null}
      </PageHeader>
      {rows.length === 0 ? <EmptyState title="No coupons yet" body="Create a code like WELCOME10 to bring guests back." /> : <CouponsGrid rows={rows} owner={owner} />}
    </div>
  )
}
