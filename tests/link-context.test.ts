import { describe, expect, it, vi } from "vitest"

import { describeLink, inspectLink, extractLink, isPublicHost, parsePublicUrl, summarisePage } from "../lib/ai/link-context"

describe("extractLink", () => {
  it("finds full links, bare domains and social profiles", () => {
    expect(extractLink("see https://kavyastore.in/about.")).toBe("https://kavyastore.in/about")
    expect(extractLink("www.ravitravels.com")).toBe("www.ravitravels.com")
    expect(extractLink("instagram.com/glow_salon_chennai")).toBe("instagram.com/glow_salon_chennai")
    expect(extractLink("my page is facebook.com/ravi.garage ok")).toBe("facebook.com/ravi.garage")
  })
  it("ignores plain sentences and emails", () => {
    expect(extractLink("I sell used cars")).toBeNull()
    expect(extractLink("mail me at ravi@gmail.com")).toBeNull()
  })
})

describe("public URL check", () => {
  it("rejects private and local targets", () => {
    for (const bad of ["http://localhost:3000", "http://127.0.0.1", "http://10.0.0.5", "http://192.168.1.1", "http://169.254.169.254/latest", "http://[::1]/", "ftp://example.com", "https://user:pw@example.com", "http://example.com:8080", "http://intranet", "http://printer.local"])
      expect(parsePublicUrl(bad), bad).toBeNull()
  })
  it("accepts public sites and adds https when missing", () => {
    expect(parsePublicUrl("kavyastore.in")?.href).toBe("https://kavyastore.in/")
    expect(isPublicHost("www.instagram.com")).toBe(true)
  })
})

describe("summarisePage", () => {
  it("reads title, description and keywords", () => {
    const html = `<html><head><title>Fallback</title><meta property="og:title" content="Glow Salon &amp; Spa"><meta name="description" content="Hair, skin and bridal makeup in Chennai"><meta name="keywords" content="salon, spa"></head></html>`
    expect(summarisePage(html)).toEqual({ title: "Glow Salon & Spa", description: "Hair, skin and bridal makeup in Chennai", keywords: "salon, spa" })
  })
})

describe("describeLink", () => {
  it("returns null without a link", async () => {
    expect(await describeLink("I own a salon")).toBeNull()
  })
  it("combines link words with the page summary", async () => {
    const fetchFn = vi.fn(async () => new Response(`<title>Glow Salon</title><meta name="description" content="Bridal makeup">`, { headers: { "content-type": "text/html" } }))
    const out = await describeLink("instagram.com/glow_salon", fetchFn as unknown as typeof fetch)
    expect(out).toContain("Link words: instagram com glow salon")
    expect(out).toContain("Page title: Glow Salon")
    expect(out).toContain("Page description: Bridal makeup")
  })
  it("keeps the link words when the page cannot be fetched or redirects somewhere private", async () => {
    const failing = vi.fn(async () => { throw new Error("blocked") })
    expect(await describeLink("kavyastore.in", failing as unknown as typeof fetch)).toBe("Link words: kavyastore in")
    const redirect = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }))
    expect(await describeLink("kavyastore.in", redirect as unknown as typeof fetch)).toBe("Link words: kavyastore in")
    expect(redirect).toHaveBeenCalledTimes(1)
  })
})

describe("inspectLink", () => {
  it("flags missing pages, unreachable hosts and private addresses as broken", async () => {
    const gone = vi.fn(async () => new Response(null, { status: 404 }))
    expect((await inspectLink("instagram.com/nope", gone as unknown as typeof fetch))?.broken).toBe(true)
    const failing = vi.fn(async () => { throw new Error("dns") })
    expect((await inspectLink("kavyastore.in", failing as unknown as typeof fetch))?.broken).toBe(true)
    expect((await inspectLink("http://localhost/x"))?.broken).toBe(true)
  })
  it("does not flag a page that merely blocks bots", async () => {
    const blocked = vi.fn(async () => new Response(null, { status: 429 }))
    expect((await inspectLink("instagram.com/glow_salon", blocked as unknown as typeof fetch))?.broken).toBe(false)
  })
  it("flags an Instagram profile page that has no profile details", async () => {
    const empty = vi.fn(async () => new Response("<title>Instagram</title>", { headers: { "content-type": "text/html" } }))
    expect((await inspectLink("instagram.com/zzqx_nope", empty as unknown as typeof fetch))?.broken).toBe(true)
    const real = vi.fn(async () => new Response(`<title>Glow (@glow) • Instagram photos and videos</title><meta property="og:description" content="1K Followers">`, { headers: { "content-type": "text/html" } }))
    expect((await inspectLink("instagram.com/glow", real as unknown as typeof fetch))?.broken).toBe(false)
  })
  it("flags a social site's bare front page, including one reached by redirect", async () => {
    expect((await inspectLink("https://www.instagram.com", vi.fn() as unknown as typeof fetch))?.broken).toBe(true)
    const typo = vi.fn(async () => new Response(null, { status: 301, headers: { location: "https://www.instagram.com/" } }))
    const homepage = vi.fn(async () => new Response("<title>Instagram</title>", { headers: { "content-type": "text/html" } }))
    let calls = 0
    const fetchFn = vi.fn(async (...a: unknown[]) => (calls++ === 0 ? typo() : homepage()))
    expect((await inspectLink("https://www.instagram.co", fetchFn as unknown as typeof fetch))?.broken).toBe(true)
  })
})
