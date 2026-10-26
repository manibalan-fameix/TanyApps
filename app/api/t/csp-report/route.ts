import { NextResponse } from "next/server"

import { countMetric } from "@/lib/core/metrics"
import { clientIp } from "@/lib/core/client-ip"
import { rateLimit } from "@/lib/core/rate-limit"
import { readBodyUpTo } from "@/lib/media/read-body"

const MAX_BYTES = 8 * 1024
const KEEP = /^[a-z-]{3,40}$/

/** Reduces a URL a browser reports to what is safe to log: scheme and host only, or a keyword such as inline or eval. Never a path or query. */
function origin(value: unknown): string {
  if (typeof value !== "string" || !value) return "unknown"
  if (/^(inline|eval|data|blob|self|about|wasm-eval)$/i.test(value)) return value.toLowerCase()
  try {
    const u = new URL(value)
    if (!/^(https?|wss?):$/.test(u.protocol) || !u.host) return "other"
    return `${u.protocol}//${u.host}`.slice(0, 80)
  } catch {
    return "other"
  }
}

/**
 * Receives Content-Security-Policy violation reports from browsers (report-only mode). Public by nature, so it is small, rate limited, and
 * logs nothing that could carry personal data: the violated directive, the blocked origin, and the page's host and first path segment.
 */
export async function POST(req: Request) {
  if (!(await rateLimit(`csp-report:${clientIp(req.headers)}`, 60, 60_000))) return new NextResponse(null, { status: 204 })
  const raw = await readBodyUpTo(req, MAX_BYTES)
  if (!raw) return new NextResponse(null, { status: 204 })
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    return new NextResponse(null, { status: 204 })
  }
  const r = ((body as { "csp-report"?: Record<string, unknown> })?.["csp-report"] ?? body) as Record<string, unknown>
  const directive = String(r["effective-directive"] ?? r["violated-directive"] ?? "unknown").split(" ")[0]
  let page = "unknown"
  try {
    const d = new URL(String(r["document-uri"] ?? ""))
    if (/^https?:$/.test(d.protocol) && d.host) page = `${d.host}/${d.pathname.split("/")[1] ?? ""}`.slice(0, 80)
  } catch {
    // no usable document uri
  }
  countMetric("csp_violation", { directive: KEEP.test(directive) ? directive : "other", blocked: origin(r["blocked-uri"] ?? r["blockedURL"]), page, mode: "report-only" })
  return new NextResponse(null, { status: 204 })
}
