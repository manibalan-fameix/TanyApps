import { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"

import { speechFraction } from "@/lib/jarvis"
import { annotate, focusAt, type Kind } from "@/lib/entities"
import { sentenceRanges, wordAt, wordsOf } from "@/lib/karaoke"
import { cn } from "@/lib/utils"

const kindCache = new Map<string, (Kind | null)[]>()
function kindsFor(text: string, team: string[], titles: string[]): (Kind | null)[] {
  const key = `${team.length}|${titles.length}|${text}`
  let kinds = kindCache.get(key)
  if (!kinds) { kinds = annotate(text, { team, titles }); if (kindCache.size > 300) kindCache.clear(); kindCache.set(key, kinds) }
  return kinds
}

/**
 * What Jarvis is saying, shown as it is said: each sentence appears when its voice starts, and the word being spoken is lit
 * up as the audio plays. Sentences not yet spoken are not on screen at all.
 */
/** A subtle colour for the important things in the text. Light and dark themes each get a shade that reads well. */
const KIND: Record<Kind, string> = {
  task: "text-sky-700/90 dark:text-sky-300/90",
  name: "font-medium text-foreground underline decoration-cyan-500/30 decoration-dotted underline-offset-4",
  person: "text-violet-700/90 dark:text-violet-300/90",
  date: "text-amber-700/90 dark:text-amber-200/90",
  figure: "font-medium text-foreground tabular-nums",
  bad: "text-red-700/90 dark:text-red-300/90",
  warn: "text-amber-700/90 dark:text-amber-300/90",
  good: "text-emerald-700/90 dark:text-emerald-300/90",
}

export function SpokenText({ pieces, live, compact = false, team = [], titles = [], onFocus }: { pieces: string[]; live: boolean; compact?: boolean; team?: string[]; titles?: string[]; onFocus?: (focus: { task: number | null; person: string | null }) => void }) {
  const last = pieces.length - 1
  const words = useMemo(() => wordsOf(pieces[last] ?? ""), [pieces, last])
  const [word, setWord] = useState(0)
  const tail = useRef<HTMLDivElement>(null)

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

  // Tell the screen what is being talked about right now, so the matching card (and teammate column) can light up in step.
  const lastFocus = useRef("")
  useEffect(() => {
    if (!onFocus) return
    const f = live ? focusAt(words.map((w) => w.text), kindsFor(pieces[last] ?? "", team, titles), word) : { task: null, person: null }
    const key = `${last}|${f.task ?? ""}|${f.person ?? ""}` // the sentence number is part of the key: a new sentence starts clear, so the same task again must light up again
    if (key !== lastFocus.current) { lastFocus.current = key; onFocus(f) }
  }, [live, word, words, last, pieces, team, titles, onFocus])

  // Keep the sentence being spoken in view.
  useEffect(() => { tail.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }) }, [last])

  return (
    <div className={cn("leading-relaxed font-light", compact ? "w-full text-left text-base sm:text-lg 2xl:text-xl" : "max-w-3xl text-center text-lg sm:text-xl")} aria-live="off">
      {pieces.map((text, i) => {
        const active = live && i === last
        const ws = active ? words : wordsOf(text)
        const kinds = kindsFor(text, team, titles)
        return (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} ref={i === last ? tail : undefined} data-sentence={i} data-active={active || undefined}>
            {/* Every sentence starts on a new line, with a little space between them, so the text is easy to follow. */}
            {sentenceRanges(ws).map(([from, to]) => (
              <p key={from} className="mb-3 last:mb-3">
                {ws.slice(from, to).map((w, j) => {
                  const k = from + j
                  return (
                    <span
                      key={k}
                      data-word={active ? (k <= word ? (k === word ? "now" : "said") : "next") : undefined}
                      data-kind={kinds[k] ?? undefined}
                      className={cn(
                        "transition-colors duration-150",
                        kinds[k] ? KIND[kinds[k]!] : active ? (k < word ? "text-foreground/90" : k > word ? "text-foreground/35" : "") : live ? "text-foreground/65" : "text-foreground/90",
                        active && k > word && kinds[k] && "opacity-40",
                        active && k === word && "rounded bg-cyan-400/20 px-0.5",
                        !active && live && kinds[k] && "opacity-80"
                      )}
                    >
                      {w.text}{" "}
                    </span>
                  )
                })}
              </p>
            ))}
          </motion.div>
        )
      })}
    </div>
  )
}
