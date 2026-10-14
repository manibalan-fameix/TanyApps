import { describe, expect, it, vi } from "vitest"

import { captionIsFaithful, formatInr, generateCaption, templateCaption, type CaptionFacts } from "../lib/share/caption"
import { carSlug, looksLikeShortCode, slugify, uniqueSlug } from "../lib/slug"
import { imageUrl } from "../lib/media/url"
import { mediaKey, videoOutputKeys } from "../lib/media/keys"

const facts: CaptionFacts = {
  dealerName: "Sri Murugan Motors", city: "Chennai", phone: "+919000000001", year: 2017, make: "Maruti Suzuki",
  model: "Baleno", variant: "Alpha", fuel: "Diesel", transmission: "Manual", kmDriven: 48200, ownerCount: 1,
  price: 565000, rcVerified: true, link: "https://sri-murugan.tany.in/k7x2m",
}

describe("slugs", () => {
  it("builds the canonical path from the brief", () => {
    expect(carSlug({ year: 2017, make: "Maruti Suzuki", model: "Baleno", variant: "Alpha", regPrefix: "tn11" })).toBe("2017-maruti-baleno-alpha-tn11")
  })
  it("handles symbols in variant names", () => {
    expect(slugify("ZXi+")).toBe("zxi-plus")
    expect(slugify("SX(O)")).toBe("sx-o")
    expect(carSlug({ year: 2020, make: "Hyundai", model: "Grand i10 Nios", variant: "Sportz AMT", regPrefix: "tn09" })).toBe("2020-hyundai-grand-i10-nios-sportz-amt-tn09")
  })
  it("de-duplicates", () => {
    expect(uniqueSlug("a", new Set())).toBe("a")
    expect(uniqueSlug("a", new Set(["a"]))).toBe("a-2")
    expect(uniqueSlug("a", new Set(["a", "a-2"]))).toBe("a-3")
  })
  it("tells short codes from canonical slugs", () => {
    expect(looksLikeShortCode("k7x2m")).toBe(true)
    expect(looksLikeShortCode("k7x2m9")).toBe(true)
    expect(looksLikeShortCode("2017-maruti-baleno-alpha-tn11")).toBe(false)
    expect(looksLikeShortCode("abc")).toBe(false)
    expect(looksLikeShortCode("k7x2m9z")).toBe(false)
    expect(looksLikeShortCode("k0x1m")).toBe(false) // 0 and 1 are never generated
  })
})

describe("caption", () => {
  it("formats rupees the Indian way", () => expect(formatInr(565000)).toBe("5,65,000"))
  it("template carries the facts, link and only earned claims", () => {
    const c = templateCaption(facts)
    for (const s of ["2017 Maruti Suzuki Baleno Alpha", "5,65,000", "48,200 km", "1st owner", "Sri Murugan Motors", facts.link, "RC details verified"]) expect(c).toContain(s)
    expect(templateCaption({ ...facts, rcVerified: false })).not.toMatch(/verified/i)
    expect(templateCaption({ ...facts, ownerCount: 2 })).toContain("2nd owner")
    expect(templateCaption({ ...facts, ownerCount: 3 })).toContain("3rd owner")
    expect(templateCaption({ ...facts, ownerCount: 11 })).toContain("11th owner")
  })
  it("faithfulness check rejects a missing link, wrong price and foreign URLs", () => {
    const ok = `Nice car ₹5,65,000 ${facts.link}`
    expect(captionIsFaithful(ok, facts)).toBe(true)
    expect(captionIsFaithful("Nice car ₹5,65,000", facts)).toBe(false)
    expect(captionIsFaithful(`Nice car ₹4,99,000 ${facts.link}`, facts)).toBe(false)
    expect(captionIsFaithful(`${ok} also https://evil.example/x`, facts)).toBe(false)
  })
  it("faithfulness check rejects corrupted unicode (broken emoji)", () => {
    const ok = `Nice car ₹5,65,000 ${facts.link}`
    expect(captionIsFaithful(`${ok} �`, facts)).toBe(false)
    expect(captionIsFaithful(`${ok} \uD83D`, facts)).toBe(false) // lone high surrogate
    expect(captionIsFaithful(`${ok} 🚗`, facts)).toBe(true) // valid pair (🚗)
  })
  it("uses the model's caption only when faithful", async () => {
    const good = { json: vi.fn(async () => ({ caption: `Baleno ready 🚗 ₹5,65,000 ${facts.link} #UsedCars` })) } as never
    expect((await generateCaption(good, facts)).source).toBe("ai")
    const noLink = { json: vi.fn(async () => ({ caption: "Baleno ₹5,65,000" })) } as never
    expect((await generateCaption(noLink, facts)).source).toBe("template")
    const claimsVerified = { json: vi.fn(async () => ({ caption: `Verified! ₹5,65,000 ${facts.link}` })) } as never
    expect((await generateCaption(claimsVerified, { ...facts, rcVerified: false })).source).toBe("template")
    expect((await generateCaption({ json: vi.fn(async () => null) } as never, facts)).source).toBe("template")
    expect((await generateCaption(null, facts)).source).toBe("template")
  })
})

describe("media helpers", () => {
  it("scopes keys under the dealer and car, per upload id", () => {
    expect(mediaKey({ dealerId: "D", carId: "C", kind: "photo", angle: "dashboard", uploadId: "u1", contentType: "image/jpeg" })).toBe("dealers/D/cars/C/dashboard-u1.jpg")
    expect(mediaKey({ dealerId: "D", carId: "C", kind: "video", uploadId: "u2", contentType: "video/mp4" })).toBe("dealers/D/cars/C/video-u2.mp4")
  })
  it("derives video output keys beside the original", () => {
    expect(videoOutputKeys("dealers/D/cars/C/video-u2.mp4")).toEqual({
      hlsMaster: "dealers/D/cars/C/video-u2/hls/master.m3u8", poster: "dealers/D/cars/C/video-u2/poster.jpg", hlsDir: "dealers/D/cars/C/video-u2/hls",
    })
  })
  it("builds Cloudflare image-resizing URLs, and leaves local URLs alone", () => {
    expect(imageUrl("https://cdn.example.com/dealers/D/a.jpg", { width: 800, height: 1000, fit: "cover" })).toBe(
      "https://cdn.example.com/cdn-cgi/image/width=800,height=1000,fit=cover,quality=80,format=auto/dealers/D/a.jpg",
    )
    expect(imageUrl("/api/t/media/dealers/D/a.jpg", { width: 800 })).toBe("/api/t/media/dealers/D/a.jpg")
  })
})
