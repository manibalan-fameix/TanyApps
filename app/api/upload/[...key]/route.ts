import { NextResponse } from "next/server"

import { getDealerContext } from "@/lib/auth/context"
import { MAX_DOC_BYTES, parsePrivateKey, sniffDocType } from "@/lib/media/documents"
import { MAX_PHOTO_BYTES, PHOTO_TYPES } from "@/lib/media/keys"
import { checkPhotoBytes } from "@/lib/media/photo-check"
import { readBodyUpTo } from "@/lib/media/read-body"
import { getPrivateStorage, getStorage } from "@/lib/storage"

// Photos are uploaded through the app instead of straight to R2. The browser then only talks to its own
// origin, so uploads never depend on the bucket's CORS policy, and the dealer check happens here.
// Videos are too big for a Worker request and still go straight to R2 with a presigned URL.
export async function PUT(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || !ctx.dealerInDb) return new NextResponse(null, { status: 401 })

  const key = (await params).key.join("/")
  // Personal paperwork (cab operators' RCs and licences) goes to private storage with stricter checks.
  if (key.includes("/private/")) return putPrivate(request, ctx.dealer, key)
  // A dealer may only write under their own prefix, exactly like a presigned URL would allow.
  if (!key.startsWith(`dealers/${ctx.dealer.id}/`) || key.includes("..")) return new NextResponse(null, { status: 403 })

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim()
  if (!(PHOTO_TYPES as readonly string[]).includes(contentType)) return new NextResponse(null, { status: 415 })

  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_PHOTO_BYTES) return new NextResponse(null, { status: 413 })
  const body = await readBodyUpTo(request, MAX_PHOTO_BYTES)
  if (!body || body.length === 0) return new NextResponse(null, { status: 413 })
  // The browser's Content-Type is a claim; the file's own first bytes decide. Public photos are served from our bucket's origin.
  const rejection = checkPhotoBytes(body, contentType)
  if (rejection) return new NextResponse(null, { status: 415, headers: { "x-reject-reason": rejection } })

  try {
    await getStorage().put(key, Buffer.from(body.buffer, body.byteOffset, body.byteLength), contentType)
  } catch (error) {
    console.error(`photo upload failed: ${error instanceof Error ? error.message : "unknown"}`)
    return new NextResponse(null, { status: 502 })
  }
  return new NextResponse(null, { status: 200 })
}

/**
 * A private document: only the owning cab operator, only a key of exactly the shape privateKey() makes, only the type the key
 * says, and only if the file's own first bytes agree. The file never gets a public address.
 */
async function putPrivate(request: Request, dealer: { id: string; industry: string }, key: string) {
  const parsed = parsePrivateKey(key)
  if (!parsed || parsed.dealerId !== dealer.id || dealer.industry !== "cabs") return new NextResponse(null, { status: 403 })

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim()
  if (contentType !== parsed.type) return new NextResponse(null, { status: 415 })

  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_DOC_BYTES) return new NextResponse(null, { status: 413 })
  const body = await readBodyUpTo(request, MAX_DOC_BYTES)
  if (!body || body.length === 0) return new NextResponse(null, { status: 413 })
  if (sniffDocType(body) !== parsed.type) return new NextResponse(null, { status: 415 })

  try {
    await getPrivateStorage().put(key, Buffer.from(body.buffer, body.byteOffset, body.byteLength), parsed.type)
  } catch (error) {
    console.error(`private upload failed: ${error instanceof Error ? error.message : "unknown"}`)
    return new NextResponse(null, { status: 503 })
  }
  return new NextResponse(null, { status: 200 })
}
