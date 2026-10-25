import { PgBoss } from "pg-boss"

import { countMetric } from "../core/metrics.ts"
import { safeErrorMessage } from "../core/safe-error.ts"

export const VIDEO_QUEUE = "video-process"
export type VideoJob = { dealerId: string; carId: string; mediaId: string }

let boss: Promise<PgBoss> | null = null

/** One shared, lazily started pg-boss client. pg-boss creates and migrates its own schema. */
export function getBoss(): Promise<PgBoss> {
  boss ??= (async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set")
    const b = new PgBoss(process.env.DATABASE_URL)
    b.on("error", (e) => console.error("pg-boss error:", e.message))
    await b.start()
    await b.createQueue(VIDEO_QUEUE)
    return b
  })().catch((e) => {
    boss = null
    throw e
  })
  return boss
}

export type EnqueueResult = { queued: true } | { queued: false; reason: "workers_runtime" | "disabled" | "error" }

/** True inside Cloudflare Workers, where a TCP pool cannot be shared between requests and a long-lived pg-boss client cannot run. */
const inWorkersRuntime = () => typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers"

/**
 * Queue the video for HLS conversion and the missing-angle check. Never throws and never pretends: the answer says whether the job
 * was queued, and a job that was not queued is counted (`video_not_queued`) so it shows up in the logs. The original video is safe
 * in storage either way, and the worker host re-queues any video still waiting (see requeueWaitingVideos).
 *
 * pg-boss needs a long-lived Node process (it opens its own connection pool, migrates its schema and runs maintenance timers), so
 * inside Cloudflare Workers nothing is attempted unless VIDEO_QUEUE_ENABLED=1 says it has been proven there. VIDEO_QUEUE_ENABLED=0
 * switches it off everywhere.
 */
export async function enqueueVideoJob(job: VideoJob): Promise<EnqueueResult> {
  const flag = process.env.VIDEO_QUEUE_ENABLED
  if (flag === "0") return skipped("disabled")
  if (inWorkersRuntime() && flag !== "1") return skipped("workers_runtime")
  try {
    const b = await getBoss()
    // singletonKey: confirming the same upload twice queues one job.
    await b.send(VIDEO_QUEUE, job, { singletonKey: job.mediaId, retryLimit: 3, retryBackoff: true })
    return { queued: true }
  } catch (e) {
    console.error("could not queue video job:", safeErrorMessage(e))
    return skipped("error")
  }
}

function skipped(reason: "workers_runtime" | "disabled" | "error"): EnqueueResult {
  countMetric("video_not_queued", { reason })
  return { queued: false, reason }
}
