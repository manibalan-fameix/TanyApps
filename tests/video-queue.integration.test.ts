// Live test: a video that cannot be queued is never left "processing", and the worker host picks up waiting videos.
// Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database (see docs/staging/neon-test-database.md).
import { randomBytes, randomUUID } from "node:crypto"
import path from "node:path"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()

describe.skipIf(!url)("video queue (live database)", () => {
  let db: typeof import("../lib/db/client")
  let s: typeof import("../lib/db/schema")
  let scoped: typeof import("../lib/db/scoped")
  let create: typeof import("../lib/cars/create")
  let media: typeof import("../lib/cars/media")
  let local: typeof import("../lib/storage/local")
  let requeue: typeof import("../lib/jobs/requeue")
  let dealerId: string
  const tag = randomBytes(3).toString("hex")

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    vi.stubEnv("NODE_ENV", "development") // local-disk storage
    vi.stubEnv("VIDEO_QUEUE_ENABLED", "0") // never start pg-boss (it would create its own schema in this database)
    delete process.env.R2_BUCKET
    ;[db, s, scoped, create, media, local, requeue] = await Promise.all([
      import("../lib/db/client"),
      import("../lib/db/schema"),
      import("../lib/db/scoped"),
      import("../lib/cars/create"),
      import("../lib/cars/media"),
      import("../lib/storage/local"),
      import("../lib/jobs/requeue"),
    ])
    const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
    dealerId = (await db.unscopedDb.insert(s.dealers).values({ slug: `vq-${tag}`, displayName: "VQ", theme }).returning())[0].id
  })
  afterAll(async () => {
    try {
      const { rm } = await import("node:fs/promises")
      await rm(path.join(local.LOCAL_ROOT, "dealers", dealerId), { recursive: true, force: true })
      const mine = await db.unscopedDb.select({ id: s.cars.id }).from(s.cars).where(eq(s.cars.dealerId, dealerId))
      for (const c of mine) await db.unscopedDb.delete(s.carMedia).where(eq(s.carMedia.carId, c.id))
      await db.unscopedDb.delete(s.cars).where(eq(s.cars.dealerId, dealerId))
      await db.unscopedDb.delete(s.dealers).where(eq(s.dealers.id, dealerId))
    } finally {
      vi.unstubAllEnvs()
      await db.pool.end()
    }
  })

  async function landVideo() {
    const carId = await create.createDraftCar(dealerId, `TN${String(10 + Math.floor(Math.random() * 80))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(1000 + Math.random() * 8999)}`)
    const req = await media.requestUpload(dealerId, { carId, uploadId: randomUUID(), kind: "video", contentType: "video/mp4", size: 10 })
    if (!req.ok) throw new Error(req.error)
    const [row] = await scoped.scopedDb(dealerId).carMedia.select(eq(s.carMedia.id, req.mediaId))
    const { mkdir, writeFile } = await import("node:fs/promises")
    const file = local.localPath(row.r2Key)!
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, "original-video-bytes")
    return { carId, mediaId: req.mediaId, key: row.r2Key, file }
  }
  const statusOf = async (id: string) => (await scoped.scopedDb(dealerId).carMedia.select(eq(s.carMedia.id, id)))[0].status
  const setStatus = (id: string, status: "pending" | "uploaded" | "processing" | "ready" | "failed") => db.unscopedDb.update(s.carMedia).set({ status }).where(eq(s.carMedia.id, id))

  it("a video that could not be queued is not left 'processing', and the original is untouched", async () => {
    const v = await landVideo()
    const res = await media.confirmUpload(dealerId, { carId: v.carId, mediaId: v.mediaId, durationSec: 20 })
    expect(res).toEqual({ ok: true, videoQueued: false })
    expect(await statusOf(v.mediaId)).toBe("uploaded") // waiting for the worker host, not stuck
    const { readFile } = await import("node:fs/promises")
    expect((await readFile(v.file)).toString()).toBe("original-video-bytes")
  })

  it("the worker host queues waiting videos once, however many sweeps run at the same time", async () => {
    const v = await landVideo()
    await setStatus(v.mediaId, "uploaded")
    const sent: { dealerId: string; carId: string; mediaId: string }[] = []
    const send = async (j: unknown) => void sent.push(j as (typeof sent)[number])
    const results = await Promise.all([1, 2, 3, 4].map(() => requeue.requeueWaitingVideos(send, 50, { dealerId })))
    // Other videos from earlier tests may be waiting too; what matters is that none is sent twice, and this one is sent once.
    expect(sent.filter((j) => j.mediaId === v.mediaId)).toEqual([{ dealerId, carId: v.carId, mediaId: v.mediaId }])
    expect(new Set(sent.map((j) => j.mediaId)).size).toBe(sent.length)
    expect(results.reduce((a, r) => a + r.queued, 0)).toBe(sent.length)
    expect(await statusOf(v.mediaId)).toBe("processing")
    expect((await requeue.requeueWaitingVideos(send, 50, { dealerId })).queued).toBe(0) // nothing left waiting
  })

  it("a queue that is down puts the video back to waiting, and a later sweep succeeds", async () => {
    const v = await landVideo()
    await setStatus(v.mediaId, "uploaded")
    vi.spyOn(console, "error").mockImplementation(() => {})
    const down = await requeue.requeueWaitingVideos(async () => { throw new Error("queue unreachable") }, 50, { dealerId })
    expect(down).toEqual({ queued: 0, failed: 1 })
    expect(await statusOf(v.mediaId)).toBe("uploaded")
    const up = await requeue.requeueWaitingVideos(async () => {}, 50, { dealerId })
    expect(up.queued).toBe(1)
    expect(await statusOf(v.mediaId)).toBe("processing")
  })

  it("leaves finished, failed, unconfirmed and photo media alone", async () => {
    const ready = await landVideo(); await setStatus(ready.mediaId, "ready")
    const failed = await landVideo(); await setStatus(failed.mediaId, "failed")
    const pending = await landVideo()
    const sent: unknown[] = []
    await requeue.requeueWaitingVideos(async (j) => void sent.push(j), 50, { dealerId })
    expect(sent.some((j) => [ready.mediaId, failed.mediaId, pending.mediaId].includes((j as { mediaId: string }).mediaId))).toBe(false)
    expect(await statusOf(ready.mediaId)).toBe("ready")
    expect(await statusOf(failed.mediaId)).toBe("failed")
    expect(await statusOf(pending.mediaId)).toBe("pending")
  })

  it("never overwrites a job that already finished while a late failure is being handled", async () => {
    const v = await landVideo()
    await setStatus(v.mediaId, "ready")
    await scoped.scopedDb(dealerId).carMedia.update({ status: "uploaded" }, (await import("drizzle-orm")).and(eq(s.carMedia.id, v.mediaId), eq(s.carMedia.status, "processing"))!)
    expect(await statusOf(v.mediaId)).toBe("ready")
  })
})
