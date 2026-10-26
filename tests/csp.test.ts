import { beforeEach, describe, expect, it, vi } from "vitest"

import { CSP_DIRECTIVES, CSP_REPORT_PATH, cspReportOnly } from "../lib/security/csp"
import nextConfig from "../next.config"

vi.mock("@/lib/core/rate-limit", () => ({ rateLimit: vi.fn(async () => true) }))

describe("Content-Security-Policy (report-only)", () => {
  it("is sent on every route as REPORT-ONLY and never as an enforced policy", async () => {
    const rules = await nextConfig.headers!()
    const all = rules.find((r) => r.source === "/:path*")!
    const keys = all.headers.map((h) => h.key)
    expect(keys).toContain("Content-Security-Policy-Report-Only")
    expect(keys).not.toContain("Content-Security-Policy")
    expect(all.headers.find((h) => h.key === "Content-Security-Policy-Report-Only")?.value).toBe(cspReportOnly())
  })
  it("lists the third parties the pages really use, so reports stay about real problems", () => {
    const text = cspReportOnly()
    for (const origin of ["https://checkout.razorpay.com", "https://api.razorpay.com", "https://maps.googleapis.com", "https://apis.google.com", "https://identitytoolkit.googleapis.com", "https://*.firebaseapp.com", "https://cdn.tany.in", "https://cdn.tanystaging.in", "wss://track.tany.in", "https://*.r2.cloudflarestorage.com", "https://tile.openstreetmap.org"]) {
      expect(text, origin).toContain(origin)
    }
  })
  it("has no wildcard source, no eval, no object embeds, and cannot be framed by others", () => {
    for (const [name, sources] of Object.entries(CSP_DIRECTIVES)) {
      expect(sources, name).not.toContain("*")
      expect(sources, name).not.toContain("'unsafe-eval'")
      expect(sources, name).not.toContain("http:")
    }
    expect(CSP_DIRECTIVES["object-src"]).toEqual(["'none'"])
    expect(CSP_DIRECTIVES["frame-ancestors"]).toEqual(["'self'"])
    expect(CSP_DIRECTIVES["base-uri"]).toEqual(["'self'"])
  })
  it("reports to a path that tenant hosts can reach (the proxy serves /api/t/* on every host)", () => {
    expect(CSP_REPORT_PATH.startsWith("/api/t/")).toBe(true)
    expect(cspReportOnly()).toContain(`report-uri ${CSP_REPORT_PATH}`)
  })
})

describe("POST /api/t/csp-report", () => {
  const post = async (body: BodyInit | null, headers: Record<string, string> = {}) => {
    const { POST } = await import("../app/api/t/csp-report/route")
    return POST(new Request(`http://app.test${CSP_REPORT_PATH}`, { method: "POST", body, headers: { "content-type": "application/csp-report", ...headers } }))
  }
  const metricLines = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map((c: unknown[]) => String(c[0])).filter((l: string) => l.includes("csp_violation"))
  beforeEach(() => vi.restoreAllMocks())

  it("always answers 204, logs the directive and the blocked ORIGIN, and drops paths, queries and tokens", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const res = await post(JSON.stringify({ "csp-report": { "document-uri": "https://app.tany.in/dashboard/cars/123?token=secret", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/steal.js?session=abc#frag" } }))
    expect(res.status).toBe(204)
    const [line] = metricLines(warn)
    const m = JSON.parse(line)
    expect(m).toMatchObject({ metric: "csp_violation", directive: "script-src-elem", blocked: "https://evil.example", page: "app.tany.in/dashboard", mode: "report-only" })
    expect(line).not.toMatch(/secret|steal|session|frag|123/)
  })
  it("understands keywords like inline and eval, and the newer report format", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await post(JSON.stringify({ "csp-report": { "document-uri": "https://x.tany.in/", "violated-directive": "script-src 'self'", "blocked-uri": "inline" } }))
    await post(JSON.stringify({ "document-uri": "https://x.tany.in/menu", "effective-directive": "img-src", blockedURL: "data" }))
    const parsed = metricLines(warn).map((l: string) => JSON.parse(l))
    expect(parsed[0]).toMatchObject({ directive: "script-src", blocked: "inline" })
    expect(parsed[1]).toMatchObject({ directive: "img-src", blocked: "data", page: "x.tany.in/menu" })
  })
  it("ignores garbage, oversize bodies and hostile directive names without throwing or logging them", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect((await post("not json")).status).toBe(204)
    expect((await post("x".repeat(20_000))).status).toBe(204)
    expect((await post(null)).status).toBe(204)
    await post(JSON.stringify({ "csp-report": { "effective-directive": "<script>alert(1)</script>", "blocked-uri": "javascript:alert(1)", "document-uri": "javascript:1" } }))
    const lines = metricLines(warn)
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({ directive: "other", blocked: "other", page: "unknown" })
    expect(lines[0]).not.toContain("<script>")
  })
  it("stops logging when a client floods it", async () => {
    const { rateLimit } = await import("@/lib/core/rate-limit")
    vi.mocked(rateLimit).mockResolvedValueOnce(false)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect((await post(JSON.stringify({ "csp-report": { "effective-directive": "img-src" } }))).status).toBe(204)
    expect(metricLines(warn)).toHaveLength(0)
  })
})
