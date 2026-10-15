import { useEffect, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"

import { TaskCard } from "@/components/task-card"
import type { Group } from "@/lib/cards"

/** The cards on screen. Groups are columns on a wide screen and stacked sections on a phone. */
export function CardView({ groups, highlight, wall }: { groups: Group[]; highlight: number[]; wall: boolean }) {
  const root = useRef<HTMLDivElement>(null)

  // Bring the card Jarvis is talking about into view.
  useEffect(() => {
    const first = highlight[0]
    if (first == null) return
    root.current?.querySelector(`[data-card="${first}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
  }, [highlight])

  if (!groups.length) return null
  let index = 0
  return (
    <div ref={root} className="w-full" aria-live="polite">
      <AnimatePresence mode="popLayout">
        <div className={wall ? "grid gap-5 @xl:grid-cols-2 @4xl:grid-cols-3" : "grid gap-5"}>
          {groups.map((group, g) => (
            <motion.section key={group.label || `g${g}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
              {group.label && (
                <h2 className="text-foreground/60 flex items-baseline gap-2 text-xs font-medium tracking-widest uppercase">
                  {group.label}
                  {group.note && <span className="text-foreground/40 tracking-normal normal-case">{group.note}</span>}
                </h2>
              )}
              <div className={wall ? "flex flex-col gap-3" : "flex flex-wrap justify-center gap-4 [&>*]:w-full sm:[&>*]:w-[21rem]"}>
                {group.items.map((card) => (
                  <TaskCard key={card.n} card={card} index={index++} highlighted={highlight.includes(card.n)} compact={wall} />
                ))}
              </div>
            </motion.section>
          ))}
        </div>
      </AnimatePresence>
    </div>
  )
}
