"use client"

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { AnimatePresence, motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { useDebounce } from "@/hooks/use-debounce"
import { usePrevious } from "@/hooks/use-previous"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import { Button } from "@/components/ui/button"
import { ShimmeringText } from "@/components/ui/shimmering-text"

interface RecordingState {
  error: string
  latenciesMs: number[]
}

type ConnectionState = "idle" | "connecting" | "connected" | "disconnecting"

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
              "radial-gradient(ellipse 100% 100% at 50% 100%, color-mix(in oklab, var(--primary) 50%, transparent) 0%, color-mix(in oklab, var(--primary) 40%, transparent) 35%, color-mix(in oklab, var(--primary) 50%, transparent) 70%, transparent 100%)",
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
              "radial-gradient(ellipse 100% 100% at 50% 100%, color-mix(in oklab, var(--primary) 50%, transparent) 0%, color-mix(in oklab, var(--primary) 40%, transparent) 50%, transparent 100%)",
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
              "radial-gradient(circle at 0% 100%, color-mix(in oklab, var(--primary) 50%, transparent) 0%, color-mix(in oklab, var(--primary) 30%, transparent) 30%, transparent 60%)",
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
              "radial-gradient(ellipse 50% 100% at 10% 100%, color-mix(in oklab, var(--primary) 40%, transparent) 0%, color-mix(in oklab, var(--primary) 25%, transparent) 25%, transparent 60%)",
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
              "radial-gradient(circle at 100% 100%, color-mix(in oklab, var(--primary) 50%, transparent) 0%, color-mix(in oklab, var(--primary) 30%, transparent) 30%, transparent 60%)",
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
              "radial-gradient(ellipse 50% 100% at 90% 100%, color-mix(in oklab, var(--primary) 40%, transparent) 0%, color-mix(in oklab, var(--primary) 25%, transparent) 25%, transparent 60%)",
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
              "linear-gradient(90deg, color-mix(in oklab, var(--primary) 30%, transparent) 0%, color-mix(in oklab, var(--primary) 30%, transparent) 30%, color-mix(in oklab, var(--primary) 30%, transparent) 60%, color-mix(in oklab, var(--primary) 30%, transparent) 100%)",
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
  }: {
    isConnected: boolean
    hasError: boolean
    isMac: boolean
    onStop: () => void
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
              onClick={onStop}
              className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 bg-foreground px-3 py-2 text-sm font-medium text-background shadow-lg transition-opacity hover:opacity-90"
            >
              Stop
              <kbd className="inline-flex h-5 items-center rounded border border-background/20 bg-background/10 px-1.5 font-mono text-xs">
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
    return true
  }
)
BottomControls.displayName = "BottomControls"

export function RealtimeTranscriber01({
  onTranscript,
}: {
  /** Called with each finished sentence. */
  onTranscript?: (text: string) => void
} = {}) {
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => {
    onTranscriptRef.current = onTranscript
  })

  const [recording, setRecording] = useState<RecordingState>({
    error: "",
    latenciesMs: [],
  })
  const [connectionState, setConnectionStateState] =
    useState<ConnectionState>("idle")
  const [localTranscript, setLocalTranscript] = useState("")

  const isMac = useSyncExternalStore(
    () => () => {},
    () => /(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent),
    () => true
  )
  const [isPartial, setIsPartial] = useState(false)

  const segmentStartMsRef = useRef<number | null>(null)
  const lastTranscriptRef = useRef<string>("")
  const finalTranscriptsRef = useRef<string[]>([])

  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastOperationTimeRef = useRef(0)
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
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

  // === Callbacks for Scribe ===
  const onPartialTranscript = useCallback((data: { text?: string }) => {
    // Only process if we're connected
    if (connectionStateRef.current !== "connected") return

    const currentText = data.text || ""

    if (currentText === lastTranscriptRef.current) return

    lastTranscriptRef.current = currentText
    setIsPartial(currentText.length > 0)

    // Update local transcript with partial
    const fullText = finalTranscriptsRef.current.join(" ")
    const combined = fullText ? `${fullText} ${currentText}` : currentText
    setLocalTranscript(combined)

    if (currentText.length > 0 && segmentStartMsRef.current != null) {
      const latency = performance.now() - segmentStartMsRef.current
      setRecording((prev) => ({
        ...prev,
        latenciesMs: [...prev.latenciesMs.slice(-29), latency],
      }))
      segmentStartMsRef.current = null
    }
  }, [])

  const onCommittedTranscript = useCallback((data: { text?: string }) => {
    // Only process if we're connected
    if (connectionStateRef.current !== "connected") return

    lastTranscriptRef.current = ""
    setIsPartial(false)
    if (data.text?.trim()) onTranscriptRef.current?.(data.text.trim())

    if (data.text && data.text.length > 0) {
      // Add to final transcripts
      finalTranscriptsRef.current = [...finalTranscriptsRef.current, data.text]

      // Update local transcript
      setLocalTranscript(finalTranscriptsRef.current.join(" "))

      if (segmentStartMsRef.current != null) {
        const latency = performance.now() - segmentStartMsRef.current
        setRecording((prev) => ({
          ...prev,
          latenciesMs: [...prev.latenciesMs.slice(-29), latency],
        }))
      }
    }
    segmentStartMsRef.current = null
  }, [])

  const speech = useSpeechRecognition({
    onPartial: (text) => onPartialTranscript({ text }),
    onFinal: (text) => onCommittedTranscript({ text }),
    onError: (message) => {
      setRecording((prev) => ({ ...prev, error: message }))
      if (connectionStateRef.current !== "idle") {
        speech.stop()
        updateConnectionState("idle")
      }
    },
  })

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
      console.log("[Scribe] Disconnecting...")

      // 1. Update UI state immediately
      updateConnectionState("idle")
      setLocalTranscript("")
      setRecording({ error: "", latenciesMs: [] })
      clearSessionRefs()

      // 2. Disconnect (async, don't wait)
      try {
        speech.stop()
      } catch {
        // Ignore errors
      }

      lastOperationTimeRef.current = now
      return
    }

    // Debounce rapid clicks for CONNECT
    if (timeSinceLastOp < 200) {
      console.log("[Scribe] Ignoring rapid click")
      return
    }
    lastOperationTimeRef.current = now

    // CONNECT
    if (connectionState !== "idle") {
      console.log("[Scribe] Not in idle state, ignoring")
      return
    }

    console.log("[Scribe] Connecting...")
    updateConnectionState("connecting")
    setLocalTranscript("")
    setRecording({ error: "", latenciesMs: [] })
    clearSessionRefs()

    if (!speech.start()) {
      updateConnectionState("idle")
      return
    }
    updateConnectionState("connected")
  }, [clearSessionRefs, connectionState, speech, updateConnectionState])

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

  // Display text: prefer error, then local transcript
  const displayText = recording.error || localTranscript
  const hasContent = Boolean(displayText) && connectionState === "connected"

  return (
    <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center">
      <BackgroundAura
        status={connectionState}
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

          {/* Status text - shown when no content */}
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-opacity duration-250",
              !hasContent ? "opacity-100" : "pointer-events-none opacity-0"
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
                    Realtime Speech to Text
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Speak and watch your words appear as you talk
                  </p>
                </div>

                {recording.error && connectionState === "idle" && (
                  <p
                    role="alert"
                    className="text-center text-sm text-destructive"
                  >
                    {recording.error}
                  </p>
                )}

                <Button
                  onClick={handleToggleRecording}
                  disabled={false}
                  size="lg"
                  className="w-full justify-center gap-3 bg-foreground/95 hover:bg-foreground/90"
                >
                  <span>Start Transcribing</span>
                  <kbd className="hidden h-5 items-center gap-1 rounded border border-background/20 bg-background/10 px-1.5 font-mono text-xs sm:inline-flex">
                    {isMac ? "⌘K" : "Ctrl+K"}
                  </kbd>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <BottomControls
          isConnected={connectionState === "connected"}
          hasError={Boolean(recording.error)}
          isMac={isMac}
          onStop={handleToggleRecording}
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
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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
                "w-full text-xl leading-relaxed font-light text-foreground/90",
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
            <HugeiconsIcon
              icon={Copy01Icon}
              strokeWidth={2}
              className="h-4 w-4"
            />
          </Button>
        )}
      </div>
    )
  }
)
TranscriberTranscript.displayName = "TranscriberTranscript"
