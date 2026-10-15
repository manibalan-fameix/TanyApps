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
import { cleanText, createSpeaker, duck, isPaused, pauseAudio, resumeAudio, greetingParts, hearStream, prefetchGreeting, stopAudio, unlockAudio, warmUp, VOICES, getVoice, setVoice, replyLanguage, loadCards, askStream, LISTENING, getListening, setListening, type Listening, createTaskApi, sendSlackApi, type SlackMsg, getCreate, setCreate, type Draft, PERSONAS, getPersona, setPersona, getCallMe, setCallMe, type Persona, type BoardData, type Speaker, type Turn } from "@/lib/jarvis"
import { createListener, type Listener } from "@/lib/mic"
import { Pause, Play } from "lucide-react"
import { CardView } from "@/components/card-view"
import { BriefingPanel } from "@/components/briefing-panel"
import { SpokenText } from "@/components/spoken-text"
import { DraftPanel } from "@/components/draft-panel"
import { MessagePanel } from "@/components/message-panel"
import { isNo, isYes } from "@/lib/format"
import { detectAlerts, groupsFor, intentView, mentioned, parseShow, statusLine, type View } from "@/lib/cards"

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
    paused,
    onTogglePause,
  }: {
    isConnected: boolean
    hasError: boolean
    isMac: boolean
    onStop: () => void
    speaking: boolean
    onStopVoice: () => void
    paused: boolean
    onTogglePause: () => void
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
            <button
              onClick={onTogglePause}
              aria-pressed={paused}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap shadow-lg transition-opacity hover:opacity-90",
                paused ? "border-cyan-400/60 bg-cyan-400 text-slate-950" : "bg-background text-foreground border-foreground/15"
              )}
            >
              {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
              {paused ? "Resume" : "Pause"}
              <kbd className="border-foreground/20 bg-foreground/10 inline-flex h-5 items-center rounded border px-1.5 font-mono text-xs">P</kbd>
            </button>
            {speaking && !paused && (
              <button
                onClick={onStopVoice}
                className="bg-background text-foreground border-foreground/15 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap shadow-lg transition-opacity hover:opacity-90"
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
    if (prev.paused !== next.paused) return false
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
  // The sentences Jarvis has started to say, in order. Only these are on screen, and the one being spoken is highlighted word by word.
  const [spoken, setSpoken] = useState<string[]>([])
  const spokenCount = useRef(0) // how many sentences are on screen, so a follow-on speaker carries on after them
  const showPiece = useCallback((text: string, index: number) => {
    if (index >= 0) { spokenCount.current = index + 1; setSpoken((prev) => { const next = prev.slice(0, index); next[index] = text; return next }) }
    if (index >= 0) { setHighlight([]); setFocusPerson(null) } // the voice picks the card as it reaches each task
  }, [])
  // listening: waiting for you. thinking: Jarvis is working out the answer. speaking: Jarvis is talking (you can still interrupt).
  const [phase, setPhaseState] = useState<"listening" | "thinking" | "speaking">("listening")
  const phaseRef = useRef<"listening" | "thinking" | "speaking">("listening")
  // In "Say Jarvis" mode Jarvis answers without the wake word for 30 seconds after it last spoke, then goes on standby.
  const awakeUntilRef = useRef(Infinity)
  const [asleep, setAsleep] = useState(false)
  const setPhase = useCallback((next: "listening" | "thinking" | "speaking") => {
    phaseRef.current = next
    setPhaseState(next)
    awakeUntilRef.current = next === "listening" ? Date.now() + 30_000 : Infinity
    if (next !== "listening") setAsleep(false)
  }, [])
  const [listening, setListeningState] = useState<Listening>(getListening())
  const listeningRef = useRef(listening)
  useEffect(() => { listeningRef.current = listening }, [listening])
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
  const userSpeakingRef = useRef(false)
  useEffect(() => { userSpeakingRef.current = userSpeaking }, [userSpeaking])

  // Cards: the board, what Jarvis asked to show, and which card it is talking about right now.
  const [board, setBoard] = useState<BoardData | null>(null)
  const canCreateRef = useRef(false)
  useEffect(() => { canCreateRef.current = Boolean(board?.canCreate || board?.canSlack) }, [board])
  const [view, setView] = useState<View>({ kind: "none" })
  const [highlight, setHighlight] = useState<number[]>([])
  const [focusPerson, setFocusPerson] = useState<string | null>(null)
  const onFocus = useCallback((f: { task: number | null; person: string | null }) => {
    setHighlight(f.task ? [f.task] : [])
    setFocusPerson(f.person)
  }, [])
  const shownRef = useRef(false) // did the model ask for specific cards this turn?
  const groups = useMemo(() => groupsFor(view, board), [view, board])
  const boardTitles = useMemo(() => board?.items.map((i) => i.title) ?? [], [board])
  const [theme, setThemeState] = useState<"holo" | "clean">(() => { try { return localStorage.getItem("theme") === "clean" ? "clean" : "holo" } catch { return "holo" } })
  const [briefing, setBriefingState] = useState<boolean>(() => { try { return localStorage.getItem("briefing") !== "off" } catch { return true } })
  // Pause: freezes the voice, the highlight and the listening exactly where they are. Resume carries on from there.
  const [paused, setPausedState] = useState(false)
  const pausedRef = useRef(false)
  // Creating tasks by voice: Jarvis drafts, you confirm (button or "yes"), the server creates.
  const [createOn, setCreateOn] = useState(getCreate())
  const createOnRef = useRef(createOn)
  useEffect(() => { createOnRef.current = createOn }, [createOn])
  const [draft, setDraftState] = useState<Draft | null>(null)
  const draftRef = useRef<Draft | null>(null)
  const setDraft = useCallback((d: Draft | null) => { draftRef.current = d; setDraftState(d) }, [])
  const [draftStatus, setDraftStatus] = useState<"idle" | "creating" | "error">("idle")
  const draftStatusRef = useRef<"idle" | "creating" | "error">("idle")
  useEffect(() => { draftStatusRef.current = draftStatus }, [draftStatus])
  const [draftError, setDraftError] = useState("")
  const submitRef = useRef<() => void>(() => {})
  // A Slack message works the same way: Jarvis drafts, you confirm, the server sends.
  const [msg, setMsgState] = useState<SlackMsg | null>(null)
  const msgRef = useRef<SlackMsg | null>(null)
  const setMsg = useCallback((m: SlackMsg | null) => { msgRef.current = m; setMsgState(m) }, [])
  const [msgStatus, setMsgStatus] = useState<"idle" | "sending" | "error">("idle")
  const msgStatusRef = useRef<"idle" | "sending" | "error">("idle")
  useEffect(() => { msgStatusRef.current = msgStatus }, [msgStatus])
  const [msgError, setMsgError] = useState("")
  const sendRef = useRef<() => void>(() => {})
  const clearMsg = useCallback(() => { setMsg(null); setMsgStatus("idle"); setMsgError("") }, [setMsg])
  const [persona, setPersonaState] = useState<Persona>(getPersona())
  const [callMe, setCallMeState] = useState(getCallMe())
  const lastAlertRef = useRef(0)
  const alertsSentRef = useRef(0)
  const prevBoardRef = useRef<BoardData | null>(null)
  const callMeRef = useRef(callMe)
  useEffect(() => { callMeRef.current = callMe }, [callMe])
  const raiseRef = useRef<(text: string, n: number) => boolean>(() => false)
  const briefingRef = useRef(briefing)
  useEffect(() => { briefingRef.current = briefing }, [briefing])
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("holo", theme === "holo")
    root.classList.toggle("dark", theme === "holo")
    try { localStorage.setItem("theme", theme) } catch { /* private mode */ }
  }, [theme])
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

  // The cards need the board: load it when a session starts and keep it fresh while it runs.
  useEffect(() => {
    if (connectionState !== "connected") return
    let stop = false
    prevBoardRef.current = null
    const load = () => loadCards().then((b) => {
      if (stop) return
      setBoard(b)
      const before = prevBoardRef.current
      prevBoardRef.current = b
      // Something changed on the board since the last look: tell the user, but not too often and never over a conversation.
      if (before && langRef.current === "en" && alertsSentRef.current < 5 && Date.now() - lastAlertRef.current > 180_000) {
        const found = detectAlerts(before.items, b.items, callMeRef.current)
        if (found.length && raiseRef.current(found[0].text, found[0].n)) { lastAlertRef.current = Date.now(); alertsSentRef.current++ }
      }
    }).catch(() => {})
    alertsSentRef.current = 0
    void load()
    const t = setInterval(load, 60_000)
    return () => { stop = true; clearInterval(t) }
  }, [connectionState])

  // Show the "say Jarvis" hint once the follow-up window has passed.
  useEffect(() => {
    if (connectionState !== "connected") return
    const t = setInterval(() => setAsleep(listeningRef.current === "wake" && phaseRef.current === "listening" && Date.now() > awakeUntilRef.current), 1000)
    return () => clearInterval(t)
  }, [connectionState])

  // Push to talk: hold the Space bar (or the button) while you speak.
  const hold = useCallback((open: boolean) => { if (open) unlockAudio(); listenerRef.current?.setGate(open) }, [])
  useEffect(() => {
    if (listening !== "push") return
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat && !typing(e)) { e.preventDefault(); hold(true) } }
    const up = (e: KeyboardEvent) => { if (e.code === "Space" && !typing(e)) { e.preventDefault(); hold(false) } }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up) }
  }, [listening, hold])

  // A soft chime when cards appear on screen.
  const hadCards = useRef(false)
  useEffect(() => {
    const has = groups.length > 0
    if (has && !hadCards.current && startSoundRef.current) {
      const a = startSoundRef.current
      a.volume = 0.3
      a.currentTime = 0
      a.play().catch(() => {})
    }
    hadCards.current = has
  }, [groups.length])

  // While Jarvis talks, only clearly louder speech counts as you (a leftover echo must not interrupt it).
  useEffect(() => {
    listenerRef.current?.setStrict(phase !== "listening")
  }, [phase])

  // Have the greeting's voice ready before the tap, so Jarvis answers the tap at once.
  useEffect(() => {
    if (connectionState === "idle") prefetchGreeting(voice, replyLanguage(selectedLanguage), persona, callMe)
  }, [voice, selectedLanguage, connectionState, persona, callMe])

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

  /**
   * True when what the microphone heard is just Jarvis's own voice coming back through the speaker: a long enough run of
   * consecutive words that Jarvis is saying right now. Single shared words ("task", "to") do not count, so a short question
   * that reuses a few of them is still treated as you.
   */
  const isEcho = useCallback((heard: string) => {
    if (phaseRef.current === "listening") return false
    const hw = words(heard)
    if (!hw.length) return true
    const said = words(replyRef.current)
    let best = 0
    for (let i = 0; i < hw.length; i++) {
      for (let j = 0; j < said.length; j++) {
        let k = 0
        while (i + k < hw.length && j + k < said.length && hw[i + k] === said[j + k]) k++
        if (k > best) best = k
      }
    }
    return hw.length <= 2 ? best === hw.length && hw.length === 2 : best >= Math.max(3, Math.ceil(hw.length * 0.7))
  }, [])

  /** Resets the "nothing said for a while" timer. A silent session ends by itself after two minutes. */
  const touch = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    // A paused session never times out: it waits for you.
    idleTimerRef.current = setTimeout(() => { if (pausedRef.current) touchRef.current(); else stopRef.current() }, 120_000)
  }, [])
  const touchRef = useRef<() => void>(() => {})
  touchRef.current = touch

  const togglePause = useCallback(() => {
    if (connectionStateRef.current !== "connected") return
    const next = !pausedRef.current
    pausedRef.current = next
    setPausedState(next)
    if (next) pauseAudio()
    else { resumeAudio(); touch() }
  }, [touch])

  // P pauses and resumes (not while typing, and not with a modifier key held).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "p" || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return
      e.preventDefault()
      togglePause()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [togglePause])

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
    setSpoken([]); spokenCount.current = 0
    replyRef.current = ""
    setVoiceNote("")
    setLocalTranscript("")
    lastTranscriptRef.current = ""
    setView({ kind: "none" })
    setHighlight([])
    shownRef.current = false
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
    let heardText = ""
    const team = () => board?.team ?? ["Gokul", "Pavi", "Mala", "Bala", "Vishnu"]
    const pick = (raw: unknown): View => {
      const parsed = parseShow(raw)
      const intent = intentView(heardText, team())
      return intent && (parsed.kind === "none" || (parsed.kind === "focus" && parsed.ids.length <= 1)) ? intent : parsed
    }
    const st: { speaker: Speaker | null; full: string } = { speaker: null, full: "" }
    const turnLive = () => turn === turnRef.current && connectionStateRef.current === "connected"

    void (async () => {
      try {
        let acted = false
        await hearStream(wav, lang, historyRef.current, {
          onHeard: (heard) => {
            if (connectionStateRef.current !== "connected" || mine < confirmedRef.current) { controller.abort(); return }
            const talking = phaseRef.current !== "listening"
            if (talking && (halfDuplex || isEcho(heard))) { controller.abort(); duck(false); setLocalTranscript(""); return }
            confirmedRef.current = mine
            if (talking) bargeIn() // you really did speak over Jarvis
            abortRef.current?.abort()
            abortRef.current = controller
            heardText = heard
            turn = beginTurn(heard.trim() || "…")
            touch()
            st.speaker = createSpeaker(voice, lang, (n) => { if (turnLive()) setVoiceNote(n) }, (t, i) => { if (turnLive()) showPiece(t, i) })
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
          onShow: (raw) => { if (turnLive()) { shownRef.current = true; setView(pick(raw)) } },
          onDraft: (d) => { if (draftStatusRef.current !== "creating") { setDraft(d); setDraftStatus("idle"); setDraftError("") } },
          onMessage: (m) => { if (msgStatusRef.current !== "sending") { setMsg(m); setMsgStatus("idle"); setMsgError("") } },
          onDraftError: (message) => { if (turnLive()) setVoiceNote(message) },
          // A confirmation only counts if the words that were actually said are a clear yes (or no): the model alone cannot create a task.
          onAction: (action) => {
            acted = true
            if (action === "confirm" && isYes(heardText) && !isNo(heardText)) { if (msgRef.current) sendRef.current(); else if (draftRef.current) submitRef.current() }
            else if (action === "cancel" && isNo(heardText)) { if (msgRef.current) clearMsg(); else if (draftRef.current) { setDraft(null); setDraftStatus("idle"); setDraftError("") } }
          },
        }, controller.signal, undefined, { wake: listeningRef.current === "wake", awake: Date.now() <= awakeUntilRef.current }, { enabled: createOnRef.current && canCreateRef.current, draft: draftRef.current, message: msgRef.current })
        // The model sometimes forgets its confirm/cancel line: a short, clear yes or no to a waiting draft is enough on its own.
        if (!acted && (draftRef.current || msgRef.current) && turnLive() && heardText.trim().split(/\s+/).length <= 6) {
          if (isYes(heardText) && !isNo(heardText)) { if (msgRef.current) sendRef.current(); else submitRef.current() }
          else if (isNo(heardText) && !isYes(heardText)) { if (msgRef.current) clearMsg(); else { setDraft(null); setDraftStatus("idle"); setDraftError("") } }
        }
        if (st.speaker && turnLive()) {
          st.speaker.end()
          if (!shownRef.current) {
            const intent = intentView(heardText, team())
            const ids = mentioned(replyRef.current)
            if (intent) setView(intent)
            else if (ids.length) setView({ kind: "focus", ids: ids.slice(0, 6) })
          }
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
  }, [bargeIn, beginTurn, board, halfDuplex, isEcho, setPhase, touch, voice])

  /** Jarvis opens the conversation, so you know it is on and listening. */
  const greet = useCallback(() => {
    const turn = ++turnRef.current
    const lang = replyLanguage(selectedLanguage)
    langRef.current = lang
    const [first, rest] = greetingParts(lang, persona, callMe)
    // With the briefing on, the welcome is one line and the briefing carries straight on from it: one greeting, not two.
    const withBriefing = briefingRef.current && lang === "en"
    const text = withBriefing ? first : `${first} ${rest}`
    setQuestion("")
    setReply(text)
    setSpoken([]); spokenCount.current = 0
    setView({ kind: "none" })
    replyRef.current = text
    setVoiceNote("")
    setPhase("speaking")
    const speaker = createSpeaker(voice, lang, (n) => { if (turn === turnRef.current) setVoiceNote(n) }, (t, i) => { if (turn === turnRef.current) showPiece(t, i) }, 0, "welcome")
    speakerRef.current = speaker
    speaker.feed(text)
    speaker.end()
    if (withBriefing) briefRef.current(turn, speaker.finished)
    else void speaker.finished.then(() => { if (turn === turnRef.current) { setPhase("listening"); touch() } })
  }, [callMe, persona, selectedLanguage, setPhase, showPiece, touch, voice])

  /** Jarvis speaks up on its own: only between turns, never while you are talking. Returns whether it did. */
  raiseRef.current = (text, n) => {
    if (phaseRef.current !== "listening" || userSpeakingRef.current || pausedRef.current || connectionStateRef.current !== "connected") return false
    const turn = ++turnRef.current
    const lang = langRef.current
    setQuestion("")
    questionRef.current = ""
    setReply(text)
    replyRef.current = text
    setVoiceNote("")
    setSpoken([]); spokenCount.current = 0
    setView({ kind: "focus", ids: [n] })
    setHighlight([n])
    setPhase("speaking")
    const speaker = createSpeaker(voice, lang, (note) => { if (turn === turnRef.current) setVoiceNote(note) }, (t, i) => { if (turn === turnRef.current) showPiece(t, i) })
    speakerRef.current = speaker
    speaker.feed(text)
    speaker.end()
    void speaker.finished.then(() => { if (turn === turnRef.current) { setHighlight([]); setPhase("listening"); touch() } })
    return true
  }

  /** Says one line on its own, once Jarvis has finished whatever it was saying. */
  const sayLine = useCallback(async (text: string) => {
    for (let waited = 0; phaseRef.current !== "listening" && waited < 9000; waited += 250) await new Promise((r) => setTimeout(r, 250))
    if (connectionStateRef.current !== "connected") return
    const turn = ++turnRef.current
    setQuestion("")
    questionRef.current = ""
    setReply(text)
    replyRef.current = text
    setSpoken([]); spokenCount.current = 0
    setPhase("speaking")
    const speaker = createSpeaker(voice, langRef.current, (n) => { if (turn === turnRef.current) setVoiceNote(n) }, (t, i) => { if (turn === turnRef.current) showPiece(t, i) })
    speakerRef.current = speaker
    speaker.feed(text)
    speaker.end()
    void speaker.finished.then(() => { if (turn === turnRef.current) { setPhase("listening"); touch() } })
  }, [showPiece, setPhase, touch, voice])

  /** Sends the drafted Slack message. Called by the Send button and by a spoken "yes". */
  sendRef.current = () => {
    const m = msgRef.current
    if (!m || msgStatusRef.current === "sending") return
    setMsgStatus("sending")
    setMsgError("")
    void sendSlackApi(m)
      .then((sent) => { clearMsg(); void sayLine(sent.line) })
      .catch((e: Error) => { setMsgStatus("error"); setMsgError(e.message); void sayLine(`I'm afraid that did not work, ${callMeRef.current}. ${e.message}`) })
  }

  /** Creates the drafted task. Called by the Create button and by a spoken "yes". */
  submitRef.current = () => {
    const d = draftRef.current
    if (!d || draftStatusRef.current === "creating") return
    setDraftStatus("creating")
    setDraftError("")
    void createTaskApi(d)
      .then((made) => {
        setDraft(null)
        setDraftStatus("idle")
        setBoard((prev) => (prev ? { ...prev, items: prev.items.some((i) => i.n === made.number) ? prev.items : [...prev.items, made.card] } : prev))
        setView({ kind: "focus", ids: [made.number] })
        void sayLine(made.line)
        setTimeout(() => { void loadCards().then(setBoard).catch(() => {}) }, 2500) // pick up what GitHub now holds
      })
      .catch((e: Error) => {
        setDraftStatus("error")
        setDraftError(e.message)
        void sayLine(`I'm afraid that did not work, ${callMeRef.current}. ${e.message}`)
      })
  }

  /**
   * After the one-line welcome, the full project briefing carries on in the same turn. The request starts while the welcome is
   * still being spoken; the briefing's voice only starts once the welcome has finished.
   */
  const briefRef = useRef<(turn: number, after: Promise<void>) => void>(() => {})
  briefRef.current = (turn, after) => {
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    const lang = langRef.current
    const live = () => turn === turnRef.current && connectionStateRef.current === "connected"
    const waiting: string[] = []
    let speaker: Speaker | null = null
    let streamDone = false
    let full = ""
    const begin = () => {
      if (!live()) return
      speaker = createSpeaker(voice, lang, (n) => { if (live()) setVoiceNote(n) }, (t, i) => { if (live()) showPiece(t, i) }, spokenCount.current)
      speakerRef.current = speaker
      if (waiting.length) setPhase("speaking") // the answer was already written while the welcome was playing
      waiting.splice(0).forEach((p) => speaker!.feed(p))
      if (streamDone) speaker.end()
    }
    void after.then(() => { if (live()) { setPhase("thinking"); begin() } })
    void (async () => {
      try {
        await askStream(
          "The greeting has already been spoken, so do not greet again. Give me the full project briefing now.",
          lang,
          (piece) => {
            if (!live()) return
            full += piece
            replyRef.current = cleanText(full)
            setReply(cleanText(full))
            if (speaker) { setPhase("speaking"); speaker.feed(piece) } else waiting.push(piece)
          },
          controller.signal,
          (raw) => { if (live()) { shownRef.current = true; setView(pickView(raw)) } }
        )
        streamDone = true
        if (speaker) (speaker as Speaker).end()
        if (live() && !shownRef.current) { const ids = mentioned(replyRef.current); if (ids.length) setView({ kind: "focus", ids: ids.slice(0, 6) }) }
        await after
        if (speaker) await (speaker as Speaker).finished
      } catch {
        ;(speaker as Speaker | null)?.cancel()
      } finally {
        if (live()) { setPhase("listening"); touch() }
      }
    })()
  }
  const pickView = (raw: unknown): View => parseShow(raw)

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
      pausedRef.current = false
      setPausedState(false)
      setDraft(null); setDraftStatus("idle"); setDraftError(""); clearMsg()
      resumeAudio() // a session ended while paused must not leave the next one silent
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
      }, { manual: listeningRef.current === "push" })
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
    <div className="relative mx-auto flex h-full w-full max-w-[110rem] flex-col items-center justify-center">
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

      <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden px-4 py-6 sm:gap-8 sm:px-8 sm:py-10">
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
              <JarvisAnswer question={question} reply={reply} phase={phase} note={voiceNote} spoken={spoken} team={board?.team ?? []} titles={boardTitles} onFocus={onFocus} live={connectionState === "connected" ? localTranscript || (userSpeaking ? "…" : "") : ""} top={draft || msg || (view.kind === "briefing" && board?.facts) ? <>{msg && <MessagePanel message={msg} status={msgStatus} error={msgError} onSend={() => sendRef.current()} onCancel={clearMsg} />}{draft && <DraftPanel draft={draft} status={draftStatus} error={draftError} onCreate={() => submitRef.current()} onCancel={() => { setDraft(null); setDraftStatus("idle"); setDraftError("") }} />}{view.kind === "briefing" && board?.facts && <BriefingPanel facts={board.facts} />}</> : null} cards={groups.length ? <CardView groups={groups} highlight={highlight} focusPerson={focusPerson} wall={view.kind === "sprint" || view.kind === "briefing"} /> : null} />
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
            <div className="flex max-h-full w-full max-w-sm flex-col gap-4 overflow-y-auto px-8 py-2">
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

                <div className="grid w-full grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-foreground/70 text-sm font-medium" htmlFor="persona">Personality</label>
                    <select
                      id="persona"
                      value={persona}
                      onChange={(e) => { setPersona(e.target.value as Persona); setPersonaState(e.target.value as Persona) }}
                      className="border-input bg-background text-foreground focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                    >
                      {PERSONAS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-foreground/70 text-sm font-medium" htmlFor="callme">Call me</label>
                    <input
                      id="callme"
                      type="text"
                      defaultValue={callMe}
                      maxLength={24}
                      onBlur={(e) => { setCallMe(e.target.value); const v = getCallMe(); setCallMeState(v); e.target.value = v }}
                      className="border-input bg-background text-foreground focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                    />
                  </div>
                </div>

                <div className="w-full space-y-2">
                  <label className="text-foreground/70 text-sm font-medium" htmlFor="listening">Listening</label>
                  <select
                    id="listening"
                    value={listening}
                    onChange={(e) => { setListening(e.target.value as Listening); setListeningState(e.target.value as Listening) }}
                    className="border-input bg-background text-foreground focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                  >
                    {LISTENING.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </div>

                <label className="flex w-full cursor-pointer items-center justify-between gap-3 text-sm">
                  <span className="text-foreground/70 font-medium">Let me create tasks and send Slack messages by voice</span>
                  <input
                    type="checkbox"
                    checked={createOn}
                    onChange={(e) => { setCreateOn(e.target.checked); setCreate(e.target.checked) }}
                    className="size-4 accent-cyan-500"
                  />
                </label>

                <label className="flex w-full cursor-pointer items-center justify-between gap-3 text-sm">
                  <span className="text-foreground/70 font-medium">Briefing when I start</span>
                  <input
                    type="checkbox"
                    checked={briefing}
                    onChange={(e) => {
                      setBriefingState(e.target.checked)
                      try { localStorage.setItem("briefing", e.target.checked ? "on" : "off") } catch { /* private mode */ }
                    }}
                    className="size-4 accent-cyan-500"
                  />
                </label>

                <Badge variant="outline" className="text-foreground/60">
                  Answers and voice by Google Gemini
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {connectionState === "connected" && listening === "push" && (
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); hold(true) }}
            onPointerUp={() => hold(false)}
            onPointerLeave={() => hold(false)}
            onPointerCancel={() => hold(false)}
            className="bg-foreground/90 text-background fixed bottom-24 left-1/2 z-50 -translate-x-1/2 touch-none rounded-full px-6 py-3 text-sm font-medium shadow-lg select-none active:scale-95"
          >
            Hold to talk · Space
          </button>
        )}
        {connectionState === "connected" && paused && (
          <p className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-cyan-400/50 bg-cyan-400/10 px-4 py-1 text-sm text-cyan-700 backdrop-blur dark:text-cyan-200" role="status">
            Paused · press P or Resume to continue
          </p>
        )}
        {connectionState === "connected" && asleep && !paused && (
          <p className="text-foreground/60 fixed bottom-24 left-1/2 z-40 -translate-x-1/2 text-sm" role="status">
            On standby. Say “Jarvis” to wake me.
          </p>
        )}

        {inSession && board && (
          <div className="text-foreground/50 fixed top-4 left-4 z-40 max-w-[60vw] font-mono text-[10px] leading-tight tracking-widest holo:text-cyan-300/70" aria-label="Sprint status">
            {statusLine(board)}
          </div>
        )}

        <button
          type="button"
          onClick={() => setThemeState((t) => (t === "holo" ? "clean" : "holo"))}
          className="border-foreground/15 text-foreground/70 hover:text-foreground fixed top-4 right-4 z-50 rounded-full border px-3 py-1 text-xs backdrop-blur"
          aria-label="Switch look"
        >
          {theme === "holo" ? "Hologram" : "Clean"}
        </button>

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
          paused={paused}
          onTogglePause={togglePause}
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
    cards,
    top,
    spoken,
    team,
    titles,
    onFocus,
  }: {
    question: string
    reply: string
    phase: "listening" | "thinking" | "speaking"
    note: string
    live: string
    cards: React.ReactNode
    top?: React.ReactNode
    spoken: string[]
    team: string[]
    titles: string[]
    onFocus: (f: { task: number | null; person: string | null }) => void
  }) => {
    // Cards on screen: split the screen. Cards get about two thirds, the transcript the rest (stacked on a phone). Both panes
    // scroll with the wheel, touch or keys, with the scroll bars hidden. Without cards the transcript stays centred, as before.
    const split = Boolean(cards || top)
    return (
      <div className={cn("absolute inset-0 flex gap-4 px-4 pt-12 pb-24 sm:gap-6 sm:px-8", split ? "flex-col md:flex-row-reverse md:gap-10 lg:gap-14 xl:gap-20" : "items-center justify-center")}>
        <div
          className={cn(
            "no-scrollbar flex min-h-0 flex-col gap-4 overflow-y-auto",
            split ? "h-[34%] shrink-0 justify-start md:h-full md:w-[38%]" : "h-full w-full items-center justify-center text-center"
          )}
          data-pane="transcript"
        >
          <div className={cn("flex w-full flex-col gap-4", split ? "items-start text-left" : "items-center text-center", !split && "my-auto")}>
            {question && (
              <p className={cn("text-foreground/50 leading-relaxed font-light", split ? "text-base sm:text-lg 2xl:text-xl" : "max-w-2xl text-base sm:text-lg")}>{question}</p>
            )}
            {phase === "thinking" && !spoken.length && !reply ? (
              <ShimmeringText text="Thinking..." className="text-2xl font-light tracking-wide whitespace-nowrap" />
            ) : spoken.length ? (
              <SpokenText pieces={spoken} live={phase === "speaking"} compact={split} team={team} titles={titles} onFocus={onFocus} />
            ) : reply && phase === "listening" ? (
              <p className={cn("text-foreground/90 leading-relaxed font-light", split ? "text-base sm:text-lg 2xl:text-xl" : "max-w-3xl text-lg sm:text-xl")}>{reply}</p>
            ) : null}
            {live && (
              <p className="text-foreground/60 text-base leading-relaxed font-light sm:text-lg" aria-live="polite">{live}</p>
            )}
            {note && <p className="text-foreground/40 text-xs">{note}</p>}
          </div>
        </div>

        {split && (
          <div className="no-scrollbar @container flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto px-5" data-pane="cards">
            {top}
            {cards}
          </div>
        )}
      </div>
    )
  }
)
JarvisAnswer.displayName = "JarvisAnswer"
