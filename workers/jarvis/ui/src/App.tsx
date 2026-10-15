import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Copy } from "lucide-react"

import { cn } from "@/lib/utils"
import { useDebounce } from "@/hooks/use-debounce"
import { usePrevious } from "@/hooks/use-previous"
import { useSpeech } from "@/hooks/use-speech"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ShimmeringText } from "@/components/ui/shimmering-text"

import { LanguageSelector } from "@/components/language-selector"
import { cleanText, createSpeaker, duck, greetingParts, hearStream, prefetchGreeting, stopAudio, unlockAudio, warmUp, VOICES, getVoice, setVoice, replyLanguage, type Speaker, type Turn } from "@/lib/jarvis"
import { createListener, type Listener } from "@/lib/mic"

interface RecordingState {
  error: string
  latenciesMs: number[]
}

type ConnectionState = "idle" | "connecting" | "connected" | "disconnecting" | "answering"

const TranscriptCharacter = React.memo(
  ({ char, delay }: { char: string; delay: number }) => {
    return (
      <motion.span
        initial={{ filter: `blur(3.5px)`, opacity: 0 }}
        animate={{ filter: `none`, opacity: 1 }}
        transition={{ duration: 0.5, delay }}
        style={{ willChange: delay > 0 ? "filter, opacity" : "auto" }}
      >
        {char}
      </motion.span>
    )
  }
)
TranscriptCharacter.displayName = "TranscriptCharacter"

// Memoize background effects to prevent re-renders
const BackgroundAura = React.memo(
  ({ status, isConnected }: { status: string; isConnected: boolean }) => {
    const isActive = status === "connecting" || isConnected

    return (
      <div
        className={cn(
          "pointer-events-none fixed inset-0 transition-opacity duration-300 ease-out",
          isActive ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Center bottom pool - main glow */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2"
          style={{
            width: "130%",
            height: "20vh",
            background:
              "radial-gradient(ellipse 100% 100% at 50% 100%, rgba(34, 211, 238, 0.5) 0%, rgba(168, 85, 247, 0.4) 35%, rgba(251, 146, 60, 0.5) 70%, transparent 100%)",
            filter: "blur(80px)",
          }}
        />

        {/* Pulsing layer */}
        <div
          className={cn(
            "absolute bottom-0 left-1/2 -translate-x-1/2 animate-pulse",
            isConnected ? "opacity-100" : "opacity-80"
          )}
          style={{
            width: "100%",
            height: "18vh",
            background:
              "radial-gradient(ellipse 100% 100% at 50% 100%, rgba(134, 239, 172, 0.5) 0%, rgba(192, 132, 252, 0.4) 50%, transparent 100%)",
            filter: "blur(60px)",
            animationDuration: "4s",
          }}
        />

        {/* Left corner bloom */}
        <div
          className="absolute bottom-0 left-0"
          style={{
            width: "25vw",
            height: "30vh",
            background:
              "radial-gradient(circle at 0% 100%, rgba(34, 211, 238, 0.5) 0%, rgba(134, 239, 172, 0.3) 30%, transparent 60%)",
            filter: "blur(70px)",
          }}
        />

        {/* Left rising glow - organic curve */}
        <div
          className="absolute bottom-0 -left-8"
          style={{
            width: "20vw",
            height: "45vh",
            background:
              "radial-gradient(ellipse 50% 100% at 10% 100%, rgba(34, 211, 238, 0.4) 0%, rgba(134, 239, 172, 0.25) 25%, transparent 60%)",
            filter: "blur(60px)",
            animation: "pulseGlow 5s ease-in-out infinite alternate",
          }}
        />

        {/* Right corner bloom */}
        <div
          className="absolute right-0 bottom-0"
          style={{
            width: "25vw",
            height: "30vh",
            background:
              "radial-gradient(circle at 100% 100%, rgba(251, 146, 60, 0.5) 0%, rgba(251, 146, 60, 0.3) 30%, transparent 60%)",
            filter: "blur(70px)",
          }}
        />

        {/* Right rising glow - organic curve */}
        <div
          className="absolute -right-8 bottom-0"
          style={{
            width: "20vw",
            height: "45vh",
            background:
              "radial-gradient(ellipse 50% 100% at 90% 100%, rgba(251, 146, 60, 0.4) 0%, rgba(192, 132, 252, 0.25) 25%, transparent 60%)",
            filter: "blur(60px)",
            animation: "pulseGlow 5s ease-in-out infinite alternate-reverse",
          }}
        />

        {/* Shimmer overlay */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2"
          style={{
            width: "100%",
            height: "15vh",
            background:
              "linear-gradient(90deg, rgba(34, 211, 238, 0.3) 0%, rgba(168, 85, 247, 0.3) 30%, rgba(251, 146, 60, 0.3) 60%, rgba(134, 239, 172, 0.3) 100%)",
            filter: "blur(30px)",
            animation: "shimmer 8s linear infinite",
          }}
        />
      </div>
    )
  }
)
BackgroundAura.displayName = "BackgroundAura"

// Memoize bottom controls with comparison function
const BottomControls = React.memo(
  ({
    isConnected,
    hasError,
    isMac,
    onStop,
    speaking,
    onStopVoice,
  }: {
    isConnected: boolean
    hasError: boolean
    isMac: boolean
    onStop: () => void
    speaking: boolean
    onStopVoice: () => void
  }) => {
    return (
      <AnimatePresence mode="popLayout">
        {isConnected && !hasError && (
          <motion.div
            key="bottom-controls"
            initial={{ opacity: 0, y: 10 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: 0.1 },
            }}
            exit={{
              opacity: 0,
              y: 10,
              transition: { duration: 0.1 },
            }}
            className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2"
          >
            {speaking && (
              <button
                onClick={onStopVoice}
                className="bg-background text-foreground border-foreground/15 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-lg transition-opacity hover:opacity-90"
              >
                Stop voice
              </button>
            )}
            <button
              onClick={onStop}
              className="bg-foreground text-background border-foreground/10 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-lg transition-opacity hover:opacity-90"
            >
              Stop
              <kbd className="border-background/20 bg-background/10 inline-flex h-5 items-center rounded border px-1.5 font-mono text-xs">
                {isMac ? "⌘K" : "Ctrl+K"}
              </kbd>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    )
  },
  (prev, next) => {
    if (prev.isConnected !== next.isConnected) return false
    if (prev.hasError !== next.hasError) return false
    if (prev.isMac !== next.isMac) return false
    if (prev.speaking !== next.speaking) return false
    return true
  }
)
BottomControls.displayName = "BottomControls"

export default function Jarvis() {
  const [recording, setRecording] = useState<RecordingState>({
    error: "",
    latenciesMs: [],
  })
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null)
  const [connectionState, setConnectionStateState] =
    useState<ConnectionState>("idle")
  const [localTranscript, setLocalTranscript] = useState("")

  // Jarvis: what was asked, what came back, and which step we are on.
  const [question, setQuestion] = useState("")
  const [reply, setReply] = useState("")
  const [voiceNote, setVoiceNote] = useState("")
  // listening: waiting for you. thinking: Jarvis is working out the answer. speaking: Jarvis is talking (you can still interrupt).
  const [phase, setPhaseState] = useState<"listening" | "thinking" | "speaking">("listening")
  const phaseRef = useRef<"listening" | "thinking" | "speaking">("listening")
  const setPhase = useCallback((next: "listening" | "thinking" | "speaking") => {
    phaseRef.current = next
    setPhaseState(next)
  }, [])
  const [voice, setVoiceState] = useState(getVoice())
  const questionRef = useRef("")
  const replyRef = useRef("") // what Jarvis is saying right now, to tell its own voice apart from yours
  const turnRef = useRef(0) // bumped on every new question or interruption so older answers stop
  const abortRef = useRef<AbortController | null>(null) // the request that owns the current answer
  const listenerRef = useRef<Listener | null>(null)
  const confirmedRef = useRef(0) // newest recording that turned out to be you speaking (not an echo)
  const hearCountRef = useRef(0)
  const historyRef = useRef<Turn[]>([])
  const langRef = useRef("en")
  const [userSpeaking, setUserSpeaking] = useState(false)
  const speakerRef = useRef<Speaker | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopRef = useRef<() => void>(() => {})
  // On iPhone the microphone and the speaker cannot be used together, so Jarvis only listens between its sentences there.
  const halfDuplex = useMemo(() => /iPhone|iPad|iPod/i.test(navigator.userAgent), [])

  const [isMac, setIsMac] = useState(true)
  useEffect(() => {
    setIsMac(/(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent))
  }, [])

  // Listening uses the browser's speech recognition: say so up front when it is missing (for example in Firefox).
  useEffect(() => {
    warmUp() // load the board on the server while the page is still idle
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecording((prev) => ({ ...prev, error: "This browser cannot use the microphone. Use Chrome, Edge or Safari." }))
    }
  }, [])

  // While Jarvis talks, only clearly louder speech counts as you (a leftover echo must not interrupt it).
  useEffect(() => {
    listenerRef.current?.setStrict(phase !== "listening")
  }, [phase])

  // Have the greeting's voice ready before the tap, so Jarvis answers the tap at once.
  useEffect(() => {
    if (connectionState === "idle") prefetchGreeting(voice, replyLanguage(selectedLanguage))
  }, [voice, selectedLanguage, connectionState])

  const segmentStartMsRef = useRef<number | null>(null)
  const lastTranscriptRef = useRef<string>("")
  const finalTranscriptsRef = useRef<string[]>([])

  const startSoundRef = useRef<HTMLAudioElement | null>(null)
  const endSoundRef = useRef<HTMLAudioElement | null>(null)
  const errorSoundRef = useRef<HTMLAudioElement | null>(null)

  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastOperationTimeRef = useRef(0)
  const timerIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectionStateRef = useRef<ConnectionState>("idle")

  const updateConnectionState = useCallback(
    (next: ConnectionState) => {
      connectionStateRef.current = next
      setConnectionStateState(next)
    },
    [setConnectionStateState]
  )

  const clearSessionRefs = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current)
      errorTimeoutRef.current = null
    }

    segmentStartMsRef.current = null
    lastTranscriptRef.current = ""
    finalTranscriptsRef.current = []
  }, [])

  // === Conversation ===
  const words = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean)

  /** True when what the microphone heard is just Jarvis's own voice coming back through the speaker. */
  const isEcho = useCallback((heard: string) => {
    if (phaseRef.current === "listening") return false
    const hw = words(heard)
    if (!hw.length) return true
    const said = new Set(words(replyRef.current))
    const inside = hw.filter((w) => said.has(w)).length
    return hw.length >= 3 ? inside / hw.length >= 0.6 : inside === hw.length
  }, [])

  /** Resets the "nothing said for a while" timer. A silent session ends by itself after two minutes. */
  const touch = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => stopRef.current(), 120_000)
  }, [])

  /** The user spoke over Jarvis: stop the voice and the answer that was still being written. */
  const bargeIn = useCallback(() => {
    if (phaseRef.current !== "listening" && questionRef.current) {
      historyRef.current = [...historyRef.current, { q: questionRef.current, a: replyRef.current.slice(0, 200), interrupted: true }].slice(-6)
    }
    turnRef.current++
    abortRef.current?.abort()
    speakerRef.current?.cancel()
    stopAudio()
    setPhase("listening")
  }, [setPhase])

  // The browser's own speech recognition only draws the live captions. Gemini does the real listening (see handleUtterance).
  const onPartialTranscript = useCallback((data: { text?: string }) => {
    if (connectionStateRef.current !== "connected") return
    const currentText = data.text || ""
    if (currentText === lastTranscriptRef.current) return
    if (phaseRef.current !== "listening" && (isEcho(currentText) || words(currentText).length < 2)) return // Jarvis's own voice
    touch()
    lastTranscriptRef.current = currentText
    setLocalTranscript(currentText)
  }, [isEcho, touch])

  const onFinalTranscript = useCallback(() => {
    lastTranscriptRef.current = ""
  }, [])

  const onError = useCallback((error: Error | Event) => {
    console.error("[Jarvis] Error:", error)

    // Ignore errors if we're not supposed to be connected
    if (connectionStateRef.current !== "connected") {
      console.log("[Jarvis] Ignoring error - not connected")
      return
    }

    const errorMessage =
      error instanceof Error ? error.message : "Transcription error"

    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current)
    }

    errorTimeoutRef.current = setTimeout(() => {
      if (connectionStateRef.current !== "connected") return

      setRecording((prev) => ({
        ...prev,
        error: errorMessage,
      }))
      errorSoundRef.current?.play().catch(() => {})
    }, 500)
  }, [])

  // The block listens with ElevenLabs Scribe. Jarvis listens with the browser's own speech recognition instead (no API key).
  const speechConfig = useMemo(
    () => ({ onPartialTranscript, onCommittedTranscript: onFinalTranscript, onError }),
    [onPartialTranscript, onFinalTranscript, onError]
  )

  const scribe = useSpeech(speechConfig)

  // Clear transcript when not connected
  useEffect(() => {
    if (connectionState !== "connected") {
      setLocalTranscript("")
    }
  }, [connectionState])

  /** A new turn: show the question, switch to "thinking" and return the turn number. */
  const beginTurn = useCallback((text: string) => {
    const turn = ++turnRef.current
    setQuestion(text)
    questionRef.current = text
    setReply("")
    replyRef.current = ""
    setVoiceNote("")
    setLocalTranscript("")
    lastTranscriptRef.current = ""
    setPhase("thinking")
    endSoundRef.current?.play().catch(() => {})
    return turn
  }, [setPhase])

  /**
   * One recorded question from the microphone. Gemini hears it and answers in the same request. If what it heard is just
   * Jarvis's own voice, or nothing, the recording is dropped and Jarvis carries on. Otherwise it interrupts itself and answers.
   */
  const handleUtterance = useCallback((wav: Blob) => {
    setUserSpeaking(false)
    if (wav.size === 0) { duck(false); return }
    if (connectionStateRef.current !== "connected") return
    const mine = ++hearCountRef.current
    const controller = new AbortController()
    const lang = langRef.current
    let turn = 0
    const st: { speaker: Speaker | null; full: string } = { speaker: null, full: "" }
    const turnLive = () => turn === turnRef.current && connectionStateRef.current === "connected"

    void (async () => {
      try {
        await hearStream(wav, lang, historyRef.current, {
          onHeard: (heard) => {
            if (connectionStateRef.current !== "connected" || mine < confirmedRef.current) { controller.abort(); return }
            const talking = phaseRef.current !== "listening"
            if (talking && (halfDuplex || isEcho(heard))) { controller.abort(); duck(false); setLocalTranscript(""); return }
            confirmedRef.current = mine
            if (talking) bargeIn() // you really did speak over Jarvis
            abortRef.current?.abort()
            abortRef.current = controller
            turn = beginTurn(heard.trim() || "…")
            touch()
            st.speaker = createSpeaker(voice, lang, (n) => { if (turnLive()) setVoiceNote(n) })
            speakerRef.current = st.speaker
          },
          onDelta: (piece) => {
            if (!st.speaker || !turnLive()) return
            st.full += piece
            replyRef.current = cleanText(st.full)
            setReply(cleanText(st.full))
            setPhase("speaking")
            st.speaker.feed(piece)
          },
          onNoSpeech: () => { duck(false); setLocalTranscript("") },
        }, controller.signal)
        if (st.speaker && turnLive()) {
          st.speaker.end()
          await st.speaker.finished
          if (turnLive()) historyRef.current = [...historyRef.current, { q: questionRef.current, a: replyRef.current.slice(0, 200) }].slice(-6)
        }
      } catch (error) {
        if (controller.signal.aborted) return
        st.speaker?.cancel()
        if (turn && turnLive()) setReply(error instanceof Error ? error.message : "Something went wrong.")
        duck(false)
      } finally {
        if (st.speaker && turnLive()) { setPhase("listening"); touch() }
      }
    })()
  }, [bargeIn, beginTurn, halfDuplex, isEcho, setPhase, touch, voice])

  /** Jarvis opens the conversation, so you know it is on and listening. */
  const greet = useCallback(() => {
    const turn = ++turnRef.current
    const lang = replyLanguage(selectedLanguage)
    langRef.current = lang
    const [first, rest] = greetingParts(lang)
    const text = `${first} ${rest}`
    setQuestion("")
    setReply(text)
    replyRef.current = text
    setVoiceNote("")
    setPhase("speaking")
    const speaker = createSpeaker(voice, lang, (n) => { if (turn === turnRef.current) setVoiceNote(n) })
    speakerRef.current = speaker
    speaker.feed(text)
    speaker.end()
    void speaker.finished.then(() => { if (turn === turnRef.current) { setPhase("listening"); touch() } })
  }, [selectedLanguage, setPhase, touch, voice])

  // Simulate audio chunk timing for latency measurement
  useEffect(() => {
    // Clear any existing interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }

    if (connectionState !== "connected") return

    timerIntervalRef.current = setInterval(() => {
      if (segmentStartMsRef.current === null) {
        segmentStartMsRef.current = performance.now()
      }
    }, 100)

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
    }
  }, [connectionState])

  const handleToggleRecording = useCallback(async () => {
    const now = Date.now()
    const timeSinceLastOp = now - lastOperationTimeRef.current

    // DISCONNECT
    if (connectionState === "connected" || connectionState === "connecting") {
      console.log("[Jarvis] Disconnecting...")
      turnRef.current++
      abortRef.current?.abort()
      speakerRef.current?.cancel()
      stopAudio()
      listenerRef.current?.stop()
      listenerRef.current = null
      historyRef.current = []
      confirmedRef.current = 0
      setUserSpeaking(false)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      setQuestion("")
      setReply("")
      replyRef.current = ""
      setPhase("listening")

      // 1. Update UI state immediately
      updateConnectionState("idle")
      setLocalTranscript("")
      setRecording({ error: "", latenciesMs: [] })
      clearSessionRefs()

      // 2. Disconnect (async, don't wait)
      try {
        scribe.disconnect()
        scribe.clearTranscripts()
      } catch {
        // Ignore errors
      }

      // 3. Play sound
      if (endSoundRef.current) {
        endSoundRef.current.currentTime = 0
        endSoundRef.current.play().catch(() => {})
      }

      lastOperationTimeRef.current = now
      return
    }

    // Debounce rapid clicks for CONNECT
    if (timeSinceLastOp < 200) {
      console.log("[Jarvis] Ignoring rapid click")
      return
    }
    lastOperationTimeRef.current = now

    // CONNECT
    if (connectionState !== "idle") {
      console.log("[Jarvis] Not in idle state, ignoring")
      return
    }

    unlockAudio() // iOS only plays sound that was started by a tap
    console.log("[Jarvis] Connecting...")
    updateConnectionState("connecting")
    greet() // starts talking while the microphone is still being switched on
    setLocalTranscript("")
    setRecording({ error: "", latenciesMs: [] })
    clearSessionRefs()

    try {
      listenerRef.current?.stop()
      listenerRef.current = await createListener({
        onSpeechStart: () => { touch(); setUserSpeaking(true); if (phaseRef.current === "speaking") duck(true) },
        onUtterance: (wav) => handleUtterance(wav),
      })
      // Live captions from the browser are a bonus: Jarvis still hears you if they are not available.
      void scribe.connect({ languageCode: selectedLanguage || undefined }).catch(() => {})

      // Check again after connect completes
      if (connectionStateRef.current !== "connecting") {
        console.log("[Jarvis] Cancelled after connection")
        try {
          scribe.disconnect()
        } catch {
          // Ignore
        }
        return
      }

      console.log("[Jarvis] Connected")
      updateConnectionState("connected")
      touch()

      // Play start sound
      if (startSoundRef.current) {
        startSoundRef.current.currentTime = 0
        startSoundRef.current.play().catch(() => {})
      }
    } catch (error) {
      console.error("[Jarvis] Connection error:", error)
      listenerRef.current?.stop()
      listenerRef.current = null
      turnRef.current++
      speakerRef.current?.cancel()
      stopAudio()
      setReply("")
      setPhase("listening")
      updateConnectionState("idle")
      setRecording((prev) => ({
        ...prev,
        error: error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")
          ? "Allow the microphone to talk to Jarvis."
          : error instanceof Error ? error.message : "Connection failed",
      }))
    }
  }, [
    clearSessionRefs,
    connectionState,
    greet,
    handleUtterance,
    scribe,
    selectedLanguage,
    setPhase,
    touch,
    updateConnectionState,
  ])
  stopRef.current = () => { if (connectionStateRef.current !== "idle") void handleToggleRecording() }

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "k" &&
        (e.metaKey || e.ctrlKey) &&
        e.target instanceof HTMLElement &&
        !["INPUT", "TEXTAREA"].includes(e.target.tagName)
      ) {
        e.preventDefault()
        handleToggleRecording()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleToggleRecording])

  // Note: No unmount cleanup - React Strict Mode causes issues
  // The browser will handle websocket cleanup on page unload

  // Preload audio files on mount (no auto-play)
  useEffect(() => {
    const sounds = [
      {
        ref: startSoundRef,
        url: "/sounds/transcriber-start.mp3",
      },
      {
        ref: endSoundRef,
        url: "/sounds/transcriber-end.mp3",
      },
      {
        ref: errorSoundRef,
        url: "/sounds/transcriber-error.mp3",
      },
    ]

    sounds.forEach(({ ref, url }) => {
      const audio = new Audio(url)
      audio.volume = 0.6
      audio.preload = "auto"
      audio.load()
      ref.current = audio
    })
  }, [])

  // Display text: prefer error, then local transcript
  const displayText = recording.error || localTranscript
  const inSession = connectionState === "connected" || connectionState === "connecting"
  // Once Jarvis has said something, its answer stays on screen while you carry on talking.
  const showAnswer = inSession && Boolean(reply || question)
  const hasContent = Boolean(displayText) && connectionState === "connected" && !showAnswer

  // Determine if current transcript is partial (for styling)
  const isPartial = Boolean(lastTranscriptRef.current)

  return (
    <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center">
      <BackgroundAura
        status={connectionState === "connecting" ? "connecting" : scribe.status}
        isConnected={connectionState === "connected"}
      />

      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-20%) scale(1);
          }
          50% {
            transform: translateX(20%) scale(1.1);
          }
          100% {
            transform: translateX(-20%) scale(1);
          }
        }
        @keyframes drift {
          0% {
            transform: translateX(-10%) scale(1);
          }
          100% {
            transform: translateX(10%) scale(1.05);
          }
        }
        @keyframes pulseGlow {
          0% {
            opacity: 0.5;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0.8;
            transform: translateY(-5%) scale(1.02);
          }
        }
      `}</style>

      <div className="relative flex h-full w-full flex-col items-center justify-center gap-8 overflow-hidden px-8 py-12">
        {/* Main transcript area */}
        <div className="relative flex min-h-[350px] w-full flex-1 items-center justify-center overflow-hidden">
          {/* Transcript - shown when there's content */}
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-250",
              hasContent ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            {hasContent && (
              <TranscriberTranscript
                transcript={displayText}
                error={recording.error}
                isPartial={isPartial}
                isConnected={connectionState === "connected"}
              />
            )}
          </div>

          {/* Jarvis answer - shown after the question was heard */}
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-250",
              showAnswer ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            {showAnswer && (
              <JarvisAnswer question={question} reply={reply} phase={phase} note={voiceNote} live={connectionState === "connected" ? localTranscript || (userSpeaking ? "…" : "") : ""} />
            )}
          </div>

          {/* Status text - shown when no content */}
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-opacity duration-250",
              !hasContent && !showAnswer ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            <div
              className={cn(
                "absolute transition-opacity duration-250",
                connectionState === "connecting"
                  ? "opacity-100"
                  : "pointer-events-none opacity-0"
              )}
            >
              <ShimmeringText
                text="Connecting..."
                className="text-2xl font-light tracking-wide whitespace-nowrap"
              />
            </div>
            <div
              className={cn(
                "absolute transition-opacity duration-250",
                connectionState === "connected" && !hasContent
                  ? "opacity-100"
                  : "pointer-events-none opacity-0"
              )}
            >
              <ShimmeringText
                text="Say something aloud..."
                className="text-3xl font-light tracking-wide whitespace-nowrap"
              />
            </div>
          </div>

          {/* Language selector and button - only shown when not connected */}
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-opacity duration-250",
              connectionState === "idle"
                ? "opacity-100"
                : "pointer-events-none opacity-0"
            )}
          >
            <div className="flex w-full max-w-sm flex-col gap-4 px-8">
              <div className="flex flex-col items-center gap-6">
                <div className="flex flex-col items-center gap-2 text-center">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    Jarvis
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    Ask about the Tany project board with your voice
                  </p>
                </div>

                <div className="w-full space-y-2">
                  <label className="text-foreground/70 text-sm font-medium">
                    Language
                  </label>
                  <LanguageSelector
                    value={selectedLanguage}
                    onValueChange={setSelectedLanguage}
                    disabled={connectionState !== "idle"}
                  />
                </div>

                <Button
                  onClick={handleToggleRecording}
                  disabled={false}
                  size="lg"
                  className="bg-foreground/95 hover:bg-foreground/90 w-full justify-center gap-3"
                >
                  <span>Ask Jarvis</span>
                  <kbd className="border-background/20 bg-background/10 hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-xs sm:inline-flex">
                    {isMac ? "⌘K" : "Ctrl+K"}
                  </kbd>
                </Button>

                <div className="w-full space-y-2">
                  <label className="text-foreground/70 text-sm font-medium">
                    Voice
                  </label>
                  <select
                    value={voice}
                    onChange={(e) => {
                      setVoice(e.target.value)
                      setVoiceState(e.target.value)
                    }}
                    className="border-input bg-background text-foreground focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                    aria-label="Voice"
                  >
                    {VOICES.map((v) => (
                      <option key={v} value={v}>
                        {v === "device" ? "Device voice" : v}
                      </option>
                    ))}
                  </select>
                </div>

                <Badge variant="outline" className="text-foreground/60">
                  Answers and voice by Google Gemini
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {recording.error && connectionState === "idle" && (
          <p
            className="fixed bottom-8 left-1/2 z-50 w-[min(90vw,28rem)] -translate-x-1/2 text-center text-sm text-red-500"
            role="alert"
          >
            {recording.error}
          </p>
        )}

        <BottomControls
          isConnected={connectionState === "connected"}
          hasError={Boolean(recording.error)}
          isMac={isMac}
          onStop={handleToggleRecording}
          speaking={phase === "speaking"}
          onStopVoice={() => {
            speakerRef.current?.cancel()
            stopAudio()
            setPhase("listening")
          }}
        />
      </div>
    </div>
  )
}

const TranscriberTranscript = React.memo(
  ({
    transcript,
    error,
    isPartial,
    isConnected,
  }: {
    transcript: string
    error: string
    isPartial?: boolean
    isConnected: boolean
  }) => {
    const characters = useMemo(() => transcript.split(""), [transcript])
    const previousNumChars = useDebounce(
      usePrevious(characters.length) || 0,
      100
    )
    const scrollRef = useRef<HTMLDivElement>(null)
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Auto-scroll to bottom when connected and text is updating
    useEffect(() => {
      if (isConnected && scrollRef.current) {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
        scrollTimeoutRef.current = setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }
        }, 50)
      }
      return () => {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current)
        }
      }
    }, [transcript, isConnected])

    return (
      <div className="absolute inset-0 flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div
            className={cn(
              "min-h-[50%] w-full px-12 py-8",
              isConnected && "absolute bottom-16"
            )}
          >
            <div
              className={cn(
                "text-foreground/90 w-full text-xl leading-relaxed font-light",
                error && "text-red-500",
                isPartial && !error && "text-foreground/60"
              )}
            >
              {characters.map((char, index) => {
                const delay =
                  index >= previousNumChars
                    ? (index - previousNumChars + 1) * 0.012
                    : 0
                return (
                  <TranscriptCharacter key={index} char={char} delay={delay} />
                )
              })}
            </div>
          </div>
        </div>
        {transcript && !error && !isPartial && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 h-8 w-8 opacity-0 transition-opacity hover:opacity-60"
            onClick={() => {
              navigator.clipboard.writeText(transcript)
            }}
            aria-label="Copy transcript"
          >
            <Copy className="h-4 w-4" />
          </Button>
        )}
      </div>
    )
  }
)
TranscriberTranscript.displayName = "TranscriberTranscript"


/** The question (muted), the answer with the same blur-in letters as the transcript, and what you are saying right now. */
const JarvisAnswer = React.memo(
  ({
    question,
    reply,
    phase,
    note,
    live,
  }: {
    question: string
    reply: string
    phase: "listening" | "thinking" | "speaking"
    note: string
    live: string
  }) => {
    const characters = useMemo(() => reply.split(""), [reply])
    const previousNumChars = useDebounce(usePrevious(characters.length) || 0, 100)
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 overflow-auto px-12 py-8">
        {question && (
          <p className="text-foreground/50 max-w-2xl text-center text-lg leading-relaxed font-light">
            {question}
          </p>
        )}
        {phase === "thinking" && !reply ? (
          <ShimmeringText
            text="Thinking..."
            className="text-2xl font-light tracking-wide whitespace-nowrap"
          />
        ) : (
          <div className="text-foreground/90 max-w-2xl text-center text-xl leading-relaxed font-light">
            {characters.map((char, index) => {
              const delay =
                index >= previousNumChars ? (index - previousNumChars + 1) * 0.012 : 0
              return <TranscriptCharacter key={index} char={char} delay={delay} />
            })}
          </div>
        )}
        {live && (
          <p className="text-foreground/60 max-w-2xl text-center text-lg leading-relaxed font-light" aria-live="polite">
            {live}
          </p>
        )}
        {note && <p className="text-foreground/40 max-w-2xl text-center text-xs">{note}</p>}
      </div>
    )
  }
)
JarvisAnswer.displayName = "JarvisAnswer"
