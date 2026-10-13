import { describe, expect, it, vi } from "vitest"

import { extractListingFromVideo, toVideoListing } from "../lib/ai/video-listing"
import { createGeminiVision } from "../lib/ai/vision"
import { pickVariant } from "../lib/cars/from-video"
import { encodeWav, frameTimes } from "../lib/video/wav"
import type { VariantRow } from "../lib/variants/match"

const base = {
  make: "Maruti Suzuki", model: "Baleno", variant: "Alpha", year: 2019, fuel: "petrol", transmission: "Manual",
  colour: "White", bodyType: "Hatchback", ownerCount: 1, kmDriven: 42000, askingPrice: 650000, plate: "tn 11 ab 1234",
  insuranceType: "Comprehensive", serviceHistory: "Full service history", accidentHistory: "No accident history",
  tyreCondition: "Good", batteryCondition: null, features: ["sunroof", "Rear camera", "Jetpack"], reasonsToBuy: ["Single owner", "Made up"],
  conditionNotes: "Small dent on the rear bumper.",
}

describe("toVideoListing", () => {
  it("maps answers onto the app's own option lists and drops anything else", () => {
    const l = toVideoListing(base, 2026)
    expect(l).toMatchObject({ year: 2019, fuel: "Petrol", transmission: "Manual", ownerCount: 1, kmDriven: 42000, askingPrice: 650000, plate: "TN11AB1234" })
    expect(l.marketplaceDetails.features.exterior).toEqual(["Sunroof"])
    expect(l.marketplaceDetails.features.safety).toEqual(["Rear camera"])
    expect(l.marketplaceDetails.trust.reasonsToBuy).toEqual(["Single owner"])
    expect(l.marketplaceDetails.overview.bodyType).toBe("Hatchback")
    expect(l.marketplaceDetails.condition.exteriorNotes).toBe("Small dent on the rear bumper.")
  })
  it("rejects implausible numbers and invalid plates instead of guessing", () => {
    const l = toVideoListing({ ...base, year: 1850, kmDriven: -5, askingPrice: 45, ownerCount: 12, plate: "NOTAPLATE", fuel: "steam" }, 2026)
    expect(l).toMatchObject({ year: null, kmDriven: null, askingPrice: null, ownerCount: null, plate: null, fuel: null })
  })
})

describe("extractListingFromVideo", () => {
  it("sends frames then audio then the prompt, and returns null with no frames", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ ...base, features: [], reasonsToBuy: [] }) }] } }] })))
    const vision = createGeminiVision("k", "m", f as unknown as typeof fetch)
    const out = await extractListingFromVideo(vision, { frames: [{ mediaType: "image/jpeg", base64: "AA" }], audio: { mediaType: "audio/wav", base64: "BB" } })
    expect(out?.askingPrice).toBe(650000)
    const parts = JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body).contents[0].parts
    expect(parts.map((p: { inlineData?: { mimeType: string } }) => p.inlineData?.mimeType ?? "text")).toEqual(["image/jpeg", "audio/wav", "text"])
    expect(await extractListingFromVideo(vision, { frames: [] })).toBeNull()
  })
})

const row = (id: string, model: string, variant: string): VariantRow => ({ id, make: "Maruti Suzuki", model, variant, fuel: "Petrol", transmission: "Manual", engineCc: 1197, yearFrom: 2015, yearTo: null })
describe("pickVariant", () => {
  const listing = toVideoListing(base, 2026)
  it("picks a clear winner and leaves ambiguous or unknown cars to the dealer", () => {
    expect(pickVariant([row("a", "Baleno", "Alpha"), row("b", "Swift", "VXi")], listing)?.id).toBe("a")
    expect(pickVariant([row("b", "Swift", "VXi")], listing)).toBeNull()
    expect(pickVariant([row("a", "Baleno", "Alpha")], { ...listing, model: null })).toBeNull()
  })
})

describe("wav helpers", () => {
  it("writes a valid 16-bit mono header and clamps samples", () => {
    const w = encodeWav(new Float32Array([0, 1, -1, 2]), 16000)
    const v = new DataView(w.buffer)
    expect(String.fromCharCode(...w.slice(0, 4))).toBe("RIFF")
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getUint32(40, true)).toBe(8)
    expect(v.getInt16(46, true)).toBe(32767)
    expect(v.getInt16(48, true)).toBe(-32768)
    expect(v.getInt16(50, true)).toBe(32767)
  })
  it("spaces frames evenly and handles bad input", () => {
    expect(frameTimes(12, 4)).toEqual([1.5, 4.5, 7.5, 10.5])
    expect(frameTimes(0, 4)).toEqual([])
  })
})
