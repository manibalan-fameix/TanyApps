import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { readPlate } from "../lib/ai/plate"
import { createGeminiVision, getVisionClient } from "../lib/ai/vision"

const schema = z.object({ plate: z.string().nullable() })
const req = { system: "s", prompt: "p", jsonSchema: {}, validate: schema }
const reply = (t: string | null, finishReason = "STOP") =>
  new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: t === null ? [] : [{ text: t }] } }] }))
const fakeFetch = (make: () => Response) => vi.fn(async () => make()) as unknown as typeof fetch

describe("vision client", () => {
  it("returns validated JSON and sends images as inlineData", async () => {
    const f = fakeFetch(() => reply('{"plate":"TN11AB1234"}'))
    const v = createGeminiVision("key", "test-model", f)
    const out = await v.json({ ...req, images: [{ mediaType: "image/jpeg", base64: "AAAA" }] })
    expect(out).toEqual({ plate: "TN11AB1234" })
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain("/models/test-model:generateContent")
    expect(init.headers["x-goog-api-key"]).toBe("key")
    const sent = JSON.parse(init.body)
    expect(sent.contents[0].parts[0]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "AAAA" } })
    expect(sent.generationConfig.responseMimeType).toBe("application/json")
  })
  it("returns null for schema violations, non-JSON, blocks, truncation and empty output", async () => {
    for (const r of [reply('{"nope":1}'), reply("not json"), reply('{"plate":"X"}', "SAFETY"), reply('{"plate":"X"}', "MAX_TOKENS"), reply(null)]) {
      expect(await createGeminiVision("k", "m", fakeFetch(() => r)).json(req)).toBeNull()
    }
  })
  it("returns null instead of throwing when the API call fails, and does not log the prompt", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const v = createGeminiVision("k", "m", vi.fn(async () => { throw new Error("boom TN11AB1234") }) as unknown as typeof fetch)
    expect(await v.json({ ...req, prompt: "secret plate TN11AB1234" })).toBeNull()
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/TN11AB1234|secret/)
    log.mockRestore()
  })
  it("is disabled without VISION_API_KEY", () => {
    expect(getVisionClient({})).toBeNull()
    expect(getVisionClient({ VISION_API_KEY: "k" })).not.toBeNull()
  })
})

describe("plate reading", () => {
  const image = { mediaType: "image/jpeg" as const, base64: "AAAA" }
  const client = (plate: string | null) => ({ json: vi.fn(async () => ({ plate })) }) as never

  it("repairs OCR confusions and validates", async () => {
    expect(await readPlate(client("TNl1 AB l234"), image)).toEqual({ reg: "TN11AB1234", valid: true, aiAvailable: true })
  })
  it("still returns an unusable reading so the dealer can correct it", async () => {
    expect(await readPlate(client("XYZ"), image)).toEqual({ reg: "XYZ", valid: false, aiAvailable: true })
  })
  it("returns null when nothing is legible or the model fails", async () => {
    expect((await readPlate(client(null), image)).reg).toBeNull()
    expect((await readPlate({ json: vi.fn(async () => null) } as never, image)).reg).toBeNull()
  })
  it("degrades to manual entry with no vision client", async () => {
    expect(await readPlate(null, image)).toEqual({ reg: null, valid: false, aiAvailable: false })
  })
})

describe("vision client endpoints", () => {
  const urlAndHeaders = async (key: string) => {
    const f = fakeFetch(() => reply('{"plate":"X"}'))
    await createGeminiVision(key, "m", f).json(req)
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    return { url: String(url), headers: init.headers }
  }
  it("sends AI Studio keys in a header", async () => {
    const { url, headers } = await urlAndHeaders("plain-key")
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/m:generateContent")
    expect(headers["x-goog-api-key"]).toBe("plain-key")
  })
  it("sends Vertex AI keys (AQ.…) to Vertex with the key in the query string", async () => {
    const { url, headers } = await urlAndHeaders("AQ.abc")
    expect(url).toBe("https://aiplatform.googleapis.com/v1/publishers/google/models/m:generateContent?key=AQ.abc")
    expect(headers["x-goog-api-key"]).toBeUndefined()
  })
})
