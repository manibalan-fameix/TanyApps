import React, { useState } from "react"
import { motion } from "framer-motion"

import { daysUntil } from "@/lib/cards"
import type { CardItem } from "@/lib/jarvis"
import { cn } from "@/lib/utils"

const REPO = "https://github.com/manibalan-fameix/TanyApps/issues"

const PROJECT: Record<string, { name: string; dot: string }> = {
  TanyCars: { name: "TanyCars", dot: "bg-cyan-400" },
  TanyEats: { name: "TanyEats", dot: "bg-amber-400" },
  TanyApps: { name: "TanyApps", dot: "bg-violet-400" },
}

const PRIORITY: Record<string, string> = {
  Urgent: "border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-300",
  High: "border-orange-500/50 bg-orange-500/10 text-orange-600 dark:text-orange-300",
  Normal: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  Low: "border-foreground/20 bg-foreground/5 text-foreground/60",
}

function dueLabel(card: CardItem): { text: string; tone: string } | null {
  if (!card.open) return { text: "Done", tone: "text-emerald-600 dark:text-emerald-300" }
  const d = daysUntil(card.due)
  if (d === null) return null
  if (d < 0) return { text: `${-d} day${d === -1 ? "" : "s"} overdue`, tone: "text-red-600 dark:text-red-300" }
  if (d === 0) return { text: "Due today", tone: "text-orange-600 dark:text-orange-300" }
  return { text: `Due in ${d} day${d === 1 ? "" : "s"}`, tone: d <= 3 ? "text-orange-600 dark:text-orange-300" : "text-foreground/60" }
}

/** One task: what it is in plain words, who has it, how big, how urgent. Tap it to see the three steps. */
export const TaskCard = React.memo(function TaskCard({
  card,
  index,
  highlighted,
  dimmed = false,
  compact,
}: {
  card: CardItem
  index: number
  highlighted: boolean
  /** Another card is being talked about: step back so the one in focus stands out. */
  dimmed?: boolean
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const project = PROJECT[card.project]
  const due = dueLabel(card)
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: dimmed ? 0.42 : 1, y: 0, scale: highlighted ? 1.045 : 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.45, delay: Math.min(index, 8) * 0.07, type: "spring", stiffness: 140, damping: 18 }}
      data-card={card.n}
      data-highlighted={highlighted || undefined}
      className={cn(
        "task-card bg-card/80 text-card-foreground relative flex cursor-pointer flex-col gap-2 rounded-xl border p-4 text-left backdrop-blur transition-shadow",
        "holo:bg-slate-900/60 holo:border-cyan-400/25",
        highlighted
          ? "z-10 border-cyan-300/90 bg-cyan-950/70 ring-2 ring-cyan-300 shadow-[0_0_48px_rgba(34,211,238,0.65)] dark:bg-cyan-950/70"
          : "shadow-sm holo:shadow-[0_0_18px_rgba(34,211,238,0.10)]",
        dimmed && "saturate-50",
        card.blocked && "border-red-500/50",
        !card.open && "opacity-70"
      )}
      onClick={() => setOpen((v) => !v)}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v) } }}
    >
      {highlighted && (
        <span className="absolute -top-2.5 left-4 flex items-center gap-1.5 rounded-full bg-cyan-300 px-2.5 py-0.5 text-[10px] font-semibold tracking-widest text-slate-950 uppercase" data-now>
          <span className="flex h-2.5 items-end gap-0.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <motion.span key={i} className="w-0.5 rounded-full bg-slate-950" animate={{ height: ["30%", "100%", "40%"] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }} />
            ))}
          </span>
          Talking about this
        </span>
      )}
      <header className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", project?.dot ?? "bg-foreground/40")} aria-hidden />
          <span className="text-foreground/60 font-mono">#{card.n}</span>
          <span className="text-foreground/50">{project?.name}</span>
        </span>
        <span className={cn("rounded-full border px-2 py-0.5 font-medium", PRIORITY[card.priority] ?? PRIORITY.Normal)}>{card.priority || "Normal"}</span>
      </header>

      <h3 className={cn("leading-snug font-semibold transition-colors", compact ? "text-sm" : "text-base", highlighted && "text-cyan-100")}>{card.title}</h3>
      {!compact && <p className="text-foreground/70 line-clamp-3 text-sm leading-relaxed">{card.summary}</p>}

      {open && (
        <ol className="text-foreground/80 mt-1 list-decimal space-y-1 pl-5 text-sm">
          {card.steps.map((step, i) => <li key={i}>{step}</li>)}
          <li className="list-none">
            <a href={`${REPO}/${card.n}`} target="_blank" rel="noopener noreferrer" className="text-cyan-600 underline-offset-2 hover:underline dark:text-cyan-300" onClick={(e) => e.stopPropagation()}>
              Open on GitHub
            </a>
          </li>
        </ol>
      )}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
        <span className="flex items-center gap-1" aria-label={`Assigned to ${card.team.join(", ") || "nobody"}`}>
          {card.team.length ? card.team.map((p) => (
            <span key={p} title={p} className="bg-foreground/10 flex size-6 items-center justify-center rounded-full font-semibold">{p[0]}</span>
          )) : <span className="text-foreground/40">Unassigned</span>}
          <span className="text-foreground/50 ml-1">{card.team.join(", ")}</span>
        </span>
        <span className="flex items-center gap-3">
          {card.blocked && <span className="font-medium text-red-600 dark:text-red-300">Blocked</span>}
          {due && <span className={due.tone}>{due.text}</span>}
          <span className="text-foreground/50">{card.points} pt{card.points === 1 ? "" : "s"}</span>
        </span>
      </footer>
    </motion.article>
  )
})
