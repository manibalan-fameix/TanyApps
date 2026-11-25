import type { CSSProperties } from "react"
import { notFound } from "next/navigation"

import { homeProps } from "@/components/restaurant/store/home"
import { PreviewHome } from "@/components/restaurant/store/preview-home"
import { StoreShell } from "@/components/restaurant/store/shell"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { loadStorefront } from "@/lib/restaurant/storefront-data"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { themeToCssVars } from "@/lib/theme/tokens"

export const metadata = { title: "Home page preview", robots: { index: false } }
export const dynamic = "force-dynamic"

/**
 * The signed-in business's own home page, drawn with the store's real components so it matches what customers see. The editor shows it
 * in a frame and sends it the layout being edited, so changes appear before they are saved.
 */
export default async function HomepagePreviewPage() {
  const { dealer } = await requireRestaurant()
  const profile = await getDealerBySlug(dealer.slug)
  if (!profile) notFound()
  const store = await loadStorefront(profile)
  return (
    <div data-tenant={profile.slug} style={themeToCssVars(profile.theme) as CSSProperties} className="flex min-h-svh flex-col bg-background text-foreground">
      <div className="flex-1">
        <StoreShell dealer={profile} preview>
          <PreviewHome {...homeProps(profile, store)} />
        </StoreShell>
      </div>
    </div>
  )
}
