import { NextResponse } from "next/server"

import { matchDishesFromImage } from "@/lib/ai/dish-match"
import { getVisionClient, type VisionImage } from "@/lib/ai/vision"
import { clientIp } from "@/lib/core/guards"
import { rateLimit } from "@/lib/core/rate-limit"
import { meterUsage } from "@/lib/core/usage"
import { readBodyUpTo } from "@/lib/media/read-body"
import { loadStorefront } from "@/lib/restaurant/storefront-data"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { TENANT_HEADER } from "@/lib/tenant/host"

const PER_IP_LIMIT = 8
const PER_DEALER_LIMIT = 120
const WINDOW_MS = 10 * 60_000
/** The chat shrinks photos before sending, so anything near this is not from the chat. */
const MAX_FILE_BYTES = 3_000_000
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64_000

/** What the file really is, from its first bytes. The declared type and the file name are never trusted. */
function sniff(b: Uint8Array): VisionImage["mediaType"] | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png"
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp"
  return null
}

/**
 * A guest sends a photo to the order chat; we answer with the ids of the menu items it matches. The menu is read here on the
 * server, never taken from the request, and the photo is held in memory for this request only.
 */
export async function POST(req: Request) {
  const slug = req.headers.get(TENANT_HEADER)
  if (!slug) return NextResponse.json({ error: "unknown_dealer" }, { status: 400 })
  const dealer = await getDealerBySlug(slug)
  if (!dealer) return NextResponse.json({ error: "unknown_dealer" }, { status: 404 })
  if (dealer.suspended) return NextResponse.json({ error: "unavailable" }, { status: 503 })

  const ip = clientIp(req.headers)
  if (!(await rateLimit(`dish-match:ip:${ip}`, PER_IP_LIMIT, WINDOW_MS))) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  if (!(await rateLimit(`dish-match:dealer:${dealer.id}`, PER_DEALER_LIMIT, WINDOW_MS))) return NextResponse.json({ error: "rate_limited" }, { status: 429 })

  const vision = getVisionClient()
  if (!vision) return NextResponse.json({ error: "unavailable" }, { status: 503 })

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 })
  const raw = await readBodyUpTo(req, MAX_BODY_BYTES)
  if (!raw) return NextResponse.json({ error: "too_large" }, { status: 413 })
  const form = await new Response(raw as BodyInit, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData().catch(() => null)
  const file = form?.get("image")
  if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mediaType = sniff(bytes)
  if (!mediaType) return NextResponse.json({ error: "unsupported" }, { status: 415 })

  if (!(await meterUsage({ dealerId: dealer.id, feature: "vision_ocr_request", product: dealer.industry })).allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 })

  const store = await loadStorefront(dealer)
  const menu = store.dishes.filter((d) => d.isAvailable).map((d) => ({ id: d.id, name: d.name, category: d.categoryName }))
  const ids = await matchDishesFromImage(vision, { mediaType, base64: Buffer.from(bytes).toString("base64") }, menu)
  if (!ids) return NextResponse.json({ error: "unavailable" }, { status: 503 })
  return NextResponse.json({ ids }, { headers: { "Cache-Control": "no-store" } })
}
