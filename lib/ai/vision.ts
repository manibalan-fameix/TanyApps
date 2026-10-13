import { GeminiError, generate, type GeminiFetch } from "./gemini.ts"
import { z } from "zod"

export type VisionImage = { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }

export type VisionAudio = { mediaType: "audio/wav" | "audio/mp3" | "audio/aac"; base64: string }

export type VisionRequest<T> = {
  system: string
  prompt: string
  images?: VisionImage[]
  /** A spoken track (e.g. a creator's walkaround voice-over), sent after the images. */
  audio?: VisionAudio
  /** JSON Schema the model's answer must follow (structured outputs). */
  jsonSchema: Record<string, unknown>
  /** Zod validation of the parsed answer; the model's output is never trusted as-is. */
  validate: z.ZodType<T>
  maxTokens?: number
}

/** One narrow capability: ask a vision model a question, get validated JSON or null. Never throws. */
export interface VisionClient {
  json<T>(req: VisionRequest<T>): Promise<T | null>
}

/** Default model. Override with VISION_MODEL (e.g. a cheaper, faster one for plate reading). */
export const DEFAULT_VISION_MODEL = "gemini-3.6-flash"

export function createGeminiVision(apiKey: string, model: string, fetchFn: GeminiFetch = fetch): VisionClient {
  return {
    async json<T>(req: VisionRequest<T>): Promise<T | null> {
      try {
        const text = await generate(fetchFn, apiKey, model, {
          system: req.system,
          maxOutputTokens: req.maxTokens ?? 2000,
          jsonSchema: req.jsonSchema,
          contents: [{
            role: "user",
            parts: [
              ...(req.images ?? []).map((img) => ({ inlineData: { mimeType: img.mediaType, data: img.base64 } })),
              ...(req.audio ? [{ inlineData: { mimeType: req.audio.mediaType, data: req.audio.base64 } }] : []),
              { text: req.prompt },
            ],
          }],
        })
        // A safety block or a truncated answer is treated as "no answer", not an error.
        if (!text) return null
        const parsed = req.validate.safeParse(JSON.parse(text))
        return parsed.success ? parsed.data : null
      } catch (error) {
        // Never log request content: it can contain plates and images.
        const status = error instanceof GeminiError ? error.status : "unknown"
        console.error(`vision call failed (status ${status})`)
        return null
      }
    },
  }
}

/** Null when VISION_API_KEY (a Google Gemini API key) is not set: callers fall back to manual entry / rules only. */
export function getVisionClient(env: Record<string, string | undefined> = process.env): VisionClient | null {
  if (!env.VISION_API_KEY) return null
  return createGeminiVision(env.VISION_API_KEY, env.VISION_MODEL || DEFAULT_VISION_MODEL)
}
