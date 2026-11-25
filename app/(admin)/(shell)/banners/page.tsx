import type { CSSProperties } from "react"
import { asc } from "drizzle-orm"

import { NewSheet } from "@/components/restaurant/new-sheet"
import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { type BannerRow, BannersTable } from "@/components/restaurant/banners-table"
import { banners, menuCategories } from "@/lib/db/schema"
import { MAX_BANNERS, readTone } from "@/lib/restaurant/banners"
import { categorySlugs } from "@/lib/restaurant/storefront"
import { scopedDb } from "@/lib/db/scoped"
import { DEFAULT_THEME, dealerThemeSchema, themeToCssVars } from "@/lib/theme/tokens"
import { requireRestaurant } from "@/lib/restaurant/guard"

export const metadata = { title: "Banners" }
export const dynamic = "force-dynamic"

export default async function BannersPage() {
  const { dealer, owner } = await requireRestaurant()
  const db = scopedDb(dealer.id)
  const [all, cats] = await Promise.all([db.banners.select(undefined, { orderBy: [asc(banners.sortOrder), asc(banners.createdAt)] }), db.menuCategories.select(undefined, { orderBy: [asc(menuCategories.sortOrder)] })])
  const rows: BannerRow[] = all.map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle, imageUrl: b.imageUrl, buttonLabel: b.buttonLabel, linkUrl: b.linkUrl, tone: readTone(b.tone), promoText: b.promoText, status: b.isActive ? "showing" : "hidden" }))
  // The same slugs the storefront uses, so a banner can open a category page.
  const slugs = categorySlugs(cats)
  const destinations = [
    { value: "/menu", label: "Full menu" },
    { value: "/offers", label: "Offers page" },
    ...cats.map((c) => ({ value: `/category/${slugs.get(c.id)}`, label: `Category: ${c.name}` })),
  ]
  const theme = dealerThemeSchema.safeParse(dealer.theme)
  const storeTheme = themeToCssVars(theme.success ? theme.data : DEFAULT_THEME) as CSSProperties
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Banners" description={`Offers shown under the search bar on your home page. ${rows.length} of ${MAX_BANNERS} used.${owner && rows.length > 1 ? " Drag to set the order on your home page." : ""}${rows.length >= MAX_BANNERS ? " Delete one to add another." : ""}`}>
        {owner ? <NewSheet kind="banner" destinations={destinations} storeTheme={storeTheme} look={rows.filter((r) => r.status === "showing").length} disabled={rows.length >= MAX_BANNERS} /> : null}
      </PageHeader>
      {rows.length === 0 ? <EmptyState title="No banners yet" body="Add an offer or announcement to greet guests." /> : <BannersTable rows={rows} owner={owner} destinations={destinations} storeTheme={storeTheme} />}
    </div>
  )
}
