import { NextResponse } from "next/server"

import { LOGIN_INDUSTRIES } from "@/lib/core/login/host"
import { tenantFrom } from "@/lib/core/guards"
import { customerFromToken } from "@/lib/core/login/customer"
import { sessionCookieName } from "@/lib/core/login/customer-session"
import { sameOrigin } from "@/lib/core/login/origin"
import { rateLimit } from "@/lib/core/rate-limit"
import { checkPhotoBytes } from "@/lib/media/photo-check"
import { readBodyUpTo } from "@/lib/media/read-body"
import { MAX_REVIEW_PHOTO_BYTES, reviewMediaKey } from "@/lib/restaurant/review-media"
import { getStorage } from "@/lib/storage"

const headers = { "Cache-Control": "no-store" }
const tokenOf = (req: Request) => {
  const name = sessionCookieName()
  return (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1)
}
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers })

/**
 * One photo for a review. Only a signed-in customer of this shop, only a JPEG (the browser shrinks every photo to one first), only
 * under that customer's own folder in the shop's storage, and only if the file's own first bytes say it is a JPEG.
 */
export async function PUT(req: Request) {
  const ctx = await tenantFrom(req.headers, LOGIN_INDUSTRIES)
  if (!ctx) return fail(404, "Not found")
  if (!sameOrigin(req)) return fail(403, "Not allowed")
  const customer = await customerFromToken(ctx.dealer.id, tokenOf(req))
  if (!customer) return fail(401, "Please sign in to add photos.")
  if (!(await rateLimit(`review-photo:${ctx.dealer.id}:${customer.id}`, 40, 60 * 60_000))) return fail(429, "Too many uploads. Try again later.")

  const id = new URL(req.url).searchParams.get("id") ?? ""
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return fail(400, "Bad upload.")
  if ((req.headers.get("content-type") ?? "").split(";")[0].trim() !== "image/jpeg") return fail(415, "Photos must be JPEG.")
  if (Number(req.headers.get("content-length") ?? 0) > MAX_REVIEW_PHOTO_BYTES) return fail(413, "That photo is too large.")
  const body = await readBodyUpTo(req, MAX_REVIEW_PHOTO_BYTES)
  if (!body || body.length === 0) return fail(413, "That photo is too large.")
  if (checkPhotoBytes(body, "image/jpeg")) return fail(415, "That file is not a photo we can use.")

  const storage = getStorage()
  const key = reviewMediaKey(ctx.dealer.id, customer.id, id, "jpg")
  try {
    await storage.put(key, Buffer.from(body.buffer, body.byteOffset, body.byteLength), "image/jpeg")
  } catch {
    return fail(502, "Could not save that photo. Try again.")
  }
  return NextResponse.json({ ok: true, url: storage.publicUrl(key) }, { headers })
}
