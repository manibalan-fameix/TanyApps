import type { CSSProperties, ReactNode } from "react"
import { notFound } from "next/navigation"

import { StoreShell } from "@/components/restaurant/store/shell"
import { PullToRefresh } from "@/components/pull-to-refresh"
import { TenantMobileNav } from "@/components/tenant/mobile-nav"
import { getIndustry } from "@/lib/industries"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { themeToCssVars } from "@/lib/theme/tokens"

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
      }
    : {}
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
        {dealer.industry === "restaurants" ? <StoreShell dealer={dealer}>{children}</StoreShell> : children}
      </div>
      <PullToRefresh />
      {getIndustry(dealer.industry).key === "motors" ? <TenantMobileNav phone={dealer.phone} /> : null}
    </div>
  )
}
