// Live-database tests for the add-car server logic. Same rules as tenant-leak.integration.test.ts:
// only against a DISPOSABLE, migrated database (TEST_DATABASE_URL).
import { randomBytes, randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"
import path from "node:path"

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { getPlan } from "../lib/plans"

const url = process.env.TEST_DATABASE_URL

// The pool is shared by every block in this file, so it is closed once, at the very end.
let closeDb: (() => Promise<void>) | undefined
afterAll(async () => {
  await closeDb?.()
  vi.unstubAllEnvs()
})

describe.skipIf(!url)("add-car server logic (live database)", () => {
  let m: {
    db: typeof import("../lib/db/client")
    s: typeof import("../lib/db/schema")
    scoped: typeof import("../lib/db/scoped")
    create: typeof import("../lib/cars/create")
    media: typeof import("../lib/cars/media")
    pub: typeof import("../lib/cars/publish")
    state: typeof import("../lib/cars/state")
    rc: typeof import("../lib/rc/lookup")
    mock: typeof import("../lib/rc/mock")
    crypto: typeof import("../lib/crypto")
    local: typeof import("../lib/storage/local")
  }
  let A: string
  let B: string
  let variantId: string
  const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
  const tag = randomUUID().slice(0, 6)

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    vi.stubEnv("NODE_ENV", "development") // local-disk storage adapter
    delete process.env.R2_BUCKET
    delete process.env.VISION_API_KEY
    process.env.ROOT_DOMAIN = "tany.test"
    m = {
      db: await import("../lib/db/client"),
      s: await import("../lib/db/schema"),
      scoped: await import("../lib/db/scoped"),
      create: await import("../lib/cars/create"),
      media: await import("../lib/cars/media"),
      pub: await import("../lib/cars/publish"),
      state: await import("../lib/cars/state"),
      rc: await import("../lib/rc/lookup"),
      mock: await import("../lib/rc/mock"),
      crypto: await import("../lib/crypto"),
      local: await import("../lib/storage/local"),
    }
    closeDb = () => m.db.pool.end()
    const { unscopedDb } = m.db
    const [a, b] = await unscopedDb
      .insert(m.s.dealers)
      .values([
        { slug: `cars-a-${tag}`, displayName: "A Motors", theme, plan: "starter", phone: "+919000000001" },
        { slug: `cars-b-${tag}`, displayName: "B Motors", theme, plan: "starter" },
      ])
      .returning()
    A = a.id
    B = b.id
    ;[{ id: variantId }] = await unscopedDb
      .insert(m.s.variants)
      .values({ make: "Maruti Suzuki", model: `Testcar${tag}`, variant: "Alpha", fuel: "Diesel", transmission: "Manual", yearFrom: 2015, yearTo: 2019 })
      .returning({ id: m.s.variants.id })
  })

  afterAll(async () => {
    await rm(path.join(m.local.LOCAL_ROOT, "dealers", A), { recursive: true, force: true })
    await rm(path.join(m.local.LOCAL_ROOT, "dealers", B), { recursive: true, force: true })
  })

  const landPhoto = async (dealer: string, carId: string, angle: string, uploadId = randomUUID()) => {
    const req = await m.media.requestUpload(dealer, { carId, uploadId, kind: "photo", angle, contentType: "image/jpeg", size: 5 })
    if (!req.ok) throw new Error(req.error)
    const { mkdir, writeFile } = await import("node:fs/promises")
    const [row] = await m.scoped.scopedDb(dealer).carMedia.select(eq(m.s.carMedia.id, req.mediaId))
    const file = m.local.localPath(row.r2Key)!
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, "jpeg!")
    return m.media.confirmUpload(dealer, { carId, mediaId: req.mediaId, width: 10, height: 10 })
  }

  describe("drafts", () => {
    it("creates a draft with an encrypted plate, prefix and unique short code", async () => {
      const id = await m.create.createDraftCar(A, "tn 11 ab 1234")
      const [car] = await m.scoped.scopedDb(A).cars.select(eq(m.s.cars.id, id))
      expect(car.status).toBe("draft")
      expect(car.regNumber).not.toContain("TN11")
      expect(m.crypto.decrypt(car.regNumber!)).toBe("TN11AB1234")
      expect(car.regPrefix).toBe("tn11")
      expect(car.shortCode).toMatch(/^[23456789a-hjkmnp-z]{5,6}$/)
      expect(car.year).toBeNull()
    })
    it("rejects nonsense plates", async () => {
      await expect(m.create.createDraftCar(A, "hello")).rejects.toBeInstanceOf(m.create.InvalidRegError)
    })
    it("a car is invisible to another dealer", async () => {
      const id = await m.create.createDraftCar(A, "TN09CD5678")
      expect(await m.state.getCarState(B, id)).toBeNull()
      expect((await m.state.getCarState(A, id))?.reg).toBe("TN 09 CD 5678")
    })
  })

  describe("RC lookup", () => {
    it("fills the car from the mock provider without claiming RTO verification", async () => {
      const id = await m.create.createDraftCar(A, "TN11AB2222")
      const { record, cached } = await m.rc.lookupRcForCar(A, id, { provider: new m.mock.MockRcProvider() })
      expect(cached).toBe(false)
      const s = (await m.state.getCarState(A, id))!
      expect(s.year).toBe(record.manufacturingYear)
      expect(s.fuel).toBe(record.fuel)
      expect(s.ownerCount).toBe(record.ownerCount)
      expect(s.rcVerified).toBe(false)
    })
    it("a verified provider earns the badge, and never re-calls within 30 days", async () => {
      const id = await m.create.createDraftCar(A, "TN11AB3333")
      const mock = new m.mock.MockRcProvider()
      const fetch = vi.fn((r: string) => mock.fetch(r))
      const verified = { name: "mock", verified: true, fetch, normalize: mock.normalize.bind(mock) }
      await m.rc.lookupRcForCar(A, id, { provider: verified })
      const second = await m.rc.lookupRcForCar(A, id, { provider: verified })
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(second.cached).toBe(true)
      expect((await m.state.getCarState(A, id))!.rcVerified).toBe(true)
    })
    it("stores the raw response encrypted", async () => {
      const id = await m.create.createDraftCar(A, "TN11AB4444")
      await m.rc.lookupRcForCar(A, id, { provider: new m.mock.MockRcProvider() })
      const [row] = await m.scoped.scopedDb(A).rcLookups.select(eq(m.s.rcLookups.carId, id))
      expect(row.rawResponse).not.toMatch(/MARUTI|HYUNDAI|HONDA|TATA|MAHINDRA/)
      expect(m.crypto.decryptJson<{ maker_description: string }>(row.rawResponse).maker_description).toBeTruthy()
    })
    it("does not cache failures, and reports not found", async () => {
      const id = await m.create.createDraftCar(A, "TN11AB0000")
      await expect(m.rc.lookupRcForCar(A, id, { provider: new m.mock.MockRcProvider() })).rejects.toMatchObject({ code: "not_found" })
      expect(await m.scoped.scopedDb(A).rcLookups.count(eq(m.s.rcLookups.carId, id))).toBe(0)
    })
    it("cannot look up another dealer's car", async () => {
      const id = await m.create.createDraftCar(A, "TN11AB5555")
      await expect(m.rc.lookupRcForCar(B, id, { provider: new m.mock.MockRcProvider() })).rejects.toBeTruthy()
    })
    it("limits lookups per IP", async () => {
      const mock = new m.mock.MockRcProvider()
      const ids = await Promise.all(Array.from({ length: 27 }, (_, i) => m.create.createDraftCar(B, `TN22AB${String(1000 + i)}`)))
      const results = await Promise.allSettled(ids.map((id) => m.rc.lookupRcForCar(B, id, { provider: mock, ip: `9.9.9.${tag}` })))
      expect(results.filter((r) => r.status === "rejected" && (r.reason as { code?: string }).code === "rate_limited").length).toBeGreaterThanOrEqual(2)
    })
  })

  describe("uploads", () => {
    it("is idempotent per upload id and only accepts allowed types and sizes", async () => {
      const carId = await m.create.createDraftCar(A, "TN33AB1111")
      const base = { carId, uploadId: randomUUID(), kind: "photo" as const, angle: "dashboard", contentType: "image/jpeg", size: 100 }
      const first = await m.media.requestUpload(A, base)
      const again = await m.media.requestUpload(A, base)
      expect(first.ok && again.ok && first.mediaId === again.mediaId).toBe(true)
      expect(await m.media.requestUpload(A, { ...base, uploadId: randomUUID(), contentType: "application/pdf" })).toEqual({ ok: false, error: "invalid" })
      expect(await m.media.requestUpload(A, { ...base, uploadId: randomUUID(), angle: "roof" })).toEqual({ ok: false, error: "invalid" })
      expect(await m.media.requestUpload(A, { ...base, uploadId: randomUUID(), size: 999_999_999 })).toEqual({ ok: false, error: "too_large" })
      expect(await m.media.requestUpload(A, { ...base, uploadId: randomUUID(), kind: "video", contentType: "video/mp4", size: 100 })).toMatchObject({ ok: true })
    })
    it("refuses another dealer's car", async () => {
      const carId = await m.create.createDraftCar(A, "TN33AB2222")
      expect(await m.media.requestUpload(B, { carId, uploadId: randomUUID(), kind: "photo", angle: "dashboard", contentType: "image/jpeg", size: 1 })).toEqual({ ok: false, error: "not_found" })
      expect(await m.media.confirmUpload(B, { carId, mediaId: randomUUID() })).toEqual({ ok: false, error: "not_found" })
    })
    it("won't confirm until the bytes really exist, then does", async () => {
      const carId = await m.create.createDraftCar(A, "TN33AB3333")
      const req = await m.media.requestUpload(A, { carId, uploadId: randomUUID(), kind: "photo", angle: "boot", contentType: "image/jpeg", size: 5 })
      if (!req.ok) throw new Error("request failed")
      expect(await m.media.confirmUpload(A, { carId, mediaId: req.mediaId })).toEqual({ ok: false, error: "not_uploaded" })
      expect(await landPhoto(A, carId, "boot")).toEqual({ ok: true })
      const s = (await m.state.getCarState(A, carId))!
      expect(s.media.find((x) => x.angle === "boot")?.status).toBe("uploaded")
    })
    it("a retake replaces the earlier photo for that angle", async () => {
      const carId = await m.create.createDraftCar(A, "TN33AB4444")
      await landPhoto(A, carId, "dashboard")
      await landPhoto(A, carId, "dashboard")
      const s = (await m.state.getCarState(A, carId))!
      expect(s.media.filter((x) => x.angle === "dashboard")).toHaveLength(1)
    })
  })

  describe("short links", () => {
    it("resolve only within the dealer that owns the car, and only for published cars", async () => {
      const { resolveShortCode } = await import("../lib/tenant/dealer")
      const mk = async (dealer: string, status: "draft" | "live" | "sold" | "archived", code: string) => {
        await m.db.unscopedDb.insert(m.s.cars).values({ dealerId: dealer, year: 2018, status, shortCode: `${code}${tag}`.slice(0, 6), slug: `sl-${code}-${tag}` })
        return `${code}${tag}`.slice(0, 6)
      }
      const [slugA, slugB] = [`cars-a-${tag}`, `cars-b-${tag}`]
      const live = await mk(A, "live", "l")
      const sold = await mk(A, "sold", "s")
      const draft = await mk(A, "draft", "d")
      const archived = await mk(A, "archived", "a")
      expect(await resolveShortCode(slugA, live)).toBe(`sl-l-${tag}`)
      expect(await resolveShortCode(slugA, sold)).toBe(`sl-s-${tag}`) // old links keep working
      expect(await resolveShortCode(slugA, draft)).toBeNull()
      expect(await resolveShortCode(slugA, archived)).toBeNull()
      // The same code on another dealer's subdomain must never resolve.
      expect(await resolveShortCode(slugB, live)).toBeNull()
      expect(await resolveShortCode("no-such-dealer", live)).toBeNull()
    })
  })

  describe("publishing", () => {
    const ready = async (dealer: string, reg: string) => {
      const carId = await m.create.createDraftCar(dealer, reg)
      await m.scoped.scopedDb(dealer).cars.update({ variantId, year: 2017, fuel: "Diesel", ownerCount: 1 }, eq(m.s.cars.id, carId))
      return carId
    }

    it("is refused until variant, year and the hero photo are in", async () => {
      const carId = await m.create.createDraftCar(A, "TN44AB1111")
      let r = await m.pub.publishCar(A, carId, { price: 500000, km: 40000 }, { vision: null })
      expect(r).toMatchObject({ ok: false, error: "not_ready", missing: ["variant", "year", "hero"] })
      await m.scoped.scopedDb(A).cars.update({ variantId, year: 2017 }, eq(m.s.cars.id, carId))
      await landPhoto(A, carId, "dashboard") // not the hero
      r = await m.pub.publishCar(A, carId, { price: 500000, km: 40000 }, { vision: null })
      expect(r).toMatchObject({ ok: false, missing: ["hero"] })
    })

    it("publishes once the hero lands: live, canonical slug, listed price event, share kit", async () => {
      const carId = await ready(A, "TN11AB6666")
      await landPhoto(A, carId, "front_three_quarter")
      await landPhoto(A, carId, "dashboard")
      const r = await m.pub.publishCar(A, carId, { price: 565000, km: 48200 }, { vision: null })
      if (!r.ok) throw new Error(r.error)
      const s = (await m.state.getCarState(A, carId))!
      expect(s.status).toBe("live")
      expect(s.slug).toBe(`2017-maruti-testcar${tag}-alpha-tn11`)
      expect(s.askingPrice).toBe(565000)
      expect(r.kit.shortLink).toBe(`https://cars-a-${tag}.tany.test/${s.shortCode}`)
      expect(r.kit.canonicalUrl).toBe(`https://cars-a-${tag}.tany.test/${s.slug}`)
      expect(r.kit.caption).toContain(r.kit.shortLink)
      expect(r.kit.caption).toContain("5,65,000")
      expect(r.kit.photos.map((p) => p.angle)).toEqual(["front_three_quarter", "dashboard"])
      expect(s.caption).toBe(r.kit.caption)
      const events = await m.scoped.scopedDb(A).priceEvents.select(eq(m.s.priceEvents.carId, carId))
      expect(events.map((e) => [e.event, e.price])).toEqual([["listed", 565000]])
    })

    it("re-publishing is idempotent, and a new price logs a price change", async () => {
      const carId = await ready(A, "TN11AB7777")
      await landPhoto(A, carId, "front_three_quarter")
      await m.pub.publishCar(A, carId, { price: 400000, km: 10000 }, { vision: null })
      const slug = (await m.state.getCarState(A, carId))!.slug
      await m.pub.publishCar(A, carId, { price: 400000, km: 10000 }, { vision: null })
      await m.pub.publishCar(A, carId, { price: 380000, km: 10000 }, { vision: null })
      expect((await m.state.getCarState(A, carId))!.slug).toBe(slug)
      const events = await m.scoped.scopedDb(A).priceEvents.select(eq(m.s.priceEvents.carId, carId))
      expect(events.map((e) => e.event).sort()).toEqual(["listed", "price_changed"])
    })

    it("gives a colliding canonical URL a numeric suffix", async () => {
      const one = await ready(A, "TN55AB1111")
      const two = await ready(A, "TN55AB2222")
      for (const id of [one, two]) await landPhoto(A, id, "front_three_quarter")
      await m.pub.publishCar(A, one, { price: 300000, km: 1000 }, { vision: null })
      await m.pub.publishCar(A, two, { price: 310000, km: 2000 }, { vision: null })
      expect((await m.state.getCarState(A, two))!.slug).toBe(`2017-maruti-testcar${tag}-alpha-tn55-2`)
    })

    it("validates price and km", async () => {
      const carId = await ready(A, "TN66AB1111")
      await landPhoto(A, carId, "front_three_quarter")
      for (const bad of [{ price: 5, km: 1 }, { price: 500000, km: -1 }, { price: 1.5, km: 1 }, { price: 999_999_999, km: 1 }]) {
        expect(await m.pub.publishCar(A, carId, bad, { vision: null })).toEqual({ ok: false, error: "invalid" })
      }
    })

    it("another dealer cannot publish it", async () => {
      const carId = await ready(A, "TN66AB2222")
      await landPhoto(A, carId, "front_three_quarter")
      expect(await m.pub.publishCar(B, carId, { price: 500000, km: 1 }, { vision: null })).toEqual({ ok: false, error: "not_found" })
      expect((await m.state.getCarState(A, carId))!.status).toBe("draft")
    })

    it("enforces the plan's live-car cap", async () => {
      const [c] = await m.db.unscopedDb.insert(m.s.dealers).values({ slug: `cap-${tag}`, displayName: "Cap", theme, plan: "starter" }).returning()
      // Fill the starter plan exactly to its cap, whatever the cap currently is (it was raised from 20 to 25 in a00c318).
      const cap = getPlan("starter").maxLiveCars
      await m.db.unscopedDb.insert(m.s.cars).values(
        Array.from({ length: cap }, (_, i) => ({ dealerId: c.id, year: 2018, status: "live" as const, shortCode: `c${i}${tag}`.slice(0, 6), slug: `cap-${i}-${tag}` })),
      )
      const carId = await ready(c.id, "TN77AB1111")
      await landPhoto(c.id, carId, "front_three_quarter")
      expect(await m.pub.publishCar(c.id, carId, { price: 500000, km: 1 }, { vision: null })).toEqual({ ok: false, error: "cap_reached" })
      expect((await m.state.getCarState(c.id, carId))!.status).toBe("draft")
      await rm(path.join(m.local.LOCAL_ROOT, "dealers", c.id), { recursive: true, force: true })
    })

    it("getShareKit returns the stored caption for a live car only", async () => {
      const carId = await ready(A, "TN88AB1111")
      await landPhoto(A, carId, "front_three_quarter")
      expect(await m.pub.getShareKit(A, carId)).toBeNull()
      const r = await m.pub.publishCar(A, carId, { price: 450000, km: 5000 }, { vision: null })
      const kit = await m.pub.getShareKit(A, carId)
      expect(kit?.caption).toBe(r.ok ? r.kit.caption : "")
      expect(await m.pub.getShareKit(B, carId)).toBeNull()
    })
  })
})

describe.skipIf(!url)("video worker job (live database, fake ffmpeg)", () => {
  it("processes a video into HLS + poster, records the analysis, and never stores analysis frames", async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    vi.stubEnv("NODE_ENV", "development")
    delete process.env.R2_BUCKET
    const { unscopedDb, pool } = await import("../lib/db/client")
    const s = await import("../lib/db/schema")
    const scoped = await import("../lib/db/scoped")
    const create = await import("../lib/cars/create")
    const media = await import("../lib/cars/media")
    const local = await import("../lib/storage/local")
    const { createLocalStorage } = local
    const { processVideoJob } = await import("../workers/video")
    const { mkdir, writeFile, readdir } = await import("node:fs/promises")

    const tag2 = randomUUID().slice(0, 6)
    const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }
    const [d] = await unscopedDb.insert(s.dealers).values({ slug: `vid-${tag2}`, displayName: "V", theme }).returning()
    const [other] = await unscopedDb.insert(s.dealers).values({ slug: `vid2-${tag2}`, displayName: "W", theme }).returning()
    const carId = await create.createDraftCar(d.id, "TN10AB1234")
    const req = await media.requestUpload(d.id, { carId, uploadId: randomUUID(), kind: "video", contentType: "video/mp4", size: 10 })
    if (!req.ok) throw new Error(req.error)
    const [row] = await scoped.scopedDb(d.id).carMedia.select(eq(s.carMedia.id, req.mediaId))
    const file = local.localPath(row.r2Key)!
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, "fake-video-bytes")

    // A stand-in for ffmpeg: writes the files the real one would, so the job's own logic runs.
    const calls: string[] = []
    const exec = async (cmd: "ffmpeg" | "ffprobe", args: string[]) => {
      calls.push(cmd)
      if (cmd === "ffprobe") return { stdout: JSON.stringify({ format: { duration: "30" }, streams: [{ codec_type: "video", width: 1280, height: 720 }, { codec_type: "audio" }] }) }
      const out = args.at(-1)!
      await mkdir(path.dirname(out), { recursive: true })
      await writeFile(out.replace("%02d", "01"), "x")
      if (out.endsWith("index.m3u8")) await writeFile(out.replace("index.m3u8", "seg_000.ts"), "ts")
      return { stdout: "" }
    }
    const vision = { json: vi.fn(async () => ({ seen: ["front_three_quarter", "dashboard"] })) } as never
    const storage = createLocalStorage()

    // A job carrying another dealer's id must do nothing.
    await processVideoJob({ dealerId: other.id, carId, mediaId: req.mediaId }, { storage, vision, exec })
    expect((await scoped.scopedDb(d.id).carMedia.select(eq(s.carMedia.id, req.mediaId)))[0].status).toBe("pending")

    await processVideoJob({ dealerId: d.id, carId, mediaId: req.mediaId }, { storage, vision, exec })
    const [done] = await scoped.scopedDb(d.id).carMedia.select(eq(s.carMedia.id, req.mediaId))
    expect(done.status).toBe("ready")
    expect(done.durationSec).toBe(30)
    expect(done.analysis?.seen).toEqual(["front_three_quarter", "dashboard"])
    expect(done.analysis?.missing).toHaveLength(10)

    const base = row.r2Key.replace(/\.[^.]+$/, "")
    for (const key of [`${base}/hls/master.m3u8`, `${base}/hls/360p/index.m3u8`, `${base}/hls/720p/seg_000.ts`, `${base}/poster.jpg`]) {
      expect(await storage.head(key), key).not.toBeNull()
    }
    // Analysis frames stay in memory: nothing but HLS files and the poster is written beside the video.
    const written = await readdir(path.dirname(local.localPath(`${base}/poster.jpg`)!))
    expect(written.filter((n) => /^f\d+\.jpg$/.test(n))).toEqual([])

    // Failure marks the media failed and rethrows so the queue retries.
    const failing = async () => { throw new Error("ffmpeg exploded") }
    await expect(processVideoJob({ dealerId: d.id, carId, mediaId: req.mediaId }, { storage, vision, exec: failing as never })).rejects.toThrow("ffmpeg exploded")
    expect((await scoped.scopedDb(d.id).carMedia.select(eq(s.carMedia.id, req.mediaId)))[0].status).toBe("failed")

    await rm(path.join(local.LOCAL_ROOT, "dealers", d.id), { recursive: true, force: true })
    closeDb ??= () => pool.end()
  })
})
