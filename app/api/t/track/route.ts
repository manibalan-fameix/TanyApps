import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { z } from "zod"

import { classifySource, deviceOf, isBot } from "@/lib/analytics/events"
import { recordEvent } from "@/lib/analytics/track"
import { cars } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { rateLimit } from "@/lib/core/rate-limit"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { TENANT_HEADER } from "@/lib/tenant/host"

const body = z.object({
  /** A car page view, or the showroom home when carSlug is empty. */
  carSlug: z.string().trim().max(200).default(""),
  utmSource: z.string().trim().max(60).optional(),
  referrer: z.string().trim().max(500).optional(),
})

// Called from the buyer's browser once a page has loaded, so crawlers, link previews and prefetches never count.
export async function POST(req: Request) {
  const slug = req.headers.get(TENANT_HEADER)
  const ua = req.headers.get("user-agent")
  if (!slug || isBot(ua)) return new NextResponse(null, { status: 204 })

  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return new NextResponse(null, { status: 204 })

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown"
  if (!(await rateLimit(`track:${ip}:${slug}`, 60, 60_000))) return new NextResponse(null, { status: 204 })

  const dealer = await getDealerBySlug(slug)
  if (!dealer || dealer.suspended) return new NextResponse(null, { status: 204 })

  // Only the dealer's own real listings are counted, so nobody can pad the table with made-up slugs.
  if (parsed.data.carSlug) {
    const [car] = await scopedDb(dealer.id).cars.select(eq(cars.slug, parsed.data.carSlug), { limit: 1 })
    if (!car) return new NextResponse(null, { status: 204 })
  }

  await recordEvent({
    event: parsed.data.carSlug ? "view" : "store_view",
    dealerId: dealer.id,
    carSlug: parsed.data.carSlug,
    source: classifySource(parsed.data.utmSource, parsed.data.referrer),
    device: deviceOf(ua),
    country: req.headers.get("cf-ipcountry") ?? "",
  })
  return new NextResponse(null, { status: 204 })
}
