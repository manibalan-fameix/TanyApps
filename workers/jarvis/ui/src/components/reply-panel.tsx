import { motion } from "framer-motion"

import type { SlackReply } from "@/lib/jarvis"

/** Replies teammates sent on Slack to messages Jarvis sent for you. */
export function ReplyPanel({ replies, onSeen }: { replies: SlackReply[]; onSeen: (ids: string[]) => void }) {
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full rounded-xl border border-emerald-400/50 bg-emerald-950/30 p-4 text-left backdrop-blur sm:p-5" aria-label="Slack replies" data-replies>
      <header className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-widest text-emerald-700 uppercase dark:text-emerald-300">Slack replies</p>
        <button type="button" onClick={() => onSeen(replies.map((r) => r.id))} className="border-foreground/20 rounded-lg border px-3 py-1 text-xs font-medium transition-opacity hover:opacity-80">Got it</button>
      </header>
      <ul className="mt-3 space-y-3">
        {replies.map((r) => (
          <li key={r.id} className="text-sm leading-relaxed">
            <p className="font-medium">{r.from}{r.about ? ` · task #${r.about}` : ""}</p>
            <p className="text-foreground/90">{r.text}</p>
            <p className="text-foreground/50 mt-0.5 text-xs">replying to: “{r.asked}”</p>
          </li>
        ))}
      </ul>
    </motion.section>
  )
}
