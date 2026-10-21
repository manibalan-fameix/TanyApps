import { NextResponse } from "next/server"

import { getDealerContext } from "@/lib/auth/context"
import { parsePrivateKey } from "@/lib/media/documents"
import { getPrivateStorage } from "@/lib/storage"

// The only way to read a private document. It needs a signed-in member of the business that owns it, nothing is cached by
// the browser or a CDN, and the file can never run as a page: it is served as a download-safe type with nosniff.
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || !ctx.dealerInDb) return new NextResponse(null, { status: 401 })

  const key = (await params).key.join("/")
  const parsed = parsePrivateKey(key)
  // Another business's file looks exactly like a file that does not exist.
  if (!parsed || parsed.dealerId !== ctx.dealer.id || ctx.dealer.industry !== "cabs") return new NextResponse(null, { status: 404 })

  try {
    const body = await getPrivateStorage().get(key)
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": parsed.type,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
