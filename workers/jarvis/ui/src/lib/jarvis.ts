// Talks to the Jarvis Worker: the passphrase gate, /api/ask and the Gemini voice.
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k) } catch { /* private mode */ } },
}

export const VOICES = ["Zephyr", "Puck", "Kore", "Charon", "Aoede", "Leda", "Fenrir", "Orus", "device"]
export const getVoice = () => (VOICES.includes(store.get("voice") ?? "") ? (store.get("voice") as string) : "Zephyr")
export const setVoice = (v: string) => store.set("voice", v)

/** The block's language selector uses ISO codes. Only Tamil changes the reply language. */
export const replyLanguage = (code: string | null) => (code === "ta" ? "ta" : "en")

function passphrase(): string | null {
  let pass = store.get("pass")
  if (!pass) {
    pass = window.prompt("Passphrase")
    if (pass) store.set("pass", pass)
  }
  return pass
}

export async function api<T>(path: string, body: unknown): Promise<T> {
  const pass = passphrase()
  if (!pass) throw new Error("A passphrase is needed.")
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${pass}` },
    body: JSON.stringify(body),
  })
  if (res.status === 401) {
    store.del("pass")
    throw new Error("Wrong passphrase. Try again.")
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error || "Something went wrong.")
  return data as T
}

/** Starts loading the board on the server so the first question is fast. Safe to call any time; failures are ignored. */
export function warmUp() {
  const pass = store.get("pass")
  if (!pass) return
  void fetch("/api/warm", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${pass}` }, body: "{}" }).catch(() => {})
}

/** Plain text for the screen: the model is asked for no markdown, but strip any that slips through. */
export const cleanText = (t: string) => t.replace(/\[#?(\d+)\]\([^)]*\)/g, "task $1").replace(/[*_`#>]/g, "").replace(/\s+\n/g, "\n")

/**
 * Asks Jarvis and receives the answer piece by piece (server-sent events), so speech can start before the answer is complete.
 * Falls back to one normal reply when the server does not stream (for example when no Gemini key is set).
 */
export async function askStream(text: string, lang: string, onDelta: (piece: string) => void): Promise<string> {
  const pass = passphrase()
  if (!pass) throw new Error("A passphrase is needed.")
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${pass}` },
    body: JSON.stringify({ text, lang, stream: true }),
  })
  if (res.status === 401) { store.del("pass"); throw new Error("Wrong passphrase. Try again.") }
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Something went wrong.")
  if (!(res.headers.get("content-type") ?? "").includes("event-stream")) {
    const data = (await res.json()) as { speech: string }
    onDelta(data.speech)
    return data.speech
  }
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = "", full = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data:")) continue
      const msg = JSON.parse(line.slice(5)) as { delta?: string; error?: string }
      if (msg.error) throw new Error(msg.error)
      if (msg.delta) { full += msg.delta; onDelta(msg.delta) }
    }
  }
  return full
}

// Audio: Gemini voice arrives as a stream of raw 16-bit mono PCM and is played with Web Audio while it is still downloading,
// so speech starts after the first chunk instead of after the whole sentence. iOS only lets an AudioContext start after a
// tap, so unlockAudio() is called from the button.
let ctx: AudioContext | null = null
let playing: { sources: AudioBufferSourceNode[]; reader: ReadableStreamDefaultReader<Uint8Array> | null } | null = null
let current: Speaker | null = null

function audioContext(): AudioContext {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new C()
  }
  return ctx
}

export function unlockAudio() {
  try { void audioContext().resume() } catch { /* ignore */ }
  if ("speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(" ")
    u.volume = 0
    speechSynthesis.speak(u)
  }
}

export function stopAudio() {
  current?.cancel()
  if (playing) {
    playing.reader?.cancel().catch(() => {})
    for (const s of playing.sources) { try { s.stop() } catch { /* already stopped */ } }
    playing = null
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel()
}

function deviceSpeak(text: string, lang: string, done: () => void) {
  if (!("speechSynthesis" in window) || !text) return done()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang === "ta" ? "ta-IN" : "en-IN"
  const voices = speechSynthesis.getVoices()
  const v = voices.find((x) => x.lang.replace("_", "-").toLowerCase().startsWith(u.lang.toLowerCase())) ?? voices.find((x) => x.lang.toLowerCase().startsWith(lang))
  if (v) u.voice = v
  u.onend = done
  u.onerror = done
  speechSynthesis.speak(u)
}

/** Starts the voice request right away; the body keeps downloading while an earlier piece is still playing. */
function requestVoice(text: string, voice: string, lang: string): Promise<Response | Error> {
  return fetch("/api/speak", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${store.get("pass") ?? ""}` },
    body: JSON.stringify({ text, lang, voice }),
  })
    .then(async (res) => {
      if (res.ok) return res
      const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
      return new Error(body.detail || body.error || `status ${res.status}`)
    })
    .catch((e: Error) => e)
}

/** Plays a PCM response as it downloads. Resolves when the last sample has been played. */
async function playPcm(res: Response, rate: number): Promise<void> {
  const ac = audioContext()
  await ac.resume()
  const reader = res.body!.getReader()
  const state = { sources: [] as AudioBufferSourceNode[], reader }
  playing = state
  let carry = new Uint8Array(0)
  let at = 0
  let last: AudioBufferSourceNode | null = null
  for (;;) {
    const { done, value } = await reader.read()
    if (playing !== state) return // stopped
    if (done) break
    const bytes = new Uint8Array(carry.length + value.length)
    bytes.set(carry); bytes.set(value, carry.length)
    const usable = bytes.length - (bytes.length % 2)
    carry = bytes.slice(usable)
    if (!usable) continue
    const pcm = new Int16Array(bytes.buffer.slice(0, usable))
    const samples = new Float32Array(pcm.length)
    for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768
    const buffer = ac.createBuffer(1, samples.length, rate)
    buffer.copyToChannel(samples, 0)
    const src = ac.createBufferSource()
    src.buffer = buffer
    src.connect(ac.destination)
    at = Math.max(at, ac.currentTime + 0.03)
    src.start(at)
    at += buffer.duration
    state.sources.push(src)
    last = src
  }
  if (!last) throw new Error("the voice sent no audio")
  await new Promise<void>((resolve) => { last!.onended = () => resolve() })
  if (playing === state) playing = null
}

export interface Speaker {
  feed(piece: string): void
  end(): void
  cancel(): void
  /** Resolves when everything has been spoken (or cancelled). */
  finished: Promise<void>
}

/**
 * Speaks an answer while it is still being written. The first sentence is voiced as soon as it is complete, and the rest
 * as one more piece, so there are at most two voice requests per answer. A piece that fails falls back to the device voice.
 */
export function createSpeaker(voice: string, lang: string, note: (n: string) => void = () => {}): Speaker {
  stopAudio()
  const texts: string[] = []
  const voices: Promise<Response | Error>[] = []
  let buffer = "", dispatched = 0, ended = false, cancelled = false, wake: (() => void) | null = null
  let usedGemini = false, failure = ""

  const dispatch = (t: string) => {
    texts.push(t)
    voices.push(voice === "device" ? Promise.resolve(new Error("device")) : requestVoice(t, voice, lang))
    wake?.()
  }

  const finished = (async () => {
    for (let i = 0; ; i++) {
      while (i >= texts.length && !ended && !cancelled) await new Promise<void>((r) => { wake = r })
      wake = null
      if (cancelled || i >= texts.length) break
      const got = await voices[i]
      if (cancelled) break
      if (got instanceof Response) {
        try {
          await playPcm(got, Number(got.headers.get("x-pcm-rate")) || 24000)
          usedGemini = true
          continue
        } catch (e) { failure = e instanceof Error ? e.message : "playback" }
      } else if (got.message !== "device") failure = got.message
      if (cancelled) break
      await new Promise<void>((r) => deviceSpeak(texts[i], lang, r))
    }
    note(voice === "device" ? "Voice: device" : usedGemini && !failure ? `Voice: ${voice} (Gemini)` : `Gemini voice failed (${failure || "unknown"}), used the device voice`)
  })()

  const speaker: Speaker = {
    feed(piece) {
      buffer += piece
      if (dispatched === 0) {
        // The first sentence, or a long first sentence cut at a comma, so the voice can start early.
        const sentence = /^\s*([\s\S]{8,}?[.!?])(?:\s|$)/.exec(buffer)
        const clause = buffer.length > 70 ? /^\s*([\s\S]{30,}?,)\s/.exec(buffer) : null
        const m = sentence ?? clause
        if (m) { dispatch(m[1].trim()); dispatched = m[0].length }
      }
    },
    end() {
      const rest = buffer.slice(dispatched).trim()
      if (rest) dispatch(rest)
      ended = true
      wake?.()
    },
    cancel() { cancelled = true; wake?.() },
    finished,
  }
  current = speaker
  return speaker
}
