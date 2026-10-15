import { motion } from "framer-motion"

import { dueText } from "@/lib/format"
import type { Draft } from "@/lib/jarvis"
import { cn } from "@/lib/utils"

const PRIORITY: Record<string, string> = {
  Urgent: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300",
  High: "border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  Normal: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  Low: "border-foreground/20 bg-foreground/5 text-foreground/60",
}

/**
 * The task Jarvis has drafted from what was said, waiting for a yes. Create and Cancel here do the same as saying so.
 * Nothing exists on GitHub until Create is pressed or the user says yes.
 */
export function DraftPanel({
  draft,
  status,
  error,
  onCreate,
  onCancel,
}: {
  draft: Draft
  status: "idle" | "creating" | "error"
  error: string
  onCreate: () => void
  onCancel: () => void
}) {
  const facts: [string, string][] = [
    ["Assignee", draft.assignee ?? "Unassigned"],
    ["Points", String(draft.points)],
    ["Due", draft.due ? dueText(draft.due) : "No date"],
    ["Sprint", draft.sprint],
    ["Project", draft.project],
    ["Epic", draft.epic],
  ]
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-xl border border-cyan-400/50 bg-cyan-950/30 p-4 text-left shadow-[0_0_30px_rgba(34,211,238,0.18)] backdrop-blur sm:p-5"
      aria-label="Draft task"
      data-draft
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-widest text-cyan-700 uppercase dark:text-cyan-300">Draft task · not created yet</p>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", PRIORITY[draft.priority] ?? PRIORITY.Normal)}>{draft.priority}</span>
      </header>
      <h2 className="mt-2 text-lg leading-snug font-semibold">{draft.title}</h2>
      <p className="text-foreground/70 mt-1 text-sm leading-relaxed">{draft.summary}</p>
      <ol className="text-foreground/80 mt-3 list-decimal space-y-1 pl-5 text-sm">
        {draft.steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-foreground/50 text-xs">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-300" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onCreate}
          disabled={status === "creating"}
          className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {status === "creating" ? "Creating…" : "Create task"}
        </button>
        <button type="button" onClick={onCancel} disabled={status === "creating"} className="border-foreground/20 rounded-lg border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50">
          Cancel
        </button>
        <span className="text-foreground/50 text-xs">or say “yes” to create it, or tell me what to change</span>
      </div>
    </motion.section>
  )
}
