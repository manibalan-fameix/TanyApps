import { NextResponse } from "next/server"

import { extractInvoice } from "@/lib/ai/invoice-extract"
import { getVisionClient, type VisionDocument, type VisionImage } from "@/lib/ai/vision"
import { getDealerContext } from "@/lib/auth/context"
import { billingState } from "@/lib/billing/state"
import { rateLimit } from "@/lib/core/rate-limit"
import { meterUsage } from "@/lib/core/usage"
import { readBodyUpTo } from "@/lib/media/read-body"
import { isOrderIndustry } from "@/lib/verticals"

const MAX_FILE_BYTES = 8_000_000
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64_000

/** What the file really is, from its first bytes. The declared type and the file name are never trusted. */
function sniff(b: Uint8Array): VisionImage["mediaType"] | VisionDocument["mediaType"] | null {
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf"
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png"
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp"
  return null
}

/**
 * Reads a purchase invoice or ERP stock report (photo or PDF) into product rows for the review screen. Nothing is saved here: the owner
 * checks the rows, then the import action writes them. The file is held in memory for this request only.
 */
export async function POST(req: Request) {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || !ctx.dealerInDb || !isOrderIndustry(ctx.dealer.industry)) return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  if (!billingState(ctx.dealer).hasAccess) return NextResponse.json({ error: "no_access" }, { status: 402 })
  if (!(await rateLimit(`invoice-extract:${ctx.dealer.id}`, 20, 3_600_000))) return NextResponse.json({ error: "rate_limited" }, { status: 429 })

  const vision = getVisionClient()
  if (!vision) return NextResponse.json({ error: "no_ai" }, { status: 503 })

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 })
  const raw = await readBodyUpTo(req, MAX_BODY_BYTES)
  if (!raw) return NextResponse.json({ error: "too_large" }, { status: 413 })
  const form = await new Response(raw as BodyInit, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniff(bytes)
  if (!kind) return NextResponse.json({ error: "unsupported" }, { status: 415 })

  if (!(await meterUsage({ dealerId: ctx.dealer.id, feature: "invoice_extract_request", product: ctx.dealer.industry })).allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  const base64 = Buffer.from(bytes).toString("base64")
  const result = await extractInvoice(vision, kind === "application/pdf" ? { documents: [{ mediaType: kind, base64 }] } : { images: [{ mediaType: kind, base64 }] })
  if (!result) return NextResponse.json({ error: "not_read" }, { status: 422 })
  return NextResponse.json({ ok: true, ...result })
}
