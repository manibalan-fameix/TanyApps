// Cron trigger worker. Cloudflare fires the schedules below; for each one this worker calls the app's internal cron route
// (app/api/internal/cron/[job]/route.ts). The app does the work and keeps the lock, so this worker holds no state and a
// double-fired schedule cannot run a job twice.
//
// Deploy with `pnpm run deploy:cron staging|production` (the environment is always explicit; see scripts/deploy.ts). Secret: pnpm exec wrangler secret put CRON_SECRET -c workers/cron/wrangler.jsonc
// (the main app needs the very same value, see .env.example).

type Env = { CRON_SECRET?: string; CRON_TARGET_URL?: string }
type ScheduledEvent = { cron: string; scheduledTime: number }

/** Which jobs each schedule runs. Keep in step with `triggers.crons` in wrangler.jsonc. */
export const SCHEDULE: Record<string, string[]> = {
  // Every minute: cab booking holds (an operator's answer window can be as short as 10 minutes, so five-minute steps are too coarse).
  // Safe because the lock keeps one run per (job, minute) and the job only touches rows past their deadline.
  "* * * * *": ["expire-trip-holds"],
  "*/5 * * * *": ["expire-unpaid-orders", "retry-booking-refunds", "retry-order-refunds"],
  // 08:00 IST every day (02:30 UTC).
  "30 2 * * *": ["daily"],
  // 06:00 IST on the 1st of the month (00:30 UTC).
  "30 0 1 * *": ["monthly"],
}

const ATTEMPTS = 3

async function callJob(env: Env, job: string, scheduledTime: number): Promise<void> {
  const base = env.CRON_TARGET_URL?.replace(/\/$/, "")
  if (!base || !env.CRON_SECRET) throw new Error("CRON_TARGET_URL and CRON_SECRET must be set")
  let lastError = "unknown"
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${base}/api/internal/cron/${encodeURIComponent(job)}`, {
        method: "POST",
        // The secret travels in a header, never in the URL, so it cannot end up in access logs.
        headers: { "x-cron-secret": env.CRON_SECRET, "x-cron-slot": new Date(scheduledTime).toISOString() },
        signal: AbortSignal.timeout(25_000),
      })
      if (res.ok) return
      lastError = `HTTP ${res.status}`
      // 4xx means the request itself is wrong (secret, unknown job): retrying cannot help.
      if (res.status < 500) break
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown"
    }
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 2000))
  }
  throw new Error(`cron job ${job} failed after retries: ${lastError}`)
}

const worker = {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const jobs = SCHEDULE[event.cron]
    if (!jobs) {
      console.error(`no jobs registered for schedule "${event.cron}"`)
      return
    }
    const results = await Promise.allSettled(jobs.map((job) => callJob(env, job, event.scheduledTime)))
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected")
    for (const f of failed) console.error(String(f.reason))
    // Throwing marks the invocation failed in Cloudflare's dashboard.
    if (failed.length > 0) throw new Error(`${failed.length} of ${jobs.length} cron job(s) failed`)
  },
}

export default worker
