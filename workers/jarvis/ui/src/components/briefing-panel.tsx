import { motion } from "framer-motion"

import type { Facts } from "@/lib/jarvis"
import { cn } from "@/lib/utils"

const HEALTH = {
  on_track: { label: "On track", tone: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  at_risk: { label: "At risk", tone: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  off_track: { label: "Off track", tone: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300" },
} as const

/** The headline of a project briefing: the verdict, how far along the sprint is against the calendar, and the counts that matter. */
export function BriefingPanel({ facts }: { facts: Facts }) {
  const h = HEALTH[facts.health]
  const p = facts.progress
  const chips: { label: string; value: number; warn: boolean }[] = [
    { label: "Overdue", value: facts.counts.overdue, warn: facts.counts.overdue > 0 },
    { label: "Blocked", value: facts.counts.blocked, warn: facts.counts.blocked > 0 },
    { label: "Urgent open", value: facts.counts.urgentOpen, warn: false },
    { label: "Due in 3 days", value: facts.counts.dueSoon, warn: false },
    { label: "Unassigned", value: facts.counts.unassigned, warn: facts.counts.unassigned > 0 },
  ]
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card/80 holo:bg-slate-900/60 holo:border-cyan-400/25 w-full max-w-6xl rounded-xl border p-4 text-left backdrop-blur sm:p-5"
      aria-label="Project status"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-foreground/50 text-xs font-medium tracking-widest uppercase">{facts.today}</p>
          <h2 className="text-lg font-semibold">
            {facts.sprint.name} · day {facts.sprint.dayOf} of {facts.sprint.ofDays} · {facts.sprint.daysLeft} day{facts.sprint.daysLeft === 1 ? "" : "s"} left
          </h2>
        </div>
        <span className={cn("rounded-full border px-3 py-1 text-sm font-medium", h.tone)}>{h.label}</span>
      </header>

      <div className="mt-4">
        <div className="text-foreground/70 mb-1 flex flex-wrap justify-between gap-2 text-xs">
          <span>{p.doneTasks} of {p.totalTasks} tasks done · {p.donePoints} of {p.totalPoints} points</span>
          <span>{p.actualPct}% done · calendar {p.expectedPct}% elapsed</span>
        </div>
        <div className="bg-foreground/10 relative h-2.5 overflow-hidden rounded-full" role="progressbar" aria-valuenow={p.actualPct} aria-valuemin={0} aria-valuemax={100}>
          <motion.div className={cn("h-full rounded-full", facts.health === "off_track" ? "bg-red-400" : facts.health === "at_risk" ? "bg-amber-400" : "bg-emerald-400")} initial={{ width: 0 }} animate={{ width: `${Math.max(2, p.actualPct)}%` }} transition={{ duration: 0.8 }} />
          <span className="bg-foreground/70 absolute inset-y-0 w-0.5" style={{ left: `${p.expectedPct}%` }} title="Where the calendar says we should be" />
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap gap-2">
        {chips.map((c) => (
          <li key={c.label} className={cn("rounded-lg border px-3 py-1.5 text-sm", c.warn ? "border-red-500/40 text-red-700 dark:text-red-300" : "border-foreground/15 text-foreground/80")}>
            <span className="font-semibold tabular-nums">{c.value}</span> <span className="text-foreground/60">{c.label}</span>
          </li>
        ))}
      </ul>
    </motion.section>
  )
}
