import { describe, expect, it } from "vitest"

import { MAX_REVIEW_VIDEO_BYTES, checkReviewMedia, reviewMediaKey } from "@/lib/restaurant/review-media"

const D = "11111111-1111-4111-8111-111111111111"
const C = "22222222-2222-4222-8222-222222222222"
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const CDN = "https://cdn.example.test/"

function storage(sizes: Record<string, number> = {}) {
  const removed: string[] = []
  return {
    removed,
    publicUrl: (key: string) => CDN + key,
    head: async (key: string): Promise<{ size: number } | null> => ({ size: sizes[key] ?? 1000 }),
    remove: async (key: string) => void removed.push(key),
  }
}
const img = (n: number) => ({ type: "image", url: CDN + reviewMediaKey(D, C, id(n), "jpg") })
const vid = (n: number, ext: "mp4" | "mov" | "webm" = "mp4") => ({ type: "video", url: CDN + reviewMediaKey(D, C, id(n), ext) })
const run = (input: unknown, st = storage()) => checkReviewMedia(input, { storage: st, dealerId: D, customerId: C })

describe("review attachments", () => {
  it("allows no attachments", async () => {
    expect(await run(undefined)).toEqual({ ok: true, media: [] })
    expect(await run([])).toEqual({ ok: true, media: [] })
  })
  it("allows up to 5 photos and 1 video", async () => {
    const r = await run([img(1), img(2), img(3), img(4), img(5), vid(6)])
    expect(r.ok).toBe(true)
  })
  it("refuses a 6th photo and a 2nd video", async () => {
    expect(await run([img(1), img(2), img(3), img(4), img(5), img(6)])).toMatchObject({ ok: false })
    expect(await run([vid(1), vid(2)])).toMatchObject({ ok: false })
  })
  it("refuses a link that is not this customer's own file in this shop", async () => {
    expect(await run([{ type: "image", url: "https://evil.example/x.jpg" }])).toMatchObject({ ok: false })
    expect(await run([{ type: "image", url: CDN + reviewMediaKey(D, "33333333-3333-4333-8333-333333333333", id(1), "jpg") }])).toMatchObject({ ok: false })
    expect(await run([{ type: "image", url: CDN + reviewMediaKey("44444444-4444-4444-8444-444444444444", C, id(1), "jpg") }])).toMatchObject({ ok: false })
  })
  it("refuses a photo that is really a video file, and the reverse, and path tricks", async () => {
    expect(await run([{ type: "image", url: vid(1).url }])).toMatchObject({ ok: false })
    expect(await run([{ type: "video", url: img(1).url }])).toMatchObject({ ok: false })
    expect(await run([{ type: "image", url: `${CDN}dealers/${D}/reviews/${C}/../${id(1)}.jpg` }])).toMatchObject({ ok: false })
  })
  it("refuses the same file twice and non-lists", async () => {
    expect(await run([img(1), img(1)])).toMatchObject({ ok: false })
    expect(await run("nope")).toMatchObject({ ok: false })
  })
  it("refuses a file that never finished uploading", async () => {
    const st = storage()
    st.head = async () => null
    expect(await run([img(1)], st)).toMatchObject({ ok: false })
  })
  it("refuses, and deletes, a video over the size limit", async () => {
    const v = vid(1)
    const key = reviewMediaKey(D, C, id(1), "mp4")
    const st = storage({ [key]: MAX_REVIEW_VIDEO_BYTES + 1 })
    expect(await run([v], st)).toMatchObject({ ok: false })
    expect(st.removed).toEqual([key])
    expect(await run([v], storage({ [key]: MAX_REVIEW_VIDEO_BYTES }))).toMatchObject({ ok: true })
  })
})
