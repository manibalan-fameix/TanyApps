import { useCallback, useEffect, useRef, useState } from "react"

// Live listening with the browser's own speech recognition (Chrome, Edge, Safari): free, no API key.
// It has the same surface the ElevenLabs block expects from its Scribe hook: status, connect, disconnect, clearTranscripts.

type SpeechStatus = "disconnected" | "connecting" | "connected" | "transcribing" | "error"

// Not in the DOM typings yet.
interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onstart: (() => void) | null
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition

const ctor = (): RecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const speechSupported = () => typeof window !== "undefined" && ctor() !== null

/** The language list uses short ISO codes; recognition wants regional tags. Empty means "the browser's language". */
function locale(code?: string): string {
  if (!code) return navigator.language || "en-IN"
  const regional: Record<string, string> = { en: "en-IN", ta: "ta-IN", hi: "hi-IN", te: "te-IN", ml: "ml-IN", kn: "kn-IN", mr: "mr-IN", bn: "bn-IN", gu: "gu-IN", pa: "pa-IN", ur: "ur-IN" }
  return regional[code] ?? code
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Allow the microphone to talk to Jarvis.",
  "service-not-allowed": "Allow the microphone to talk to Jarvis.",
  "audio-capture": "No microphone was found.",
  network: "Listening needs an internet connection.",
  "language-not-supported": "This browser cannot listen in that language.",
}

export interface SpeechOptions {
  onPartialTranscript?: (data: { text: string }) => void
  onCommittedTranscript?: (data: { text: string }) => void
  onError?: (error: Error) => void
}

export function useSpeech(options: SpeechOptions) {
  const [status, setStatus] = useState<SpeechStatus>("disconnected")
  const opts = useRef(options)
  useEffect(() => { opts.current = options })
  const rec = useRef<Recognition | null>(null)
  const wanted = useRef(false)
  const lang = useRef("")
  const restarts = useRef<number[]>([])

  const stop = useCallback(() => {
    wanted.current = false
    const r = rec.current
    rec.current = null
    if (r) { r.onend = null; r.onresult = null; r.onerror = null; try { r.abort() } catch { /* already stopped */ } }
    setStatus("disconnected")
  }, [])

  const begin = useCallback((onStarted?: () => void, onFailed?: (e: Error) => void) => {
    const C = ctor()
    if (!C) { onFailed?.(new Error("This browser cannot listen. Use Chrome, Edge or Safari.")); return }
    const r = new C()
    r.lang = lang.current
    r.continuous = true
    r.interimResults = true
    r.onstart = () => { setStatus("connected"); onStarted?.() }
    r.onresult = (e) => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const text = res[0].transcript.trim()
        if (res.isFinal) { if (text) opts.current.onCommittedTranscript?.({ text }) } else interim += ` ${text}`
      }
      if (interim.trim()) { setStatus("transcribing"); opts.current.onPartialTranscript?.({ text: interim.trim() }) }
    }
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return
      wanted.current = false
      setStatus("error")
      const err = new Error(ERRORS[e.error] ?? "Listening failed. Try again.")
      onFailed?.(err)
      opts.current.onError?.(err)
    }
    // Browsers end a session after a few quiet seconds. Start again while the user is still "on", but not in a tight loop.
    r.onend = () => {
      if (!wanted.current || rec.current !== r) return
      const now = Date.now()
      restarts.current = restarts.current.filter((t) => now - t < 10_000)
      if (restarts.current.length >= 8) { wanted.current = false; setStatus("error"); opts.current.onError?.(new Error("Listening stopped. Tap Ask Jarvis to start again.")); return }
      restarts.current.push(now)
      begin()
    }
    rec.current = r
    try { r.start() } catch (e) { onFailed?.(e instanceof Error ? e : new Error("Could not start listening.")) }
  }, [])

  const connect = useCallback((o: { languageCode?: string } = {}) => {
    stop()
    return new Promise<void>((resolve, reject) => {
      wanted.current = true
      restarts.current = []
      lang.current = locale(o.languageCode)
      setStatus("connecting")
      begin(resolve, (e) => { wanted.current = false; setStatus("error"); reject(e) })
    })
  }, [begin, stop])

  useEffect(() => stop, [stop])

  return { status, connect, disconnect: stop, clearTranscripts: () => {} }
}
