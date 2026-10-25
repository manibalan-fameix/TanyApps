import { and, eq, ne } from "drizzle-orm"

import { angleOrder, isAngle, type CarAngle } from "../angles.ts"
import { carMedia, cars } from "../db/schema/index.ts"
import { scopedDb } from "../db/scoped.ts"
import { enqueueVideoJob } from "../jobs/boss.ts"
import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, mediaKey, PHOTO_TYPES, VIDEO_TYPES } from "../media/keys.ts"
import { getStorage } from "../storage/index.ts"
import type { PresignedUpload } from "../storage/types.ts"

const MAX_MEDIA_PER_CAR = 60

export type UploadRequest = {
  carId: string
  uploadId: string
  kind: "photo" | "video"
  angle?: string
  contentType: string
  size: number
}

export type MediaError = "not_found" | "invalid" | "too_large" | "too_many" | "not_uploaded" | "car_closed"
export type Result<T> = ({ ok: true } & T) | { ok: false; error: MediaError }

/**
 * Reserve a media slot and presign an upload. Idempotent per uploadId: a retry after a dropped
 * connection gets the same slot back instead of creating a duplicate row.
 */
export async function requestUpload(dealerId: string, req: UploadRequest): Promise<Result<{ mediaId: string; target: PresignedUpload }>> {
  const db = scopedDb(dealerId)
  const [car] = await db.cars.select(eq(cars.id, req.carId), { limit: 1 })
  if (!car) return { ok: false, error: "not_found" }
  if (car.status === "sold" || car.status === "archived") return { ok: false, error: "car_closed" }

  const allowed: readonly string[] = req.kind === "photo" ? PHOTO_TYPES : VIDEO_TYPES
  if (!allowed.includes(req.contentType)) return { ok: false, error: "invalid" }
  if (req.kind === "photo" && !isAngle(req.angle)) return { ok: false, error: "invalid" }
  if (req.size <= 0 || req.size > (req.kind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES)) return { ok: false, error: "too_large" }

  const key = mediaKey({ dealerId, carId: req.carId, kind: req.kind, angle: req.angle, uploadId: req.uploadId, contentType: req.contentType })
  let [row] = await db.carMedia.select(eq(carMedia.r2Key, key), { limit: 1 })
  if (!row) {
    if ((await db.carMedia.count(eq(carMedia.carId, req.carId))) >= MAX_MEDIA_PER_CAR) return { ok: false, error: "too_many" }
    ;[row] = await db.carMedia.insertReturning({
        carId: req.carId,
        kind: req.kind,
        angle: req.kind === "photo" ? (req.angle as CarAngle) : null,
        r2Key: key,
        status: "pending",
        sortOrder: req.kind === "photo" ? angleOrder(req.angle as CarAngle) : 100,
      })
  }
  return { ok: true, mediaId: row.id, target: await getStorage().presignPut(key, req.contentType) }
}

/** Verify the bytes really landed, then mark the slot uploaded. A retake replaces the old photo. */
export async function confirmUpload(
  dealerId: string,
  p: { carId: string; mediaId: string; width?: number; height?: number; durationSec?: number },
): Promise<Result<{ videoQueued?: boolean }>> {
  const db = scopedDb(dealerId)
  const [row] = await db.carMedia.select(and(eq(carMedia.id, p.mediaId), eq(carMedia.carId, p.carId)), { limit: 1 })
  if (!row) return { ok: false, error: "not_found" }

  const storage = getStorage()
  const head = await storage.head(row.r2Key)
  if (!head) return { ok: false, error: "not_uploaded" } // retryable: the PUT may still be in flight
  const limit = row.kind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES
  if (head.size <= 0 || head.size > limit) {
    await storage.remove(row.r2Key)
    await db.carMedia.update({ status: "failed" }, eq(carMedia.id, row.id))
    return { ok: false, error: "too_large" }
  }

  await db.carMedia.update(
    {
      status: row.kind === "video" ? "processing" : "uploaded",
      width: p.width,
      height: p.height,
      durationSec: p.durationSec !== undefined ? Math.round(p.durationSec) : undefined,
    },
    eq(carMedia.id, row.id),
  )

  if (row.kind === "photo" && row.angle) {
    const older = await db.carMedia.select(
      and(eq(carMedia.carId, p.carId), eq(carMedia.kind, "photo"), eq(carMedia.angle, row.angle), ne(carMedia.id, row.id)),
    )
    for (const o of older) {
      await db.carMedia.delete(eq(carMedia.id, o.id))
      await storage.remove(o.r2Key).catch(() => {}) // best effort: an orphaned object is harmless
    }
  } else if (row.kind === "video") {
    const queued = await enqueueVideoJob({ dealerId, carId: p.carId, mediaId: row.id })
    if (!queued.queued) {
      // Nothing will process it right now. Do not leave it "processing" for ever: the original is safe in storage, and the worker
      // host picks up videos still waiting. Conditional, so it never overwrites a job that already finished.
      await db.carMedia.update({ status: "uploaded" }, and(eq(carMedia.id, row.id), eq(carMedia.status, "processing"))!)
      return { ok: true, videoQueued: false }
    }
  }
  return { ok: true }
}
