import { NextResponse } from "next/server"

import { getDealerBySlug } from "@/lib/tenant/dealer"

export const dynamic = "force-dynamic"

/**
 * The home-screen manifest of one cab operator's site, so a customer can keep it on their phone like an app. Named and coloured for
 * the operator. (The app-wide manifest in app/manifest.ts is for the dealer dashboard and starts at /dashboard, which is wrong here.)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ dealer: string }> }) {
  const dealer = await getDealerBySlug((await params).dealer)
  if (!dealer || dealer.industry !== "cabs") return new NextResponse("Not found", { status: 404 })
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
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }
  return new NextResponse(JSON.stringify(body), { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=300" } })
}
