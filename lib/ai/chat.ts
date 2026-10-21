import { streamText, type GeminiContent } from "./gemini.ts"
import { z } from "zod"

import { formatInr } from "../share/caption"

export type ChatRole = "user" | "assistant"
export type ChatMessage = { role: ChatRole; content: string }

const MAX_HISTORY_MESSAGES = 16
const MAX_MESSAGE_LENGTH = 1000

const rawMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
})

/**
 * Validates and trims client-supplied history to what we're willing to send the model:
 * the last N well-formed turns, ending on a user message (never trust the client's shape as-is).
 * Malformed entries are dropped individually rather than voiding the whole history.
 */
export function sanitizeHistory(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return []
  const valid = input
    .map((item) => rawMessageSchema.safeParse(item))
    .filter((r): r is { success: true; data: ChatMessage } => r.success)
    .map((r) => r.data)
  const trimmed = valid.slice(-MAX_HISTORY_MESSAGES)
  while (trimmed.length > 0 && trimmed[trimmed.length - 1].role !== "user") trimmed.pop()
  return trimmed
}

export type CarChatContext = {
  title: string
  price: number | null
  year: number | null
  kmDriven: number | null
  fuel: string | null
  transmission: string | null
  ownerCount: number | null
  colour: string | null
  insuranceValidTill: string | null
  overview: Record<string, string>
  specs: Record<string, string>
  features: string[]
  reasonsToBuy: string[]
  inspectionScore: number | null
  inspectionSummary: string | null
  warrantyAvailable: boolean
  serviceHistory: string | null
  accidentHistory: string | null
  floodAffected: boolean
  conditionNotes: string[]
  protectionPlans: string[]
  pricing: {
    emiPerMonth: number | null
    downPayment: number | null
    loanDurationMonths: number | null
    interestRate: number | null
    bookingAmount: number | null
  }
}

export type InventoryCarSummary = {
  title: string
  price: number | null
  fuel: string | null
  transmission: string | null
  kmDriven: number | null
  ownerCount: number | null
}

const GUARDRAILS = `
Answer only from the facts given below — never invent a price, spec, feature, or history detail that isn't
listed. If something isn't covered, say you don't have that detail and suggest contacting the dealer.
Never state or guess a registration number, VIN, or the seller's personal details.
Keep replies short and conversational: 1-4 sentences, or a short bullet list for multi-part answers — this is
a chat bubble, not a report. Prices are in Indian Rupees (₹). Treat EMI and finance figures as estimates and
say so when quoting them. Don't discuss unrelated topics, other dealers, or anything outside buying this
dealer's cars. Never mention which AI model or company powers you; you are the dealer's chat assistant.
`.trim()

function fmtPrice(n: number | null): string {
  return n != null ? `₹${formatInr(n)}` : "not listed"
}

function contactLine(dealerName: string, phone: string | null): string {
  return phone
    ? `For anything you can't answer from the facts here, tell the buyer to call ${dealerName} at ${phone}.`
    : `For anything you can't answer from the facts here, tell the buyer to contact ${dealerName} through the page.`
}

export function buildCarSystemPrompt(dealerName: string, phone: string | null, car: CarChatContext): string {
  const lines: string[] = [`You are the chat assistant on ${dealerName}'s listing page for this car: ${car.title}.`]

  lines.push("", "Facts about this car:")
  lines.push(`- Asking price: ${fmtPrice(car.price)}`)
  if (car.year != null) lines.push(`- Year: ${car.year}`)
  if (car.kmDriven != null) lines.push(`- Kilometres driven: ${formatInr(car.kmDriven)} km`)
  if (car.fuel) lines.push(`- Fuel: ${car.fuel}`)
  if (car.transmission) lines.push(`- Transmission: ${car.transmission}`)
  if (car.ownerCount != null) lines.push(`- Owners: ${car.ownerCount}`)
  if (car.colour) lines.push(`- Colour: ${car.colour}`)
  if (car.insuranceValidTill) lines.push(`- Insurance valid till: ${car.insuranceValidTill}`)
  for (const [label, value] of Object.entries(car.overview)) lines.push(`- ${label}: ${value}`)
  for (const [label, value] of Object.entries(car.specs)) lines.push(`- ${label}: ${value}`)
  if (car.features.length) lines.push(`- Features: ${car.features.join(", ")}`)
  if (car.reasonsToBuy.length) lines.push(`- Why buy this car: ${car.reasonsToBuy.join(", ")}`)
  if (car.inspectionScore != null) lines.push(`- Inspection score: ${car.inspectionScore} points`)
  if (car.inspectionSummary) lines.push(`- Inspection notes: ${car.inspectionSummary}`)
  lines.push(`- Warranty available: ${car.warrantyAvailable ? "yes" : "no"}`)
  if (car.serviceHistory) lines.push(`- Service history: ${car.serviceHistory}`)
  lines.push(`- Accident history: ${car.accidentHistory ?? "not disclosed"}`)
  lines.push(`- Flood affected: ${car.floodAffected ? "yes" : "no"}`)
  if (car.conditionNotes.length) lines.push(`- Condition notes: ${car.conditionNotes.join("; ")}`)
  if (car.protectionPlans.length) lines.push(`- Protection plans offered: ${car.protectionPlans.join(", ")}`)
  const { emiPerMonth, downPayment, loanDurationMonths, interestRate, bookingAmount } = car.pricing
  if (emiPerMonth != null) lines.push(`- Estimated EMI: ${fmtPrice(Math.round(emiPerMonth))}/month`)
  if (downPayment != null) lines.push(`- Suggested down payment: ${fmtPrice(downPayment)}`)
  if (loanDurationMonths != null) lines.push(`- Loan duration used for the estimate: ${loanDurationMonths} months`)
  if (interestRate != null) lines.push(`- Interest rate used for the estimate: ${interestRate}%`)
  if (bookingAmount != null) lines.push(`- Booking amount: ${fmtPrice(bookingAmount)}`)

  lines.push("", GUARDRAILS, "", contactLine(dealerName, phone))
  return lines.join("\n")
}

export function buildGeneralSystemPrompt(dealerName: string, phone: string | null, inventory: InventoryCarSummary[]): string {
  const lines: string[] = [`You are the chat assistant for ${dealerName}, a used car dealership. Help buyers find a car and answer general buying questions.`]

  lines.push("", inventory.length > 0 ? "Cars currently in stock:" : "There are no cars in stock right now.")
  for (const car of inventory) {
    const facts = [
      fmtPrice(car.price),
      car.fuel,
      car.transmission,
      car.kmDriven != null ? `${formatInr(car.kmDriven)} km` : null,
      car.ownerCount != null ? `${car.ownerCount} owner(s)` : null,
    ].filter(Boolean)
    lines.push(`- ${car.title} — ${facts.join(", ")}`)
  }

  lines.push(
    "",
    "Only recommend cars from the list above — never describe a car that isn't listed. Point buyers to the",
    "matching car's page (they can find it by browsing or searching the site) instead of making up a link.",
  )
  lines.push("", GUARDRAILS, "", contactLine(dealerName, phone))
  return lines.join("\n")
}

/** Default model. Override with CHAT_MODEL. Falls back to the vision model config: one Gemini key per project. */
export const DEFAULT_CHAT_MODEL = "gemini-3.6-flash"

export function getChatModel(env: Record<string, string | undefined> = process.env): string {
  return env.CHAT_MODEL || env.VISION_MODEL || DEFAULT_CHAT_MODEL
}

export interface ChatClient {
  stream(req: { model: string; system: string; messages: { role: "user" | "assistant"; content: string }[]; maxTokens: number }): AsyncGenerator<string>
}

type ChatRequest = Parameters<ChatClient["stream"]>[0]

/**
 * Calls the Cloud Run /generate service. The service owns Vertex AI authentication, so this app
 * never needs a Google service-account key or Vertex API key. The response may be plain text or
 * Gemini-style SSE (`data: {"text":"..."}` / `data: {"candidates":[...]}`).
 */
export function createCloudRunChatClient(
  endpoint: string,
  bearerToken?: string,
  fetchFn: typeof fetch = fetch,
): ChatClient {
  return {
    async *stream(req: ChatRequest): AsyncGenerator<string> {
      const prompt = [
        req.system,
        "",
        "Conversation:",
        ...req.messages.map((message) => `${message.role === "assistant" ? "Assistant" : "Buyer"}: ${message.content}`),
        "Assistant:",
      ].join("\n")

      const headers: Record<string, string> = { "content-type": "application/json" }
      if (bearerToken) headers.authorization = `Bearer ${bearerToken}`

      const response = await fetchFn(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt,
          system: req.system,
          messages: req.messages,
          model: req.model,
          maxOutputTokens: req.maxTokens,
        }),
      })
      if (!response.ok || !response.body) throw new Error(`Cloud Run AI request failed (${response.status})`)

      const contentType = response.headers.get("content-type") ?? ""
      if (!contentType.includes("text/event-stream")) {
        const raw = await response.text()
        try {
          const payload = JSON.parse(raw) as { text?: string; response?: string; output?: string }
          yield payload.response ?? payload.text ?? payload.output ?? raw
        } catch {
          yield raw
        }
        return
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += value
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          const raw = contentType.includes("text/event-stream") ? line.replace(/^data:\s*/, "").trim() : line
          if (!raw || raw === "[DONE]") continue
          try {
            const payload = JSON.parse(raw) as { text?: string; response?: string; candidates?: { content?: { parts?: { text?: string }[] } }[] }
            const text = payload.text ?? payload.response ?? payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? ""
            if (text) yield text
          } catch {
            // Some simple Cloud Run services stream raw text after the `data:` prefix.
            yield raw
          }
        }
      }
      if (buffer.trim()) yield buffer.trim()
    },
  }
}

/** Cloud Run takes precedence when configured; direct Gemini remains a local/dev fallback. */
export function getChatClient(env: Record<string, string | undefined> = process.env): ChatClient | null {
  const cloudRunUrl = env.CLOUD_RUN_GENERATE_URL?.trim()
  if (cloudRunUrl) return createCloudRunChatClient(cloudRunUrl, env.CLOUD_RUN_AUTH_TOKEN)

  const apiKey = env.VISION_API_KEY
  if (!apiKey) return null
  return {
    stream: (req) =>
      streamText(fetch, apiKey, req.model, {
        system: req.system,
        maxOutputTokens: req.maxTokens,
        contents: req.messages.map((m): GeminiContent => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      }),
  }
}

/** Server-only check so buyer pages can skip rendering the chat widget entirely when unconfigured. */
export function isChatEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.CLOUD_RUN_GENERATE_URL?.trim() || env.VISION_API_KEY)
}
