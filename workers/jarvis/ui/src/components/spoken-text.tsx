import { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"

import { speechFraction } from "@/lib/jarvis"
import { wordAt, wordsOf } from "@/lib/karaoke"
import { cn } from "@/lib/utils"

/**
 * What Jarvis is saying, shown as it is said: each sentence appears when its voice starts, and the word being spoken is lit
 * up as the audio plays. Sentences not yet spoken are not on screen at all.
 */
export function SpokenText({ pieces, live, compact = false }: { pieces: string[]; live: boolean; compact?: boolean }) {
  const last = pieces.length - 1
  const words = useMemo(() => wordsOf(pieces[last] ?? ""), [pieces, last])
  const [word, setWord] = useState(0)
  const tail = useRef<HTMLSpanElement>(null)

  // Follow the voice: read how far through the sentence it is on every frame, and re-render only when the word changes.
  useEffect(() => {
    if (!live) return
    let frame = 0
    const tick = () => {
      const f = speechFraction()
      if (f !== null) setWord((w) => { const next = wordAt(words, f); return next === w ? w : next })
      frame = requestAnimationFrame(tick)
    }
    setWord(0)
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [live, words, last])

  // Keep the sentence being spoken in view.
  useEffect(() => { tail.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }) }, [last])

  return (
    <p className={cn("leading-relaxed font-light", compact ? "w-full text-left text-base sm:text-lg 2xl:text-xl" : "max-w-3xl text-center text-lg sm:text-xl")} aria-live="off">
      {pieces.map((text, i) => {
        const active = live && i === last
        return (
          <motion.span key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="inline" ref={i === last ? tail : undefined} data-sentence={i} data-active={active || undefined}>
            {active
              ? words.map((w, k) => (
                  <span
                    key={k}
                    data-word={k <= word ? (k === word ? "now" : "said") : "next"}
                    className={cn(
                      "transition-colors duration-150",
                      k < word && "text-foreground/90",
                      k === word && "rounded bg-cyan-400/20 px-0.5 text-cyan-600 dark:text-cyan-200",
                      k > word && "text-foreground/35"
                    )}
                  >
                    {w.text}{" "}
                  </span>
                ))
              : <span className={cn(live ? "text-foreground/65" : "text-foreground/90")}>{text} </span>}
          </motion.span>
        )
      })}
    </p>
  )
}
