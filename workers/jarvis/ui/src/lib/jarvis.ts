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
export async function askStream(text: string, lang: string, onDelta: (piece: string) => void, signal?: AbortSignal, onShow?: (show: unknown) => void): Promise<string> {
  const pass = passphrase()
  if (!pass) throw new Error("A passphrase is needed.")
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${pass}` },
    body: JSON.stringify({ text, lang, stream: true }),
    signal,
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
      const msg = JSON.parse(line.slice(5)) as { delta?: string; error?: string; show?: unknown }
      if (msg.error) throw new Error(msg.error)
      if (msg.show) onShow?.(msg.show)
      if (msg.delta) { full += msg.delta; onDelta(msg.delta) }
    }
  }
  return full
}

// Audio: Gemini voice arrives as a stream of raw 16-bit mono PCM and is played with Web Audio while it is still downloading,
// so speech starts after the first chunk instead of after the whole sentence. iOS only lets an AudioContext start after a
// tap, so unlockAudio() is called from the button.
let ctx: AudioContext | null = null
let master: GainNode | null = null
let playing: { sources: AudioBufferSourceNode[]; reader: ReadableStreamDefaultReader<Uint8Array> | null } | null = null
let current: Speaker | null = null

export function audioContext(): AudioContext {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new C()
    master = ctx.createGain()
    master.connect(ctx.destination)
  }
  return ctx
}

/** Turns Jarvis down while you are speaking over it, and back up if it turns out you were not. */
export function duck(on: boolean) {
  if (!ctx || !master) return
  master.gain.setTargetAtTime(on ? 0.12 : 1, ctx.currentTime, 0.04)
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
  duck(false)
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
  // Some browsers never report the end of a spoken text (no voice installed, tab in the background): do not wait forever.
  let finished = false
  const finish = () => { if (!finished) { finished = true; clearTimeout(guard); done() } }
  const guard = setTimeout(finish, 2500 + text.length * 90)
  u.onend = finish
  u.onerror = finish
  speechSynthesis.speak(u)
}

// Voice requests started ahead of time (the greeting), used once when the same text is asked for.
const prefetched = new Map<string, Promise<Response | Error>>()
const prefetchKey = (text: string, voice: string, lang: string) => `${voice}|${lang}|${text}`

/** Starts a voice request now so it is ready the moment it is needed. */
export function prefetchVoice(text: string, voice: string, lang: string) {
  if (voice === "device" || !store.get("pass")) return
  const key = prefetchKey(text, voice, lang)
  if (!prefetched.has(key)) prefetched.set(key, requestVoice(text, voice, lang, true))
}

/** Greeting in two short pieces, so the first one starts quickly. */
export function greetingParts(lang: string, now = new Date()): [string, string] {
  if (lang === "ta") return ["வணக்கம், நான் ஜார்விஸ்.", "எப்படி உதவலாம்?"]
  const h = now.getHours()
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"
  return [`Good ${part}, I'm Jarvis.`, "How can I help?"]
}

/** Starts the greeting's voice early (and again after each use). Needs the passphrase to have been entered once. */
export function prefetchGreeting(voice: string, lang: string) {
  for (const part of greetingParts(lang)) prefetchVoice(part, voice, lang)
}

/** Starts the voice request right away; the body keeps downloading while an earlier piece is still playing. */
function requestVoice(text: string, voice: string, lang: string, fresh = false): Promise<Response | Error> {
  if (!fresh) {
    const key = prefetchKey(text, voice, lang)
    const early = prefetched.get(key)
    if (early) { prefetched.delete(key); return early }
  }
  return fetch("/api/speak", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${passphrase() ?? ""}` },
    body: JSON.stringify({ text, lang, voice }),
  })
    .then(async (res) => {
      if (res.ok) return res
      if (res.status === 401) store.del("pass")
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
    src.connect(master!)
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
const MAX_PIECES = 8 // voice requests per answer

export function createSpeaker(voice: string, lang: string, note: (n: string) => void = () => {}, onPiece: (text: string) => void = () => {}): Speaker {
  stopAudio()
  const texts: string[] = []
  const voices: Promise<Response | Error>[] = []
  let buffer = "", dispatched = 0, dispatchedCount = 0, ended = false, cancelled = false, wake: (() => void) | null = null
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
      onPiece(texts[i]) // the screen can light up whatever this sentence talks about
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
    onPiece("")
    note(voice === "device" ? "Voice: device" : usedGemini && !failure ? `Voice: ${voice} (Gemini)` : `Gemini voice failed (${failure || "unknown"}), used the device voice`)
  })()

  const speaker: Speaker = {
    feed(piece) {
      buffer += piece
      // Every finished sentence is voiced as soon as it is complete (the first one early, even if it is long).
      for (let guard = 0; guard < 12 && dispatched < buffer.length; guard++) {
        const rest = buffer.slice(dispatched)
        const sentence = /^\s*([\s\S]{12,}?[.!?])(?:\s|$)/.exec(rest) ?? (dispatchedCount === 0 ? /^\s*([\s\S]{8,}?[.!?])(?:\s|$)/.exec(rest) : null)
        const clause = dispatchedCount === 0 && rest.length > 70 ? /^\s*([\s\S]{30,}?,)\s/.exec(rest) : null
        const m = sentence ?? clause
        if (!m || dispatchedCount >= MAX_PIECES - 1) break
        dispatch(m[1].trim())
        dispatched += m[0].length
        dispatchedCount++
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

export interface HearEvents {
  onHeard(text: string): void
  onDelta(piece: string): void
  onNoSpeech(): void
  onShow?(show: unknown): void
}

export interface Turn { q: string; a: string; interrupted?: boolean }

/** Sends one recorded question. Gemini hears it and answers in the same request; the reply streams back as events. */
export async function hearStream(wav: Blob, lang: string, history: Turn[], on: HearEvents, signal?: AbortSignal): Promise<void> {
  const pass = passphrase()
  if (!pass) throw new Error("A passphrase is needed.")
  const res = await fetch("/api/hear", {
    method: "POST",
    headers: { "content-type": "audio/wav", authorization: `Bearer ${pass}`, "x-lang": lang, "x-history": encodeURIComponent(JSON.stringify(history.slice(-3))) },
    body: wav,
    signal,
  })
  if (res.status === 401) { store.del("pass"); throw new Error("Wrong passphrase. Try again.") }
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Something went wrong.")
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data:")) continue
      const msg = JSON.parse(line.slice(5)) as { heard?: string; delta?: string; nospeech?: boolean; error?: string; show?: unknown }
      if (msg.error) throw new Error(msg.error)
      if (msg.show) on.onShow?.(msg.show)
      else if (msg.nospeech) on.onNoSpeech()
      else if (msg.heard !== undefined) on.onHeard(msg.heard)
      else if (msg.delta) on.onDelta(msg.delta)
    }
  }
}

export interface CardItem {
  n: number
  title: string
  full: string
  summary: string
  steps: string[]
  open: boolean
  blocked: boolean
  project: string
  team: string[]
  sprint: string
  priority: string
  points: number
  epic: string
  due: string | null
  updated: string
}

export interface BoardData { items: CardItem[]; sprint: { name: string; end: string; daysLeft: number }; team: string[] }

/** Every task as a card, with the current sprint and the team list. */
export async function loadCards(): Promise<BoardData> {
  const pass = passphrase()
  if (!pass) throw new Error("A passphrase is needed.")
  const res = await fetch("/api/board", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${pass}` }, body: "{}" })
  if (res.status === 401) { store.del("pass"); throw new Error("Wrong passphrase. Try again.") }
  if (!res.ok) throw new Error("Could not load the tasks.")
  return (await res.json()) as BoardData
}
