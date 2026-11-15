import { asc } from "drizzle-orm"

import { OffersTabs } from "@/components/restaurant/offers-tabs"
import { NewSheet } from "@/components/restaurant/new-sheet"
import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { type BannerRow, BannersGrid } from "@/components/restaurant/restaurant-grids"
import { banners, menuCategories } from "@/lib/db/schema"
import { categorySlugs } from "@/lib/restaurant/storefront"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"

export const metadata = { title: "Banners" }
export const dynamic = "force-dynamic"

export default async function BannersPage() {
  const { dealer, owner } = await requireRestaurant()
  const db = scopedDb(dealer.id)
  const [all, cats] = await Promise.all([db.banners.select(undefined, { orderBy: [asc(banners.sortOrder)] }), db.menuCategories.select(undefined, { orderBy: [asc(menuCategories.sortOrder)] })])
  const rows: BannerRow[] = all.map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle, imageUrl: b.imageUrl, buttonLabel: b.buttonLabel, linkUrl: b.linkUrl, status: b.isActive ? "showing" : "hidden" }))
  // The same slugs the storefront uses, so a banner can open a category page.
  const slugs = categorySlugs(cats)
  const destinations = [
    { value: "/menu", label: "Full menu" },
    { value: "/offers", label: "Offers page" },
    ...cats.map((c) => ({ value: `/category/${slugs.get(c.id)}`, label: `Category: ${c.name}` })),
  ]
  return (
    <div className="flex w-full flex-col gap-4">
      <OffersTabs active="banners" />
      <PageHeader title="Banners" description="Offers shown under the search bar on your home page. The first five showing are used.">
        {owner ? <NewSheet kind="banner" destinations={destinations} /> : null}
      </PageHeader>
      {rows.length === 0 ? <EmptyState title="No banners yet" body="Add an offer or announcement to greet guests." /> : <BannersGrid rows={rows} owner={owner} />}
    </div>
  )
}
