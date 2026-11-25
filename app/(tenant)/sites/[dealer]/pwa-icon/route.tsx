import { ImageResponse } from "next/og"
import { NextResponse } from "next/server"

import { getDealerBySlug } from "@/lib/tenant/dealer"
import { isOrderIndustry } from "@/lib/verticals"

export const dynamic = "force-dynamic"

const SIZES = [180, 192, 512]
const MAX_BYTES = 4 * 1024 * 1024

/**
 * The home-screen icon of one business: its own logo filling the whole square, as a PNG. iPhones take the icon from
 * a PNG link tag (they ignore SVG and most other formats) and round the corners themselves, so there is no margin.
 * A logo that is not square is cropped to fill it.
 * A business with no logo, or one in a format that cannot be drawn here, gets the Tany icon as before.
 */
export async function GET(req: Request, { params }: { params: Promise<{ dealer: string }> }) {
  const dealer = await getDealerBySlug((await params).dealer)
  if (!dealer || (dealer.industry !== "cabs" && !isOrderIndustry(dealer.industry))) return new NextResponse("Not found", { status: 404 })
  const asked = Number(new URL(req.url).searchParams.get("size"))
  const size = SIZES.includes(asked) ? asked : 192
  const fallback = () => NextResponse.redirect(new URL(`/brand/icon-${size === 512 ? 512 : 192}.png`, req.url), 307)

  if (!dealer.logoUrl) return fallback()
  try {
    const url = new URL(dealer.logoUrl, req.url)
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback()
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim()
    if (!res.ok || !["image/png", "image/jpeg", "image/svg+xml"].includes(type)) return fallback()
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > MAX_BYTES) return fallback()
    const src = `data:${type};base64,${bytes.toString("base64")}`
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ),
      { width: size, height: size, headers: { "cache-control": "public, max-age=60" } },
    )
  } catch {
    return fallback()
  }
}
