import { NextResponse } from "next/server"

import { getDealerBySlug } from "@/lib/tenant/dealer"
import { isOrderIndustry } from "@/lib/verticals"

export const dynamic = "force-dynamic"

/**
 * The home-screen manifest of one cab operator's or restaurant's site, so a customer can keep it on their phone like an app. Named and coloured for
 * the operator. (The app-wide manifest in app/manifest.ts is for the dealer dashboard and starts at /dashboard, which is wrong here.)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ dealer: string }> }) {
  const dealer = await getDealerBySlug((await params).dealer)
  if (!dealer || (dealer.industry !== "cabs" && !isOrderIndustry(dealer.industry))) return new NextResponse("Not found", { status: 404 })
  const body = {
    name: dealer.displayName,
    short_name: dealer.displayName.slice(0, 12),
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: dealer.theme.primary,
    lang: "en",
    icons: [
      { src: "/pwa-icon?size=192&v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512&v=2", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  }
  return new NextResponse(JSON.stringify(body), { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=300" } })
}
