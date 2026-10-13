import { asc } from "drizzle-orm"

import { OffersTabs } from "@/components/restaurant/offers-tabs"
import { NewSheet } from "@/components/restaurant/new-sheet"
import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { type BannerRow, BannersGrid } from "@/components/restaurant/restaurant-grids"
import { banners } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"

export const metadata = { title: "Banners" }
export const dynamic = "force-dynamic"

export default async function BannersPage() {
  const { dealer, owner } = await requireRestaurant()
  const all = await scopedDb(dealer.id).banners.select(undefined, { orderBy: [asc(banners.sortOrder)] })
  const rows: BannerRow[] = all.map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle, imageUrl: b.imageUrl, status: b.isActive ? "showing" : "hidden" }))
  return (
    <div className="flex w-full flex-col gap-4">
      <OffersTabs active="banners" />
      <PageHeader title="Banners" description="Offers and announcements at the top of your menu page. The first five showing are used.">
        {owner ? <NewSheet kind="banner" /> : null}
      </PageHeader>
      {rows.length === 0 ? <EmptyState title="No banners yet" body="Add an offer or announcement to greet guests." /> : <BannersGrid rows={rows} owner={owner} />}
    </div>
  )
}
