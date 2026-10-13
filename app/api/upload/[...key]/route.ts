import { NextResponse } from "next/server"

import { getDealerContext } from "@/lib/auth/context"
import { MAX_PHOTO_BYTES, PHOTO_TYPES } from "@/lib/media/keys"
import { getStorage } from "@/lib/storage"

// Photos are uploaded through the app instead of straight to R2. The browser then only talks to its own
// origin, so uploads never depend on the bucket's CORS policy, and the dealer check happens here.
// Videos are too big for a Worker request and still go straight to R2 with a presigned URL.
export async function PUT(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || !ctx.dealerInDb) return new NextResponse(null, { status: 401 })

  const key = (await params).key.join("/")
  // A dealer may only write under their own prefix, exactly like a presigned URL would allow.
  if (!key.startsWith(`dealers/${ctx.dealer.id}/`) || key.includes("..")) return new NextResponse(null, { status: 403 })

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim()
  if (!(PHOTO_TYPES as readonly string[]).includes(contentType)) return new NextResponse(null, { status: 415 })

  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_PHOTO_BYTES) return new NextResponse(null, { status: 413 })
  const body = Buffer.from(await request.arrayBuffer())
  if (body.length === 0 || body.length > MAX_PHOTO_BYTES) return new NextResponse(null, { status: 413 })

  try {
    await getStorage().put(key, body, contentType)
  } catch (error) {
    console.error(`photo upload failed: ${error instanceof Error ? error.message : "unknown"}`)
    return new NextResponse(null, { status: 502 })
  }
  return new NextResponse(null, { status: 200 })
}
