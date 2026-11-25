import { NextResponse } from "next/server"

import { LOGIN_INDUSTRIES } from "@/lib/core/login/host"
import { tenantFrom } from "@/lib/core/guards"
import { customerFromToken } from "@/lib/core/login/customer"
import { sessionCookieName } from "@/lib/core/login/customer-session"
import { sameOrigin } from "@/lib/core/login/origin"
import { rateLimit } from "@/lib/core/rate-limit"
import { checkPhotoBytes } from "@/lib/media/photo-check"
import { readBodyUpTo } from "@/lib/media/read-body"
import { MAX_REVIEW_PHOTO_BYTES } from "@/lib/restaurant/review-media"
import { returnPhotoKey } from "@/lib/returns/customer"
import { getStorage } from "@/lib/storage"

const headers = { "Cache-Control": "no-store" }
const tokenOf = (req: Request) => {
  const name = sessionCookieName()
  return (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1)
}
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers })

/**
 * One photo for a return chat, checked like a review photo: only a signed-in customer of this shop, only a real JPEG, only under
 * that customer's own folder, with a name nobody can guess.
 */
export async function PUT(req: Request) {
  const ctx = await tenantFrom(req.headers, LOGIN_INDUSTRIES)
  if (!ctx) return fail(404, "Not found")
  if (!sameOrigin(req)) return fail(403, "Not allowed")
  const customer = await customerFromToken(ctx.dealer.id, tokenOf(req))
  if (!customer) return fail(401, "Please sign in to add photos.")
  if (!(await rateLimit(`return-photo:${ctx.dealer.id}:${customer.id}`, 20, 60 * 60_000))) return fail(429, "Too many uploads. Try again later.")

  const id = new URL(req.url).searchParams.get("id") ?? ""
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return fail(400, "Bad upload.")
  if ((req.headers.get("content-type") ?? "").split(";")[0].trim() !== "image/jpeg") return fail(415, "Photos must be JPEG.")
  if (Number(req.headers.get("content-length") ?? 0) > MAX_REVIEW_PHOTO_BYTES) return fail(413, "That photo is too large.")
  const body = await readBodyUpTo(req, MAX_REVIEW_PHOTO_BYTES)
  if (!body || body.length === 0) return fail(413, "That photo is too large.")
  if (checkPhotoBytes(body, "image/jpeg")) return fail(415, "That file is not a photo we can use.")

  const storage = getStorage()
  const key = returnPhotoKey(ctx.dealer.id, customer.id, id)
  try {
    // A photo already there may already be in the chat, so it is never replaced: a sent message cannot be changed.
    if (await storage.head(key)) return NextResponse.json({ ok: true }, { headers })
    await storage.put(key, Buffer.from(body.buffer, body.byteOffset, body.byteLength), "image/jpeg")
  } catch {
    return fail(502, "Could not save that photo. Try again.")
  }
  return NextResponse.json({ ok: true }, { headers })
}
