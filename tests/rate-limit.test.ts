import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const countMetric = vi.fn()
vi.mock("../lib/core/metrics", () => ({ countMetric: (...a: unknown[]) => countMetric(...a) }))

import { type RateLimiterNamespace, memoryAllow, rateLimit, resetMemoryLimiter } from "../lib/core/rate-limit"
import { slideWindow } from "../lib/core/rate-window"

beforeEach(() => {
  countMetric.mockClear()
  resetMemoryLimiter()
})

describe("slideWindow", () => {
  it("allows up to the limit inside the window, blocks, then recovers once old hits age out", () => {
    let hits: number[] = []
    const hit = (now: number) => {
      const r = slideWindow(hits, now, 3, 1000)
      hits = r.hits
      return r.allowed
    }
    expect([0, 10, 20].map(hit)).toEqual([true, true, true])
    expect(hit(30)).toBe(false)
    expect(hit(999)).toBe(false)
    expect(hit(1001)).toBe(true) // the hit at 0 has aged out
    expect(hit(1002)).toBe(false) // 10, 20, 1001 still count
  })

  it("does not record a denied action, so being blocked never extends the block", () => {
    const first = slideWindow([], 0, 1, 1000)
    const denied = slideWindow(first.hits, 500, 1, 1000)
    expect(denied.allowed).toBe(false)
    expect(denied.hits).toEqual([0])
    expect(slideWindow(denied.hits, 1000, 1, 1000).allowed).toBe(true)
  })
})

describe("memory fallback (no binding)", () => {
  it("limits per key and keeps keys independent", () => {
    expect([1, 2, 3].map(() => memoryAllow("k1", 3, 1000, 1_000_000))).toEqual([true, true, true])
    expect(memoryAllow("k1", 3, 1000, 1_000_010)).toBe(false)
    expect(memoryAllow("k1", 3, 1000, 1_001_001)).toBe(true)
    expect(memoryAllow("a", 1, 1000, 5)).toBe(true)
    expect(memoryAllow("b", 1, 1000, 5)).toBe(true)
    expect(memoryAllow("a", 1, 1000, 6)).toBe(false)
  })

  it("is what rateLimit uses when the binding is explicitly absent", async () => {
    expect(await rateLimit("m", 1, 1000, {}, null)).toBe(true)
    expect(await rateLimit("m", 1, 1000, {}, null)).toBe(false)
  })
})

/** A fake namespace backed by the real window algorithm, one object per name. */
function fakeNamespace() {
  const objects = new Map<string, number[]>()
  const names: string[] = []
  const ns: RateLimiterNamespace = {
    idFromName: (name) => (names.push(name), name),
    get: (id) => ({
      hit: async (limit, windowMs) => {
        const r = slideWindow(objects.get(String(id)) ?? [], Date.now(), limit, windowMs)
        objects.set(String(id), r.hits)
        return r.allowed
      },
    }),
  }
  return { ns, names }
}

describe("rateLimit with the Durable Object", () => {
  it("counts per key through the object and blocks over the limit", async () => {
    const { ns } = fakeNamespace()
    const results = []
    for (let i = 0; i < 3; i++) results.push(await rateLimit("login:b", 2, 60_000, {}, ns))
    expect(results).toEqual([true, true, false])
    expect(await rateLimit("login:other", 2, 60_000, {}, ns)).toBe(true)
  })

  it("names the object by a hash, never by the raw key (which can hold a phone number or IP)", async () => {
    const { ns, names } = fakeNamespace()
    await rateLimit("booking:+919999999999", 5, 1000, {}, ns)
    expect(names).toHaveLength(1)
    expect(names[0]).toMatch(/^[0-9a-f]{64}$/)
    expect(names[0]).not.toContain("9999999999")
  })

  const broken: RateLimiterNamespace = {
    idFromName: (n) => n,
    get: () => ({ hit: async () => { throw new Error("object unreachable") } }),
  }
  const hanging: RateLimiterNamespace = {
    idFromName: (n) => n,
    get: () => ({ hit: () => new Promise<boolean>(() => {}) }),
  }

  it("fails OPEN for ordinary paths when the limiter is unreachable, and counts the failure", async () => {
    expect(await rateLimit("coupon:1.2.3.4", 5, 1000, {}, broken)).toBe(true)
    expect(countMetric).toHaveBeenCalledWith("rate_limiter_unreachable", expect.objectContaining({ mode: "open", prefix: "coupon" }))
  })

  it("fails CLOSED for authentication paths when the limiter is unreachable, and counts the failure", async () => {
    expect(await rateLimit("rider:d1:DP001", 8, 1000, { failClosed: true }, broken)).toBe(false)
    expect(countMetric).toHaveBeenCalledWith("rate_limiter_unreachable", expect.objectContaining({ mode: "closed", prefix: "rider" }))
  })

  it("treats a limiter that never answers as unreachable, in both modes", async () => {
    expect(await rateLimit("a:1", 5, 1000, { timeoutMs: 20 }, hanging)).toBe(true)
    expect(await rateLimit("verify-phone:u1", 5, 1000, { failClosed: true, timeoutMs: 20 }, hanging)).toBe(false)
    expect(countMetric).toHaveBeenCalledTimes(2)
  })
})

describe("every call site awaits the limiter", () => {
  // rateLimit() returns a Promise, which is always truthy: forgetting `await` would silently disable a limit.
  const roots = ["app", "lib", "components", "hooks", "workers/tracker"]
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) {
        if (name !== "node_modules") walk(path)
      } else if (/\.(ts|tsx)$/.test(name)) files.push(path)
    }
  }
  roots.forEach(walk)

  it("has no call to the old synchronous allow()", () => {
    const offenders = files.filter((f) => /(?<![\w.])allow\(/.test(readFileSync(f, "utf8")) && !f.endsWith("rate-limit.ts"))
    expect(offenders).toEqual([])
  })

  it("never calls rateLimit( without await", () => {
    const offenders: string[] = []
    for (const f of files) {
      if (f.endsWith("lib/core/rate-limit.ts")) continue
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/(?<![\w.])rateLimit\(/.test(line) && !/await rateLimit\(/.test(line) && !/^\s*(import|export|\/\/|\*)/.test(line)) offenders.push(`${f}:${i + 1}`)
        })
    }
    expect(offenders).toEqual([])
  })

  it("keeps authentication paths fail-closed", () => {
    const text = (f: string) => readFileSync(f, "utf8")
    expect(text("app/(tenant)/sites/[dealer]/delivery/actions.ts")).toMatch(/rateLimit\(`rider:[^\n]*failClosed: true/)
    expect(text("app/(tenant)/sites/[dealer]/delivery/actions.ts")).toMatch(/rateLimit\(`rider-ip:[^\n]*failClosed: true/)
    expect(text("lib/auth/actions.ts")).toMatch(/rateLimit\(`teammate-login:[^\n]*failClosed: true/)
    expect(text("lib/super/actions.ts")).toMatch(/failClosed: true/)
    expect(text("app/(admin)/onboarding/actions.ts")).toMatch(/rateLimit\(`verify-phone:[^\n]*failClosed: true/)
    expect(text("app/(admin)/(shell)/settings/team/actions.ts")).toMatch(/rateLimit\(`team:[^\n]*failClosed: true/)
  })
})
