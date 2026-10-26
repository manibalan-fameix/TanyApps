// Regression tests for the hardening pass in docs/architecture/IMPLEMENTATION_REPORT.md. No database needed.
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { nextSubscriptionStatus } from "../lib/billing/state"
import { readBodyUpTo } from "../lib/media/read-body"
import nextConfig from "../next.config"

const ROOT = path.resolve(__dirname, "..")
const DEALER = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

describe("client IP for rate limits", () => {
  it("is read only through lib/core/guards.clientIp, which prefers the edge-set header", () => {
    const offenders = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "components"))]
      .filter((f) => !f.endsWith(path.join("lib", "core", "client-ip.ts")))
      .filter((f) => /x-forwarded-for|x-real-ip/i.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f))
    expect(offenders).toEqual([])
  })
})

describe("nextSubscriptionStatus", () => {
  it("lets a late event move a live subscription anywhere", () => {
    expect(nextSubscriptionStatus("authenticated", "active")).toBe("active")
    expect(nextSubscriptionStatus("active", "pending")).toBe("pending")
    expect(nextSubscriptionStatus("halted", "active")).toBe("active")
    expect(nextSubscriptionStatus(null, "created")).toBe("created")
  })
  it("never reopens a cancelled, completed or expired subscription", () => {
    for (const done of ["cancelled", "completed", "expired"]) {
      for (const late of ["created", "authenticated", "active", "pending", "halted"]) expect(nextSubscriptionStatus(done, late)).toBe(done)
    }
  })
  it("still allows moving between terminal states", () => {
    expect(nextSubscriptionStatus("cancelled", "completed")).toBe("completed")
  })
})

describe("readBodyUpTo", () => {
  const streamOf = (...parts: number[]) =>
    new Request("http://x.test/", {
      method: "PUT",
      body: new ReadableStream({
        start(c) {
          for (const n of parts) c.enqueue(new Uint8Array(n).fill(7))
          c.close()
        },
      }),
      // undici requires `duplex` for streamed bodies; it is not in the DOM RequestInit type.
      ...({ duplex: "half" } as object),
    })
  it("returns the bytes when within the cap", async () => {
    const body = await readBodyUpTo(streamOf(10, 20), 30)
    expect(body?.length).toBe(30)
  })
  it("returns null as soon as the cap is passed, without a Content-Length to rely on", async () => {
    expect(await readBodyUpTo(streamOf(10, 20, 1), 30)).toBeNull()
  })
  it("treats no body as empty", async () => {
    expect((await readBodyUpTo(new Request("http://x.test/", { method: "PUT" }), 5))?.length).toBe(0)
  })
})

describe("security headers", () => {
  it("applies the baseline set to every route", async () => {
    const rules = await nextConfig.headers!()
    const all = rules.find((r) => r.source === "/:path*")
    const keys = all?.headers.map((h) => h.key)
    expect(keys).toEqual(expect.arrayContaining(["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]))
  })
  it("keeps the /login no-store rule", async () => {
    const rules = await nextConfig.headers!()
    expect(rules.find((r) => r.source === "/login")?.headers.some((h) => h.key === "Cache-Control" && h.value.includes("no-store"))).toBe(true)
  })
})

// ---------- photo upload route ----------

const put = vi.fn(async () => {})
const putPrivate = vi.fn(async () => {})
let ctx: unknown
vi.mock("../lib/auth/context", () => ({ getDealerContext: async () => ctx }))
vi.mock("../lib/storage", () => ({ getStorage: () => ({ put }), getPrivateStorage: () => ({ put: putPrivate }) }))

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 1, 2, 3, 4])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>")

async function upload(key: string, body: Uint8Array, type: string) {
  const { PUT } = await import("../app/api/upload/[...key]/route")
  const req = new Request(`http://app.test/api/upload/${key}`, { method: "PUT", body: body as BodyInit, headers: { "content-type": type } })
  return PUT(req, { params: Promise.resolve({ key: key.split("/") }) })
}

describe("PUT /api/upload", () => {
  beforeEach(() => {
    put.mockClear()
    ctx = { status: "ok", dealerInDb: true, dealer: { id: DEALER, industry: "motors" } }
  })
  it("stores a real photo under the caller's own prefix", async () => {
    const res = await upload(`dealers/${DEALER}/cars/c1/front-a.jpg`, JPEG, "image/jpeg")
    expect(res.status).toBe(200)
    expect(put).toHaveBeenCalledTimes(1)
  })
  it("refuses HTML sent with an image Content-Type", async () => {
    const res = await upload(`dealers/${DEALER}/cars/c1/front-a.jpg`, HTML, "image/jpeg")
    expect(res.status).toBe(415)
    expect(put).not.toHaveBeenCalled()
  })
  it("refuses bytes that disagree with the declared image type", async () => {
    expect((await upload(`dealers/${DEALER}/cars/c1/front-a.jpg`, PNG, "image/jpeg")).status).toBe(415)
    expect(put).not.toHaveBeenCalled()
  })
  it("tells an unsupported HEIC photo apart from a damaged one and from a type mismatch", async () => {
    const key = `dealers/${DEALER}/cars/c1/front-a.jpg`
    const heic = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0])
    const truncated = new Uint8Array([0xff, 0xd8]) // starts like a JPEG but is cut off before a valid marker
    const r1 = await upload(key, heic, "image/jpeg")
    const r2 = await upload(key, HTML, "image/jpeg")
    const r3 = await upload(key, PNG, "image/jpeg")
    const r4 = await upload(key, truncated, "image/jpeg")
    expect([r1.status, r2.status, r3.status, r4.status]).toEqual([415, 415, 415, 415])
    expect(r1.headers.get("x-reject-reason")).toBe("heic_unsupported")
    expect(r2.headers.get("x-reject-reason")).toBe("unrecognised")
    expect(r3.headers.get("x-reject-reason")).toBe("type_mismatch")
    expect(r4.headers.get("x-reject-reason")).toBe("unrecognised")
    expect(put).not.toHaveBeenCalled()
  })
  it("refuses another business's prefix and path traversal", async () => {
    expect((await upload(`dealers/${OTHER}/cars/c1/front-a.jpg`, JPEG, "image/jpeg")).status).toBe(403)
    expect((await upload(`dealers/${DEALER}/../${OTHER}/x.jpg`, JPEG, "image/jpeg")).status).toBe(403)
    expect(put).not.toHaveBeenCalled()
  })
  it("refuses an anonymous caller", async () => {
    ctx = { status: "anonymous" }
    expect((await upload(`dealers/${DEALER}/cars/c1/front-a.jpg`, JPEG, "image/jpeg")).status).toBe(401)
    expect(put).not.toHaveBeenCalled()
  })
})

// ---------- Jarvis passphrase throttle ----------

describe("Jarvis passphrase guessing", () => {
  const env = { JARVIS_PASSPHRASE: "correct-horse-battery", ASSETS: { fetch: async () => new Response("page") } }
  const call = async (token: string, ip: string) => {
    const { default: worker } = await import("../workers/jarvis/index.mjs")
    return worker.fetch(new Request("https://jarvis.test/api/warm", { method: "POST", headers: { authorization: `Bearer ${token}`, "cf-connecting-ip": ip } }), env, { waitUntil() {} })
  }
  it("locks a caller out after ten wrong guesses, even if the next one is right", async () => {
    for (let i = 0; i < 10; i++) expect((await call(`wrong-${i}`, "203.0.113.7")).status).toBe(401)
    expect((await call("correct-horse-battery", "203.0.113.7")).status).toBe(429)
  })
  it("does not lock out other callers, and a right passphrase works", async () => {
    expect((await call("correct-horse-battery", "203.0.113.8")).status).toBe(204)
  })
})

// ---------- video listing intake ----------

vi.mock("../lib/ai/vision", () => ({ getVisionClient: () => ({}) }))

describe("POST /api/cars/from-video body bounds", () => {
  const post = async (body: BodyInit, headers: Record<string, string> = {}) => {
    const { POST } = await import("../app/api/cars/from-video/route")
    return POST(new Request("http://app.test/api/cars/from-video", { method: "POST", body, headers }))
  }
  beforeEach(() => {
    ctx = { status: "ok", dealerInDb: true, dealer: { id: DEALER, industry: "motors" } }
  })
  it("refuses a declared body larger than every allowed part together, before parsing it", async () => {
    expect((await post("x", { "content-length": String(60 * 1024 * 1024) })).status).toBe(413)
  })
  it("refuses a streamed body that grows past the cap without a Content-Length", async () => {
    const big = new Uint8Array(16 * 1024 * 1024 + 1)
    expect((await post(big as BodyInit)).status).toBe(413)
  })
  it("still rejects a small malformed body as invalid, and an anonymous caller as 401", async () => {
    expect((await post("not a form", { "content-type": "text/plain" })).status).toBe(400)
    ctx = { status: "anonymous" }
    expect((await post("x")).status).toBe(401)
  })
})
