import { NextResponse } from "next/server"

import { secretsMatch } from "@/lib/core/secure-compare"
import { JOBS, runJob } from "@/lib/core/scheduler"

export const dynamic = "force-dynamic"

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } })

/** The trigger's scheduled time may differ from "now" by this much at most; anything else is a malformed or replayed call. */
const MAX_SKEW_MS = 60 * 60_000

/**
 * Entry point for the cron worker (workers/cron). Reachable only on the app host (the proxy answers 404 for /api/internal on
 * tenant and marketing hosts).
 *
 *   POST /api/internal/cron/<job>
 *   x-cron-secret: <CRON_SECRET>        the shared secret, in a header and never in the URL
 *   x-cron-slot:   <ISO time>           when the trigger was scheduled for; (job, slot) runs once
 */
export async function POST(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) return json({ ok: false, error: "not_configured" }, 503)
  if (!(await secretsMatch(req.headers.get("x-cron-secret"), expected))) return json({ ok: false }, 401)

  const { job } = await params
  if (!Object.hasOwn(JOBS, job)) return json({ ok: false, error: "unknown_job" }, 404)

  const slot = new Date(req.headers.get("x-cron-slot") ?? "")
  if (Number.isNaN(slot.getTime()) || Math.abs(Date.now() - slot.getTime()) > MAX_SKEW_MS) return json({ ok: false, error: "bad_slot" }, 400)
  slot.setMilliseconds(0)

  const outcome = await runJob(job, slot)
  if (!outcome.ran) return json({ ok: true, ran: false, reason: outcome.reason })
  // A failed job answers 500 so the trigger worker can see it and retry; the lock lets a retry claim the failed run again.
  return json({ ok: outcome.ok, ran: true, result: outcome.result }, outcome.ok ? 200 : 500)
}
