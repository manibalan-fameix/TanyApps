"use client"

import { useCallback, useEffect, useRef } from "react"

// The Web Speech API is not in TypeScript's DOM lib yet.
type Alt = { transcript: string }
type Result = { isFinal: boolean; 0: Alt }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: { resultIndex: number; results: ArrayLike<Result> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionCtor = new () => Recognition

const getCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const isSpeechRecognitionSupported = () => getCtor() !== null

type Options = {
  /** BCP-47 tag. Indian English by default. */
  lang?: string
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onError: (message: string) => void
}

const MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser and try again.",
  "service-not-allowed": "Microphone access is blocked. Allow it in your browser and try again.",
  "audio-capture": "No microphone found.",
  network: "Speech recognition needs an internet connection.",
}

/** Live speech to text using the browser's built-in recognition (Google's in Chrome). No API key. */
export function useSpeechRecognition({ lang = "en-IN", onPartial, onFinal, onError }: Options) {
  const recRef = useRef<Recognition | null>(null)
  const wantedRef = useRef(false)
  const cbRef = useRef({ onPartial, onFinal, onError })
  useEffect(() => {
    cbRef.current = { onPartial, onFinal, onError }
  })

  const stop = useCallback(() => {
    wantedRef.current = false
    const rec = recRef.current
    recRef.current = null
    if (!rec) return
    rec.onresult = rec.onerror = rec.onend = null
    try {
      rec.abort()
    } catch {
      // Already stopped.
    }
  }, [])

  const start = useCallback((): boolean => {
    const Ctor = getCtor()
    if (!Ctor) {
      cbRef.current.onError("Speech recognition is not supported in this browser. Use Chrome or Safari.")
      return false
    }
    stop()
    const rec = new Ctor()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    // Safari replays phrases it already finalised: on start, and again when it restarts itself. Each final
    // result is handled once per session; a final that lands within a moment of starting is a replay (a real
    // phrase needs longer than that to be spoken and finalised); and a restart never repeats the last phrase.
    let handled = new Set<number>()
    let startedAt = Date.now()
    let restarted = false
    let lastText = ""
    let lastAt = 0
    rec.onresult = (e) => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) {
          const text = r[0].transcript.trim()
          if (handled.has(i)) continue
          handled.add(i)
          const now = Date.now()
          const replay = restarted ? text === lastText && now - lastAt < 5000 : now - startedAt < 1500
          if (text && !replay) {
            lastText = text
            lastAt = now
            cbRef.current.onFinal(text)
          }
        } else interim += r[0].transcript
      }
      cbRef.current.onPartial(interim.trim())
    }
    rec.onerror = (e) => {
      // "no-speech" and "aborted" are normal pauses, not failures.
      if (e.error === "no-speech" || e.error === "aborted") return
      wantedRef.current = false
      cbRef.current.onError(MESSAGES[e.error] ?? "Speech recognition failed. Please try again.")
    }
    // Browsers end a session after a pause; keep listening until the user stops.
    rec.onend = () => {
      if (!wantedRef.current) return
      handled = new Set()
      startedAt = Date.now()
      restarted = true
      try {
        rec.start()
      } catch {
        wantedRef.current = false
      }
    }
    recRef.current = rec
    wantedRef.current = true
    try {
      rec.start()
      return true
    } catch {
      wantedRef.current = false
      cbRef.current.onError("Speech recognition failed. Please try again.")
      return false
    }
  }, [lang, stop])

  useEffect(() => stop, [stop])

  return { start, stop }
}
