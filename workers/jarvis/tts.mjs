// Natural speech with Gemini text-to-speech, streamed: audio starts arriving after about a second instead of after the
// whole sentence has been generated. The stream is raw 16-bit mono PCM (24 kHz) that the page plays as it arrives.
import { geminiTarget } from "../../scripts/jarvis/lib.mjs"

export const VOICES = ["Zephyr", "Puck", "Kore", "Charon", "Aoede", "Leda", "Fenrir", "Orus"]
// Measured on 2026-10-15: gemini-3.1-flash-tts-preview answered a short sentence in under 3 s, while gemini-2.5-flash-preview-tts
// needed 10 to 16 s without streaming. Names the key does not know (404) are skipped.
export const TTS_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-2.5-flash-tts", "gemini-2.5-pro-preview-tts"]
let workingModel = null // remembered per isolate once one has worked

/** AI Studio keys can list their models: pick any that does speech. Vertex keys cannot, so this returns []. */
async function discover(key) {
  if (key.startsWith("AQ.")) return []
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return []
    const { models = [] } = await res.json()
    return models.filter((m) => /tts/i.test(m.name) && (m.supportedGenerationMethods ?? []).includes("generateContent")).map((m) => m.name.replace(/^models\//, ""))
  } catch { return [] }
}

async function open(text, key, model, voice) {
  const { url, headers } = geminiTarget(key, model, "streamGenerateContent")
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `Say in a calm, warm, natural voice: ${text.slice(0, 700)}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES.includes(voice) ? voice : "Zephyr" } } },
      },
    }),
    signal: AbortSignal.timeout(40_000),
  })
  if (!res.ok) { const e = new Error(`tts ${res.status} (${model})`); e.status = res.status; throw e }
  return res
}

/** Turns Gemini's server-sent events into a stream of raw PCM bytes. */
function pcmStream(res) {
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  return new ReadableStream({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) { controller.close(); return }
        buffer += value
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        let sent = false
        for (const line of lines) {
          if (!line.startsWith("data:")) continue
          let part
          try { part = JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data) } catch { continue }
          if (!part) continue
          const bin = atob(part.inlineData.data)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          controller.enqueue(bytes)
          sent = true
        }
        if (sent) return
      }
    },
    cancel() { reader.cancel().catch(() => {}) },
  })
}

/**
 * @returns {Promise<ReadableStream<Uint8Array>>} raw PCM. Throws on failure so the page can fall back to the device voice.
 * A 404 means this key does not know that model name, so other names are tried before giving up.
 */
export async function speakStream(text, { key, model, voice = "Zephyr" }) {
  if (!key) throw new Error("no key")
  const tried = new Set()
  const queue = [workingModel, model, ...TTS_MODELS].filter(Boolean)
  let discovered = false
  let last = new Error("tts failed")
  while (queue.length) {
    const m = queue.shift()
    if (tried.has(m)) continue
    tried.add(m)
    try {
      const res = await open(text, key, m, voice)
      workingModel = m
      return pcmStream(res)
    } catch (e) {
      last = e
      if (e.status !== 404 && e.status !== 400) throw e // quota, auth or server problems will not change with another model name
      if (!queue.length && !discovered) { discovered = true; queue.push(...(await discover(key))) }
    }
  }
  throw last
}
