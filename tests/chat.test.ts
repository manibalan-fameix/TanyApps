import { describe, expect, it, vi } from "vitest"

import { buildCarSystemPrompt, buildGeneralSystemPrompt, createCloudRunChatClient, getChatClient, getChatModel, sanitizeHistory, type CarChatContext } from "../lib/ai/chat"

const carContext: CarChatContext = {
  title: "2019 Maruti Baleno Alpha",
  price: 650000,
  year: 2019,
  kmDriven: 42000,
  fuel: "Petrol",
  transmission: "Manual",
  ownerCount: 1,
  colour: "White",
  insuranceValidTill: "2026-05-01",
  overview: { Location: "Anna Nagar" },
  specs: { Mileage: "21 kmpl" },
  features: ["Sunroof", "Alloy wheels"],
  reasonsToBuy: ["Single owner", "Low kilometres"],
  inspectionScore: 180,
  inspectionSummary: "Good overall condition",
  warrantyAvailable: true,
  serviceHistory: "Full service history",
  accidentHistory: "No accident history",
  floodAffected: false,
  conditionNotes: ["Tyres: Good"],
  protectionPlans: ["Warranty plan"],
  pricing: { emiPerMonth: 12000, downPayment: 100000, loanDurationMonths: 60, interestRate: 10.5, bookingAmount: 10000 },
}

describe("sanitizeHistory", () => {
  it("keeps well-formed turns and trims trailing non-user messages", () => {
    const input = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "What's the price?" },
      { role: "assistant", content: "" }, // dropped: fails min-length, and would be trailing anyway
    ]
    expect(sanitizeHistory(input)).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "What's the price?" },
    ])
  })

  it("caps history length to the most recent messages", () => {
    const input = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `msg ${i}` }))
    const result = sanitizeHistory(input)
    expect(result.length).toBeLessThanOrEqual(16)
    expect(result[result.length - 1].role).toBe("user")
  })

  it("returns an empty array for malformed or non-array input", () => {
    expect(sanitizeHistory(null)).toEqual([])
    expect(sanitizeHistory("hi")).toEqual([])
    expect(sanitizeHistory([{ role: "system", content: "x" }])).toEqual([])
    expect(sanitizeHistory([{ role: "user", content: "" }])).toEqual([])
  })

  it("rejects oversized messages instead of truncating them", () => {
    expect(sanitizeHistory([{ role: "user", content: "a".repeat(2000) }])).toEqual([])
  })
})

describe("buildCarSystemPrompt", () => {
  it("includes the car facts and never invents a registration number", () => {
    const prompt = buildCarSystemPrompt("Tany Motors", "9876543210", carContext)
    expect(prompt).toContain("2019 Maruti Baleno Alpha")
    expect(prompt).toContain("₹6,50,000")
    expect(prompt).toContain("No accident history")
    expect(prompt).toContain("Sunroof, Alloy wheels")
    expect(prompt).toContain("9876543210")
    expect(prompt).not.toMatch(/[A-Z]{2}\d{2}[A-Z]{2}\d{4}/) // no plausible reg-number pattern
  })

  it("falls back to a generic contact line without a dealer phone", () => {
    const prompt = buildCarSystemPrompt("Tany Motors", null, carContext)
    expect(prompt).toContain("contact Tany Motors through the page")
  })
})

describe("buildGeneralSystemPrompt", () => {
  it("lists only the given inventory", () => {
    const prompt = buildGeneralSystemPrompt("Tany Motors", "9876543210", [
      { title: "2020 Hyundai i20", price: 700000, fuel: "Petrol", transmission: "Automatic", kmDriven: 30000, ownerCount: 1 },
    ])
    expect(prompt).toContain("2020 Hyundai i20")
    expect(prompt).toContain("₹7,00,000")
    expect(prompt).toContain("never describe a car that isn't listed")
  })

  it("says so when there's no stock", () => {
    const prompt = buildGeneralSystemPrompt("Tany Motors", null, [])
    expect(prompt).toContain("no cars in stock right now")
  })
})

describe("chat client config", () => {
  it("is disabled without VISION_API_KEY", () => {
    expect(getChatClient({})).toBeNull()
    expect(getChatClient({ VISION_API_KEY: "k" })).not.toBeNull()
  })

  it("prefers CHAT_MODEL, then VISION_MODEL, then the default", () => {
    expect(getChatModel({})).toBe("gemini-3.6-flash")
    expect(getChatModel({ VISION_MODEL: "vision-model" })).toBe("vision-model")
    expect(getChatModel({ VISION_MODEL: "vision-model", CHAT_MODEL: "chat-model" })).toBe("chat-model")
  })

  it("uses Cloud Run when configured without requiring a Gemini key", () => {
    expect(getChatClient({ CLOUD_RUN_GENERATE_URL: "https://ai.example.com/generate" })).not.toBeNull()
  })

  it("streams Cloud Run SSE text and sends the protected request shape", async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer token")
      expect(JSON.parse(String(init?.body)).prompt).toContain("Buyer: What is the price?")
      return new Response('data: {"text":"₹6,50,000"}\n\ndata: [DONE]\n', {
        headers: { "content-type": "text/event-stream" },
      })
    }) as unknown as typeof fetch
    const chunks: string[] = []
    for await (const chunk of createCloudRunChatClient("https://ai.example.com/generate", "token", fetchFn).stream({
      model: "gemini-3.6-flash",
      system: "Facts",
      messages: [{ role: "user", content: "What is the price?" }],
      maxTokens: 100,
    })) chunks.push(chunk)
    expect(chunks).toEqual(["₹6,50,000"])
  })

  it("extracts the response from a regular Cloud Run JSON response", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ prompt: "x", response: "API OK" }), {
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch
    const chunks: string[] = []
    for await (const chunk of createCloudRunChatClient("https://ai.example.com/generate", undefined, fetchFn).stream({
      model: "gemini-3.6-flash",
      system: "Facts",
      messages: [{ role: "user", content: "Test" }],
      maxTokens: 100,
    })) chunks.push(chunk)
    expect(chunks).toEqual(["API OK"])
  })
})
