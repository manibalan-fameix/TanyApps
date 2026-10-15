import { useEffect, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"

import { TaskCard } from "@/components/task-card"
import type { Group } from "@/lib/cards"
import { cn } from "@/lib/utils"

/** The cards on screen. Groups are columns on a wide screen and stacked sections on a phone. */
export function CardView({ groups, highlight, wall, focusPerson = null }: { groups: Group[]; highlight: number[]; wall: boolean; focusPerson?: string | null }) {
  const root = useRef<HTMLDivElement>(null)

  // Bring the card Jarvis is talking about into view, centred in the pane, but only when it is not already fully visible.
  useEffect(() => {
    const first = highlight[0]
    if (first == null) return
    const el = root.current?.querySelector<HTMLElement>(`[data-card="${first}"]`)
    const pane = el?.closest<HTMLElement>("[data-pane]")
    if (!el || !pane) return
    const a = el.getBoundingClientRect(), b = pane.getBoundingClientRect()
    if (a.top < b.top + 16 || a.bottom > b.bottom - 16) el.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [highlight])

  const spotlight = highlight.length > 0

  if (!groups.length) return null
  let index = 0
  return (
    <div ref={root} className="w-full" aria-live="polite">
      <AnimatePresence mode="popLayout">
        <div className={wall ? "grid gap-5 @xl:grid-cols-2 @4xl:grid-cols-3" : "grid gap-5"}>
          {groups.map((group, g) => (
            <motion.section key={group.label || `g${g}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
              {group.label && (
                <h2
                  className={cn(
                    "flex items-baseline gap-2 text-xs font-medium tracking-widest uppercase transition-colors",
                    focusPerson && group.label.toLowerCase() === focusPerson.toLowerCase() ? "text-cyan-600 dark:text-cyan-300" : "text-foreground/60"
                  )}
                  data-focus={focusPerson && group.label.toLowerCase() === focusPerson.toLowerCase() ? "true" : undefined}
                >
                  {group.label}
                  {group.note && <span className="text-foreground/40 tracking-normal normal-case">{group.note}</span>}
                </h2>
              )}
              <div className={wall ? "flex flex-col gap-3" : "flex flex-wrap justify-center gap-4 [&>*]:w-full sm:[&>*]:w-[21rem]"}>
                {group.items.map((card) => (
                  <TaskCard key={card.n} card={card} index={index++} highlighted={highlight.includes(card.n)} dimmed={spotlight && !highlight.includes(card.n)} compact={wall} />
                ))}
              </div>
            </motion.section>
          ))}
        </div>
      </AnimatePresence>
    </div>
  )
}
