import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"

const runJob = vi.fn()
vi.mock("../lib/core/scheduler", () => ({
  JOBS: { ping: {}, "expire-unpaid-orders": {}, daily: {}, monthly: {} },
  runJob: (...a: unknown[]) => runJob(...a),
}))

import { POST } from "../app/api/internal/cron/[job]/route"
import { secretsMatch } from "../lib/core/secure-compare"
import { SCHEDULE } from "../workers/cron/index"

const SECRET = "s3cret-value"
const call = (job: string, headers: Record<string, string>) =>
  POST(new Request(`https://app.tany.in/api/internal/cron/${job}`, { method: "POST", headers }), { params: Promise.resolve({ job }) })
const good = () => ({ "x-cron-secret": SECRET, "x-cron-slot": new Date().toISOString() })

beforeEach(() => {
  runJob.mockReset()
  vi.stubEnv("CRON_SECRET", SECRET)
})

describe("secretsMatch", () => {
  it("matches equal secrets and rejects anything else, whatever the lengths", async () => {
    expect(await secretsMatch("abc", "abc")).toBe(true)
    expect(await secretsMatch("abc", "abd")).toBe(false)
    expect(await secretsMatch("abc", "abcd")).toBe(false)
    expect(await secretsMatch("", "")).toBe(false)
    expect(await secretsMatch(null, "abc")).toBe(false)
    expect(await secretsMatch("abc", undefined)).toBe(false)
  })
})

describe("cron route", () => {
  it("is unavailable until a secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "")
    expect((await call("ping", good())).status).toBe(503)
    expect(runJob).not.toHaveBeenCalled()
  })

  it("rejects a missing or wrong secret before doing anything", async () => {
    expect((await call("ping", { "x-cron-slot": new Date().toISOString() })).status).toBe(401)
    expect((await call("ping", { ...good(), "x-cron-secret": "nope" })).status).toBe(401)
    expect(runJob).not.toHaveBeenCalled()
  })

  it("does not accept the secret in the URL", async () => {
    const res = await POST(new Request(`https://app.tany.in/api/internal/cron/ping?secret=${SECRET}`, { method: "POST", headers: { "x-cron-slot": new Date().toISOString() } }), { params: Promise.resolve({ job: "ping" }) })
    expect(res.status).toBe(401)
  })

  it("answers 404 for a job that does not exist, including inherited object keys", async () => {
    expect((await call("nope", good())).status).toBe(404)
    expect((await call("constructor", good())).status).toBe(404)
    expect((await call("__proto__", good())).status).toBe(404)
  })

  it("rejects a missing, malformed or far-off slot", async () => {
    expect((await call("ping", { "x-cron-secret": SECRET })).status).toBe(400)
    expect((await call("ping", { "x-cron-secret": SECRET, "x-cron-slot": "yesterday-ish" })).status).toBe(400)
    expect((await call("ping", { "x-cron-secret": SECRET, "x-cron-slot": new Date(Date.now() - 3 * 3_600_000).toISOString() })).status).toBe(400)
    expect(runJob).not.toHaveBeenCalled()
  })

  it("runs the job for the slot, rounded to the second", async () => {
    runJob.mockResolvedValue({ ran: true, ok: true, result: "done" })
    const slot = new Date(Date.now() - 1000)
    const res = await call("ping", { "x-cron-secret": SECRET, "x-cron-slot": slot.toISOString() })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, ran: true, result: "done" })
    const passed = runJob.mock.calls[0][1] as Date
    expect(passed.getMilliseconds()).toBe(0)
    expect(Math.abs(passed.getTime() - slot.getTime())).toBeLessThan(1000)
  })

  it("answers 200 and ran:false for a slot that already ran", async () => {
    runJob.mockResolvedValue({ ran: false, reason: "already_ran" })
    const res = await call("ping", good())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, ran: false, reason: "already_ran" })
  })

  it("answers 500 for a job that failed, so the trigger worker sees it", async () => {
    runJob.mockResolvedValue({ ran: true, ok: false, result: "boom" })
    expect((await call("ping", good())).status).toBe(500)
  })
})

describe("cron worker schedule", () => {
  const wrangler = readFileSync("workers/cron/wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, "")
  const crons = JSON.parse(wrangler).triggers.crons as string[]

  it("has jobs for exactly the schedules Cloudflare fires", () => {
    expect([...crons].sort()).toEqual(Object.keys(SCHEDULE).sort())
  })

  it("only names jobs that exist in the app's registry", async () => {
    const { JOBS: realJobs } = await vi.importActual<typeof import("../lib/core/scheduler")>("../lib/core/scheduler")
    for (const jobs of Object.values(SCHEDULE)) for (const j of jobs) expect(Object.keys(realJobs)).toContain(j)
  })
})
