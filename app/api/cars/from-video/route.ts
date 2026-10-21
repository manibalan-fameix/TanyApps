import { NextResponse } from "next/server"
import { z } from "zod"

import { extractListingFromVideo } from "@/lib/ai/video-listing"
import { getVisionClient, type VisionAudio, type VisionImage } from "@/lib/ai/vision"
import { getDealerContext } from "@/lib/auth/context"
import { createCarFromVideo, videoSearchText } from "@/lib/cars/from-video"
import { rateLimit } from "@/lib/core/rate-limit"
import { getAllVariants } from "@/lib/variants/repo"

const MAX_FRAMES = 16
const MAX_FRAME_BYTES = 400_000
const MAX_AUDIO_BYTES = 8_000_000 // ~4 minutes of 16 kHz mono 16-bit

const meta = z.object({ frames: z.number().int().min(1).max(MAX_FRAMES), audio: z.boolean() })

const toBase64 = async (blob: Blob) => Buffer.from(await blob.arrayBuffer()).toString("base64")

/**
 * Read a creator's walkaround video (sampled frames + audio, prepared in the browser) and start a
 * prefilled draft car from it. The video itself never reaches the server: only a handful of small
 * frames and the audio track, held in memory for this one request.
 */
export async function POST(req: Request) {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || !ctx.dealerInDb) return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  if (!(await rateLimit(`video-listing:${ctx.dealer.id}`, 15, 3_600_000))) return NextResponse.json({ error: "rate_limited" }, { status: 429 })

  const vision = getVisionClient()
  if (!vision) return NextResponse.json({ error: "no_ai" }, { status: 503 })

  const form = await req.formData().catch(() => null)
  const parsed = meta.safeParse({ frames: Number(form?.get("frameCount")), audio: form?.get("audio") instanceof Blob })
  if (!form || !parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 })

  const frames: VisionImage[] = []
  for (let i = 0; i < parsed.data.frames; i++) {
    const f = form.get(`frame${i}`)
    if (!(f instanceof Blob) || f.type !== "image/jpeg" || f.size > MAX_FRAME_BYTES) return NextResponse.json({ error: "invalid" }, { status: 400 })
    frames.push({ mediaType: "image/jpeg", base64: await toBase64(f) })
  }
  let audio: VisionAudio | null = null
  const a = form.get("audio")
  if (a instanceof Blob) {
    if (a.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "invalid" }, { status: 400 })
    audio = { mediaType: "audio/wav", base64: await toBase64(a) }
  }

  const listing = await extractListingFromVideo(vision, { frames, audio })
  if (!listing) return NextResponse.json({ error: "not_read" }, { status: 422 })

  const { carId, variantPicked } = await createCarFromVideo(ctx.dealer.id, listing, await getAllVariants())
  return NextResponse.json({ ok: true, carId, variantPicked, hint: videoSearchText(listing) })
}
