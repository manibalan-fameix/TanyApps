import { newLevel, normalise } from "./level"
// Talks to the Jarvis Worker: the passphrase gate, /api/ask and the Gemini voice.
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k) } catch { /* private mode */ } },
}

export const VOICES = ["Charon", "Algieba", "Gacrux", "Schedar", "Iapetus", "Rasalgethi", "Sulafat", "Achird", "Zephyr", "Puck", "Kore", "Aoede", "Leda", "Fenrir", "Orus", "device"]
export const getVoice = () => (VOICES.includes(store.get("voice") ?? "") ? (store.get("voice") as string) : "Charon")
export const setVoice = (v: string) => store.set("voice", v)

export type Persona = "subtle" | "classic" | "full"
export const PERSONAS: { value: Persona; label: string }[] = [
  { value: "subtle", label: "Subtle" },
  { value: "classic", label: "Classic butler" },
  { value: "full", label: "Full Jarvis" },
]
export const getPersona = (): Persona => (["subtle", "classic", "full"].includes(store.get("persona") ?? "") ? (store.get("persona") as Persona) : "classic")
export const setPersona = (p: Persona) => store.set("persona", p)
/** How Jarvis addresses you. Letters, numbers and a few marks only (the server checks again). */
export const cleanCallMe = (v: string) => v.replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, 24) || "sir"
export const getCallMe = () => cleanCallMe(store.get("callme") ?? "sir")
export const setCallMe = (v: string) => store.set("callme", cleanCallMe(v))

/** A task Jarvis has drafted from what was said. The server has already checked it. */
export interface Draft {
  title: string
  summary: string
  steps: string[]
  assignee: string | null
  priority: "Urgent" | "High" | "Normal" | "Low"
  points: number
  project: string
  epic: string
  sprint: string
  due: string | null
}

/** A Slack message Jarvis has drafted, waiting for a yes. `to` is a teammate or "channel". */
export interface SlackMsg { to: string; text: string }

export const getCreate = () => store.get("create") === "on"
export const setCreate = (on: boolean) => store.set("create", on ? "on" : "off")

export type Listening = "wake" | "always" | "push"
export const LISTENING: { value: Listening; label: string }[] = [
  { value: "wake", label: "Say “Jarvis” (recommended)" },
  { value: "push", label: "Push to talk" },
  { value: "always", label: "Always listening" },
]
export const getListening = (): Listening => (["wake", "always", "push"].includes(store.get("listening") ?? "") ? (store.get("listening") as Listening) : "wake")
export const setListening = (v: Listening) => store.set("listening", v)

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
export async function askStream(text: string, lang: string, onDelta: (piece: string) => void, signal?: AbortSignal, onShow?: (show: unknown) => void, who: { persona: Persona; callMe: string } = { persona: getPersona(), callMe: getCallMe() }): Promise<string> {
  const pass = passphrase()
  if (!pass) throw new Error("A passphrase is needed.")
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${pass}` },
    body: JSON.stringify({ text, lang, stream: true, persona: who.persona, callMe: who.callMe }),
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

/** Where the voice is in the sentence being spoken, so the page can highlight the word as it is said. */
interface Clock { start: number; end: number; final: boolean; chars: number | null; length: number; text: string }
let clock: Clock | null = null

/** 0 to 1: how far through the current sentence the voice is. Null when nothing is being spoken. */
export function speechFraction(): number | null {
  if (!clock) return null
  if (clock.chars !== null) return clock.length ? Math.min(1, clock.chars / clock.length) : 0 // the device voice reports characters
  if (!ctx) return null
  const spoken = Math.max(0, ctx.currentTime - clock.start)
  // Until the whole sentence has arrived, guess its length from the words (about 2.7 words a second), never less than what is queued.
  const guess = Math.max(clock.end - clock.start, clock.text.split(/\s+/).length / 2.7)
  const total = clock.final ? Math.max(0.1, clock.end - clock.start) : guess
  return Math.min(1, spoken / total)
}

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

let paused = false
export const isPaused = () => paused

/**
 * Freezes everything at the exact point it has reached: the audio clock stops, so the voice, the word highlight and the
 * listening all hold still (they share one clock). resumeAudio() carries on from the same place.
 */
export function pauseAudio() {
  paused = true
  try { void ctx?.suspend() } catch { /* nothing playing */ }
  if ("speechSynthesis" in window) speechSynthesis.pause()
}

export function resumeAudio() {
  paused = false
  try { void ctx?.resume() } catch { /* nothing to resume */ }
  if ("speechSynthesis" in window) speechSynthesis.resume()
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
  clock = { start: 0, end: 0, final: false, chars: 0, length: text.length, text }
  u.onboundary = (e) => { if (clock && clock.chars !== null) clock.chars = e.charIndex }
  u.onend = finish
  u.onerror = finish
  speechSynthesis.speak(u)
}

// Voice requests started ahead of time (the greeting), used once when the same text is asked for.
const prefetched = new Map<string, Promise<Response | Error>>()
const prefetchKey = (text: string, voice: string, lang: string, mood = "") => `${voice}|${lang}|${getPersona()}|${mood}|${text}`

/** Starts a voice request now so it is ready the moment it is needed. */
export function prefetchVoice(text: string, voice: string, lang: string, mood = "") {
  if (voice === "device" || !store.get("pass")) return
  const key = prefetchKey(text, voice, lang, mood)
  if (!prefetched.has(key)) prefetched.set(key, requestVoice(text, voice, lang, true, mood))
}

/**
 * The welcome, in two short pieces so the first one starts quickly. It says who Jarvis is for (Tany) and uses the form of address.
 * With the briefing on, only the first piece is spoken and the briefing carries on from it.
 */
export function greetingParts(lang: string, persona: Persona = getPersona(), callMe: string = getCallMe(), now = new Date()): [string, string] {
  if (lang === "ta") return ["வணக்கம் ஐயா, நான் ஜார்விஸ், உங்கள் Tany உதவியாளர்.", "எப்படி உதவலாம்?"]
  const h = now.getHours()
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"
  if (persona === "subtle") return [`Good ${part}, ${callMe}. I'm Jarvis, your Tany assistant.`, "How can I help?"]
  if (persona === "full") return [`Good ${part}, ${callMe}. All Tany systems are standing by.`, "How may I be of service?"]
  return [`Good ${part}, ${callMe}. Jarvis at your service, for everything Tany.`, "How may I help?"]
}

/** Starts the greeting's voice early (and again after each use). Needs the passphrase to have been entered once. */
export function prefetchGreeting(voice: string, lang: string, persona: Persona = getPersona(), callMe: string = getCallMe()) {
  for (const part of greetingParts(lang, persona, callMe)) prefetchVoice(part, voice, lang, "welcome")
}

/** Starts the voice request right away; the body keeps downloading while an earlier piece is still playing. */
function requestVoice(text: string, voice: string, lang: string, fresh = false, mood = ""): Promise<Response | Error> {
  if (!fresh) {
    const key = prefetchKey(text, voice, lang, mood)
    const early = prefetched.get(key)
    if (early) { prefetched.delete(key); return early }
  }
  return fetch("/api/speak", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${passphrase() ?? ""}` },
    body: JSON.stringify({ text, lang, voice, persona: getPersona(), mood }),
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
  if (!paused) await ac.resume()
  const reader = res.body!.getReader()
  const state = { sources: [] as AudioBufferSourceNode[], reader }
  playing = state
  let carry = new Uint8Array(0)
  const level = newLevel()
  let at = 0
  let last: AudioBufferSourceNode | null = null
  if (clock) { clock.chars = null; clock.start = 0; clock.end = 0; clock.final = false }
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
    normalise(samples, level) // every sentence at a similar, clear volume
    const buffer = ac.createBuffer(1, samples.length, rate)
    buffer.copyToChannel(samples, 0)
    const src = ac.createBufferSource()
    src.buffer = buffer
    src.connect(master!)
    at = Math.max(at, ac.currentTime + 0.03)
    src.start(at)
    if (clock && !clock.start) clock.start = at
    at += buffer.duration
    if (clock) clock.end = at
    state.sources.push(src)
    last = src
  }
  if (clock) clock.final = true
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

export function createSpeaker(voice: string, lang: string, note: (n: string) => void = () => {}, onPiece: (text: string, index: number) => void = () => {}, indexOffset = 0, mood = ""): Speaker {
  if (indexOffset === 0) stopAudio() // a follow-on speaker (same turn) must not cut off the one before it
  const texts: string[] = []
  const voices: Promise<Response | Error>[] = []
  // Voice requests go out only two sentences ahead of the one being played: a long answer would otherwise send a dozen at once,
  // and they would slow down the first one.
  const ensure = (upTo: number) => {
    for (let j = 0; j <= upTo && j < texts.length; j++) {
      if (!voices[j]) voices[j] = voice === "device" ? Promise.resolve(new Error("device")) : requestVoice(texts[j], voice, lang, false, mood)
    }
  }
  let buffer = "", dispatched = 0, dispatchedCount = 0, ended = false, cancelled = false, wake: (() => void) | null = null
  let usedGemini = false, failure = ""

  const dispatch = (t: string) => {
    texts.push(t)
    ensure(1) // the first two sentences are requested at once, so speech starts as early as possible
    wake?.()
  }

  const finished = (async () => {
    for (let i = 0; ; i++) {
      while (i >= texts.length && !ended && !cancelled) await new Promise<void>((r) => { wake = r })
      wake = null
      if (cancelled || i >= texts.length) break
      ensure(i + 2)
      const got = await voices[i]
      if (cancelled) break
      clock = { start: 0, end: 0, final: false, chars: null, length: texts[i].length, text: texts[i] }
      onPiece(texts[i], indexOffset + i) // the screen shows this sentence now and can light up whatever it talks about
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
    clock = null
    onPiece("", -1)
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
  onDraft?(draft: Draft): void
  onMessage?(message: SlackMsg): void
  onDraftError?(message: string): void
  onAction?(action: "confirm" | "cancel"): void
}

export interface Turn { q: string; a: string; interrupted?: boolean }

/** Sends one recorded question. Gemini hears it and answers in the same request; the reply streams back as events. */
export async function hearStream(wav: Blob, lang: string, history: Turn[], on: HearEvents, signal?: AbortSignal, who: { persona: Persona; callMe: string } = { persona: getPersona(), callMe: getCallMe() }, gate: { wake: boolean; awake: boolean } = { wake: false, awake: true }, create: { enabled: boolean; draft: Draft | null; message?: SlackMsg | null } = { enabled: false, draft: null }): Promise<void> {
  const pass = passphrase()
  if (!pass) throw new Error("A passphrase is needed.")
  const res = await fetch("/api/hear", {
    method: "POST",
    headers: { "content-type": "audio/wav", authorization: `Bearer ${pass}`, "x-lang": lang, "x-persona": who.persona, "x-create": create.enabled ? "1" : "0", "x-draft": encodeURIComponent(create.draft ? JSON.stringify(create.draft) : ""), "x-message": encodeURIComponent(create.message ? JSON.stringify(create.message) : ""), "x-wake": gate.wake ? "1" : "0", "x-awake": gate.awake ? "1" : "0", "x-callme": encodeURIComponent(who.callMe), "x-history": encodeURIComponent(JSON.stringify(history.slice(-3))) },
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
      const msg = JSON.parse(line.slice(5)) as { heard?: string; delta?: string; nospeech?: boolean; error?: string; show?: unknown; draft?: Draft; message?: SlackMsg; draftError?: string; action?: { type: "confirm" | "cancel" } }
      if (msg.error) throw new Error(msg.error)
      if (msg.draft) on.onDraft?.(msg.draft)
      else if (msg.message) on.onMessage?.(msg.message)
      else if (msg.draftError) on.onDraftError?.(msg.draftError)
      else if (msg.action) on.onAction?.(msg.action.type)
      else if (msg.show) on.onShow?.(msg.show)
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

export interface BriefTask { n: number; title: string; due: string | null; daysToDue: number | null; priority: string; blocked: boolean; owners: string[] }
export interface PersonFacts { name: string; openInSprint: number; doneInSprint: number; pointsOpen: number; overdue: number; blocked: number; laterOpen: number; next: BriefTask[]; wins: BriefTask[] }

/** The numbers behind a project briefing, worked out on the server so the screen and the spoken status always agree. */
export interface Facts {
  today: string
  sprint: { name: string; dayOf: number; ofDays: number; daysLeft: number; between: boolean }
  progress: { doneTasks: number; totalTasks: number; donePoints: number; totalPoints: number; expectedPct: number; actualPct: number }
  health: "on_track" | "at_risk" | "off_track"
  counts: { overdue: number; blocked: number; urgentOpen: number; dueSoon: number; unassigned: number }
  attention: { overdue: BriefTask[]; blocked: BriefTask[]; unassigned: BriefTask[] }
  upcoming: BriefTask[]
  wins: BriefTask[]
  people: PersonFacts[]
}

export interface BoardData { canCreate?: boolean; canSlack?: boolean; items: CardItem[]; sprint: { name: string; end: string; daysLeft: number }; team: string[]; facts?: Facts }

/** Every task as a card, with the current sprint and the team list. */
export async function loadCards(): Promise<BoardData> {
  const pass = passphrase()
  if (!pass) throw new Error("A passphrase is needed.")
  const res = await fetch("/api/board", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${pass}` }, body: "{}" })
  if (res.status === 401) { store.del("pass"); throw new Error("Wrong passphrase. Try again.") }
  if (!res.ok) throw new Error("Could not load the tasks.")
  return (await res.json()) as BoardData
}

export interface Created { ok: true; number: number; url: string; assigned: boolean; onBoard: boolean; card: CardItem; line: string }

/** Makes the task. Only called after the user has confirmed the draft (button or voice). */
export async function createTaskApi(draft: Draft): Promise<Created> {
  const pass = passphrase()
  if (!pass) throw new Error("A passphrase is needed.")
  const res = await fetch("/api/task/create", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${pass}` }, body: JSON.stringify({ draft, by: getCallMe() }) })
  if (res.status === 401) { store.del("pass"); throw new Error("Wrong passphrase. Try again.") }
  const data = (await res.json().catch(() => ({}))) as Created & { error?: string }
  if (!res.ok) throw new Error(data.error || "The task could not be created.")
  return data
}

/** Sends the Slack message. Only called after the user has confirmed it (button or voice). */
export async function sendSlackApi(message: SlackMsg): Promise<{ ok: true; to: string; line: string }> {
  const pass = passphrase()
  if (!pass) throw new Error("A passphrase is needed.")
  const res = await fetch("/api/slack/send", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${pass}` }, body: JSON.stringify({ message, by: getCallMe() }) })
  if (res.status === 401) { store.del("pass"); throw new Error("Wrong passphrase. Try again.") }
  const data = (await res.json().catch(() => ({}))) as { ok: true; to: string; line: string; error?: string }
  if (!res.ok) throw new Error(data.error || "The message could not be sent.")
  return data
}
