import { and, asc, eq } from "drizzle-orm"

import { unscopedDb } from "../db/client.ts"
import { carMedia, cars } from "../db/schema/index.ts"
import { scopedDb } from "../db/scoped.ts"
import { safeErrorMessage } from "../core/safe-error.ts"
import type { VideoJob } from "./boss.ts"

/**
 * For the worker host: queues every walkaround video that was uploaded but never queued (the app could not reach pg-boss, for
 * example because it runs in Cloudflare Workers). Each video is claimed with a conditional update (uploaded -> processing) before it
 * is queued, and put back if queueing fails, so it is never lost and never queued twice by two sweeps. Safe to run repeatedly.
 */
export async function requeueWaitingVideos(send: (job: VideoJob) => Promise<unknown>, limit = 50, only: { dealerId?: string } = {}): Promise<{ queued: number; failed: number }> {
  const waiting = await unscopedDb
    .select({ id: carMedia.id, carId: carMedia.carId, dealerId: cars.dealerId })
    .from(carMedia)
    .innerJoin(cars, eq(cars.id, carMedia.carId))
    .where(and(eq(carMedia.kind, "video"), eq(carMedia.status, "uploaded"), only.dealerId ? eq(cars.dealerId, only.dealerId) : undefined))
    .orderBy(asc(carMedia.id))
    .limit(limit)
  let queued = 0
  let failed = 0
  for (const v of waiting) {
    const db = scopedDb(v.dealerId)
    const claimed = await db.carMedia.update({ status: "processing" }, and(eq(carMedia.id, v.id), eq(carMedia.status, "uploaded"))!).returning({ id: carMedia.id })
    if (claimed.length !== 1) continue // another sweep or the worker has it
    try {
      await send({ dealerId: v.dealerId, carId: v.carId, mediaId: v.id })
      queued++
    } catch (error) {
      failed++
      console.error(`could not re-queue a video: ${safeErrorMessage(error)}`)
      await db.carMedia.update({ status: "uploaded" }, and(eq(carMedia.id, v.id), eq(carMedia.status, "processing"))!)
    }
  }
  return { queued, failed }
}
