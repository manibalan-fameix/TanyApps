import { NextResponse } from "next/server"

import { getDealerContext } from "@/lib/auth/context"
import { getStorage } from "@/lib/storage"

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }

// Same-origin copy of a dealer's own photo. The browser cannot read R2 pictures with fetch() (that needs
// bucket CORS), which the share and download buttons need in order to build the Instagram carousel.
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || !ctx.dealerInDb) return new NextResponse(null, { status: 401 })

  const key = (await params).key.join("/")
  const type = TYPES[key.split(".").pop() ?? ""]
  if (!type || key.includes("..") || !key.startsWith(`dealers/${ctx.dealer.id}/`)) return new NextResponse(null, { status: 404 })
  try {
    const body = await getStorage().get(key)
    return new NextResponse(new Uint8Array(body), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=300" } })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
