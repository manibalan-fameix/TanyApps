import { describe, expect, it } from "vitest"

import { createR2Storage } from "../lib/storage/r2"

const storage = createR2Storage({ accountId: "acc", accessKeyId: "k", secretAccessKey: "s", bucket: "b", publicUrl: "https://pub.example" })

describe("r2 upload targets", () => {
  it("sends photos through the app, so they never depend on bucket CORS", async () => {
    const t = await storage.presignPut("dealers/d1/cars/c1/front-abc.jpg", "image/jpeg")
    expect(t).toEqual({ url: "/api/upload/dealers/d1/cars/c1/front-abc.jpg", method: "PUT", headers: { "Content-Type": "image/jpeg" } })
  })
  it("sends videos straight to R2 with a signed URL and no checksum the browser cannot send", async () => {
    const t = await storage.presignPut("dealers/d1/cars/c1/video-abc.mp4", "video/mp4")
    expect(t.url).toMatch(/^https:\/\/acc\.r2\.cloudflarestorage\.com\/b\/dealers\/d1\//)
    expect(t.url).not.toMatch(/checksum/i)
  })
})
