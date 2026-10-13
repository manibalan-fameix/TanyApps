import { describe, expect, it } from "vitest"

import { classifySource, deviceOf, isBot, toDataPoint } from "../lib/analytics/events"
import { buildSql, summarise } from "../lib/analytics/query"

describe("analytics events", () => {
  it("ignores link-preview fetchers and crawlers", () => {
    expect(isBot("WhatsApp/2.23.20 A")).toBe(true)
    expect(isBot("facebookexternalhit/1.1")).toBe(true)
    expect(isBot("Googlebot/2.1")).toBe(true)
    expect(isBot("")).toBe(true)
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile Safari")).toBe(false)
  })
  it("names the source from the utm tag or the referrer", () => {
    expect(classifySource("whatsapp", null)).toBe("whatsapp")
    expect(classifySource(null, "https://l.instagram.com/?u=x")).toBe("instagram")
    expect(classifySource(null, "https://www.google.com/")).toBe("google")
    expect(classifySource(null, "")).toBe("direct")
    expect(classifySource(null, "https://example.org")).toBe("other")
  })
  it("tells phones from desktops and indexes by dealer", () => {
    expect(deviceOf("Mozilla/5.0 (Linux; Android 14) Mobile")).toBe("mobile")
    expect(deviceOf("Mozilla/5.0 (Macintosh)")).toBe("desktop")
    const p = toDataPoint({ event: "view", dealerId: "d1", carSlug: "c1", source: "direct", device: "mobile", country: "IN" })
    expect(p.indexes).toEqual(["d1"])
    expect(p.blobs).toEqual(["view", "c1", "direct", "mobile", "IN"])
  })
})

describe("analytics query", () => {
  const id = "3f2b8f0e-1a2b-4c3d-8e4f-5a6b7c8d9e0f"
  it("only builds SQL for a real dealer id and a sane range", () => {
    expect(() => buildSql("x' OR '1'='1", 7)).toThrow()
    expect(buildSql(id, 7)).toContain(`index1 = '${id}'`)
    expect(buildSql(id, 9999)).toContain("INTERVAL '90' DAY")
  })
  it("rolls rows up per listing, best first", () => {
    const out = summarise(
      [
        { car_slug: "a", event: "view", source: "whatsapp", n: "30" },
        { car_slug: "a", event: "view", source: "direct", n: 5 },
        { car_slug: "a", event: "share_click", source: "direct", n: 12 },
        { car_slug: "b", event: "view", source: "instagram", n: 50 },
        { car_slug: "b", event: "chat", source: "direct", n: 3 },
        { car_slug: "", event: "store_view", source: "direct", n: 9 },
      ],
      7,
    )
    expect(out.listings.map((l) => l.carSlug)).toEqual(["b", "a"])
    expect(out.listings[1]).toMatchObject({ views: 35, shareClicks: 12, topSource: "whatsapp" })
    expect(out.listings[1].sources.whatsapp).toEqual({ views: 30, clicks: 0 })
    expect(out.listings[1].sources.direct).toEqual({ views: 5, clicks: 12 })
    expect(out.sourceTotals.instagram).toEqual({ views: 50, clicks: 0 })
    expect(out.sourceTotals.whatsapp).toEqual({ views: 30, clicks: 0 })
    expect(out.totals).toEqual({ views: 85, shareClicks: 12, chats: 3 })
    expect(out.storeViews).toBe(9)
  })
})
