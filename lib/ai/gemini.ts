/** Minimal Gemini REST client (fetch only, so it runs on Node and Cloudflare Workers alike). */
const STUDIO_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
const VERTEX_BASE = "https://aiplatform.googleapis.com/v1/publishers/google/models"

/**
 * Where a request goes. Google AI Studio keys travel in a header. Vertex AI keys (they start with "AQ.")
 * are rejected by AI Studio and must call Vertex with the key in the query string.
 */
function target(apiKey: string, model: string, method: "generateContent" | "streamGenerateContent"): { url: string; headers: Record<string, string> } {
  const path = `${encodeURIComponent(model)}:${method}`
  const sse = method === "streamGenerateContent" ? "alt=sse" : ""
  if (apiKey.startsWith("AQ.")) {
    const query = [sse, `key=${encodeURIComponent(apiKey)}`].filter(Boolean).join("&")
    return { url: `${VERTEX_BASE}/${path}?${query}`, headers: { "content-type": "application/json" } }
  }
  return {
    url: `${STUDIO_BASE}/${path}${sse ? `?${sse}` : ""}`,
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
  }
}

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } }
export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] }

export type GeminiRequest = {
  system: string
  contents: GeminiContent[]
  maxOutputTokens: number
  /** JSON Schema for structured output; also switches the response to application/json. */
  jsonSchema?: Record<string, unknown>
}

export type GeminiFetch = typeof fetch

export class GeminiError extends Error {
  constructor(readonly status: number) {
    super(`Gemini request failed (status ${status})`)
  }
}

function body(req: GeminiRequest) {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.contents,
    generationConfig: {
      maxOutputTokens: req.maxOutputTokens,
      // Short extraction/chat tasks on a waiting user: skip the thinking phase.
      thinkingConfig: { thinkingBudget: 0 },
      ...(req.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: req.jsonSchema } : {}),
    },
  })
}

type Candidate = { content?: { parts?: { text?: string }[] }; finishReason?: string }
const textOf = (c: Candidate | undefined) => (c?.content?.parts ?? []).map((p) => p.text ?? "").join("")

/** Resolves to the text, or null when the model was blocked or truncated. Throws GeminiError on HTTP failure. */
export async function generate(
  fetchFn: GeminiFetch, apiKey: string, model: string, req: GeminiRequest,
): Promise<string | null> {
  const { url, headers } = target(apiKey, model, "generateContent")
  const res = await fetchFn(url, { method: "POST", headers, body: body(req) })
  if (!res.ok) throw new GeminiError(res.status)
  const candidate = ((await res.json()) as { candidates?: Candidate[] }).candidates?.[0]
  if (!candidate || (candidate.finishReason && candidate.finishReason !== "STOP")) return null
  return textOf(candidate) || null
}

/** Yields text chunks as they arrive (server-sent events). */
export async function* streamText(
  fetchFn: GeminiFetch, apiKey: string, model: string, req: GeminiRequest,
): AsyncGenerator<string> {
  const { url, headers } = target(apiKey, model, "streamGenerateContent")
  const res = await fetchFn(url, { method: "POST", headers, body: body(req) })
  if (!res.ok || !res.body) throw new GeminiError(res.status)
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data:")) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      const text = textOf((JSON.parse(payload) as { candidates?: Candidate[] }).candidates?.[0])
      if (text) yield text
    }
  }
}
