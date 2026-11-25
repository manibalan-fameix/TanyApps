import type { CSSProperties, ReactNode } from "react"
import type { Viewport } from "next"
import { notFound } from "next/navigation"

import { CabsShell } from "@/components/cabs/tenant/shell"
import { StoreShell } from "@/components/restaurant/store/shell"
import { PullToRefresh } from "@/components/pull-to-refresh"
import { Toaster } from "@/components/ui/toaster"
import { TenantMobileNav } from "@/components/tenant/mobile-nav"
import { currentLang } from "@/lib/cabs/lang-server"
import { currentCustomer } from "@/lib/core/login/customer"
import { getVertical } from "@/lib/verticals"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { themeToCssVars } from "@/lib/theme/tokens"
import { isOrderIndustry } from "@/lib/verticals"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dealer: string }>
}) {
  const dealer = await getDealerBySlug((await params).dealer)
  return dealer
    ? {
        title: {
          default: dealer.displayName,
          template: `%s | ${dealer.displayName}`,
        },
        // A cab operator's customers can keep the site on their phone; the app-wide manifest is for the dashboard.
        // The home-screen icon is the business's own logo, not the Tany one (iPhones read the apple-touch-icon link, not the manifest).
        ...(dealer.industry === "cabs" || isOrderIndustry(dealer.industry)
          ? { manifest: "/pwa-manifest", icons: { icon: "/pwa-icon?size=192&v=2", apple: [{ url: "/pwa-icon?size=180&v=2", sizes: "180x180", type: "image/png" }] } }
          : {}),
      }
    : {}
}

// A restaurant's brand-coloured header runs up to the screen edge, so the browser's own bar (status bar / address bar) takes the same colour.
export async function generateViewport({ params }: { params: Promise<{ dealer: string }> }): Promise<Viewport> {
  const dealer = await getDealerBySlug((await params).dealer)
  return dealer && isOrderIndustry(dealer.industry) && dealer.theme.primary ? { themeColor: dealer.theme.primary } : {}
}

// Buyer surface: server-rendered, tokens only. The dealer's theme is injected as CSS custom
// properties on this wrapper, overriding the preset for this subtree. Admin never sees them.
export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ dealer: string }>
}) {
  const dealer = await getDealerBySlug((await params).dealer)
  if (!dealer) notFound()
  const vertical = getVertical(dealer.industry)
  // A vertical whose public pages are not built yet has no site to show.
  if (!vertical.adminReady) notFound()
  if (dealer.suspended) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">{dealer.displayName}</h1>
        <p className="text-sm text-muted-foreground">This showroom is temporarily unavailable. Please check back soon.</p>
      </main>
    )
  }

  return (
    <div
      data-tenant={dealer.slug}
      style={themeToCssVars(dealer.theme) as CSSProperties}
      className="flex min-h-svh flex-col bg-background text-foreground"
    >
      <div className="flex-1">
        {isOrderIndustry(vertical.key) ? (
          <StoreShell dealer={dealer}>{children}</StoreShell>
        ) : vertical.key === "cabs" ? (
          <CabsShell dealer={dealer} lang={await currentLang()} signedIn={Boolean(await currentCustomer(dealer.id))}>{children}</CabsShell>
        ) : (
          children
        )}
      </div>
      <PullToRefresh />
      <Toaster />
      {vertical.tenantMobileNav ? <TenantMobileNav phone={dealer.phone} /> : null}
    </div>
  )
}
