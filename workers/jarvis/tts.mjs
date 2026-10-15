// Natural speech with Gemini text-to-speech, streamed: audio starts arriving after about a second instead of after the
// whole sentence has been generated. The stream is raw 16-bit mono PCM (24 kHz) that the page plays as it arrives.
import { geminiTarget } from "../../scripts/jarvis/lib.mjs"

export const VOICES = ["Charon", "Algieba", "Gacrux", "Schedar", "Iapetus", "Rasalgethi", "Sulafat", "Achird", "Zephyr", "Puck", "Kore", "Aoede", "Leda", "Fenrir", "Orus"]

/** How the voice should deliver the words, for each personality strength. Never spoken: it travels in a separate field. */
export const STYLES = {
  subtle: "calm, warm and professional, with a light British formality",
  classic: "refined, calm and understated with dry wit, like a loyal British butler giving a status report",
  full: "impeccably formal and unhurried, with quiet confidence and bone-dry wit, like a devoted British butler reporting to his employer",
}
// Measured on 2026-10-15: gemini-3.1-flash-tts-preview answered a short sentence in under 3 s, while gemini-2.5-flash-preview-tts
// needed 10 to 16 s without streaming. Names the key does not know (404) are skipped.
export const TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"]
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

/**
 * The 3.8 models take the delivery style in its own field (a prefix in the text would be read aloud). Older models only
 * understand an instruction in the text, so the style goes there instead.
 */
function request(text, model, voice, style) {
  const part = /3\.8/.test(model)
    ? { text: text.slice(0, 700), speechMetadata: { style } }
    : { text: `Say in a ${style} voice: ${text.slice(0, 700)}` }
  return {
    contents: [{ role: "user", parts: [part] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES.includes(voice) ? voice : "Charon" } } },
    },
  }
}

async function open(text, key, model, voice, style) {
  const { url, headers } = geminiTarget(key, model, "streamGenerateContent")
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(request(text, model, voice, style)),
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
export async function speakStream(text, { key, model, voice = "Charon", persona = "classic" }) {
  const style = STYLES[persona] ?? STYLES.classic
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
      const res = await open(text, key, m, voice, style)
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
