// Natural speech with Gemini text-to-speech. Returns a WAV file the browser can play.
import { geminiTarget } from "../../scripts/jarvis/lib.mjs"

export const VOICES = ["Zephyr", "Puck", "Kore", "Charon", "Aoede", "Leda", "Fenrir", "Orus"]
export const DEFAULT_TTS_MODEL = "gemini-2.5-flash-preview-tts"

/** Wraps raw 16-bit mono PCM in a WAV header. */
function wav(pcm, rate) {
  const head = new ArrayBuffer(44), v = new DataView(head)
  const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)) }
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); str(8, "WAVE"); str(12, "fmt ")
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, "data"); v.setUint32(40, pcm.length, true)
  const out = new Uint8Array(44 + pcm.length)
  out.set(new Uint8Array(head), 0); out.set(pcm, 44)
  return out
}

/** @returns {Promise<Uint8Array>} a WAV file. Throws on any failure so the page can fall back to the device voice. */
export async function speak(text, { key, model = DEFAULT_TTS_MODEL, voice = "Zephyr" }) {
  if (!key) throw new Error("no key")
  const { url, headers } = geminiTarget(key, model)
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
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`tts status ${res.status}`)
  const part = (await res.json()).candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
  if (!part) throw new Error("tts returned no audio")
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? "")?.[1] ?? 24000)
  const bin = atob(part.inlineData.data)
  const pcm = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i)
  return wav(pcm, rate)
}
