import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { enqueueVideoJob } from "../lib/jobs/boss"

const job = { dealerId: "d", carId: "c", mediaId: "m" }

describe("enqueueVideoJob: says honestly whether the job was queued", () => {
  let warn: { mock: { calls: unknown[][] } }
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubEnv("DATABASE_URL", "") // pg-boss must never reach a real database in these tests
    vi.stubEnv("VIDEO_QUEUE_ENABLED", "")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  const metrics = () => warn.mock.calls.map((c: unknown[]) => String(c[0])).filter((l: string) => l.includes("video_not_queued"))

  it("does not try to run pg-boss inside Cloudflare Workers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" })
    expect(await enqueueVideoJob(job)).toEqual({ queued: false, reason: "workers_runtime" })
    expect(metrics()).toHaveLength(1)
    expect(metrics()[0]).toContain('"reason":"workers_runtime"')
  })
  it("tries in Workers only when explicitly enabled, and reports the failure instead of throwing", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" })
    vi.stubEnv("VIDEO_QUEUE_ENABLED", "1")
    expect(await enqueueVideoJob(job)).toEqual({ queued: false, reason: "error" }) // no DATABASE_URL: pg-boss cannot start
    expect(metrics()[0]).toContain('"reason":"error"')
  })
  it("can be switched off everywhere", async () => {
    vi.stubEnv("VIDEO_QUEUE_ENABLED", "0")
    expect(await enqueueVideoJob(job)).toEqual({ queued: false, reason: "disabled" })
  })
  it("a failure to reach the queue is reported and counted, never thrown and never silent", async () => {
    vi.stubGlobal("navigator", { userAgent: "Node.js/24" })
    const result = await enqueueVideoJob(job)
    expect(result).toEqual({ queued: false, reason: "error" })
    expect(metrics()).toHaveLength(1)
  })
  it("puts nothing secret in the logs", async () => {
    vi.stubEnv("DATABASE_URL", "")
    await enqueueVideoJob(job)
    const out = [...warn.mock.calls, ...(console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls].flat().join(" ")
    expect(out).not.toMatch(/postgres:\/\/|password/i)
  })
})
