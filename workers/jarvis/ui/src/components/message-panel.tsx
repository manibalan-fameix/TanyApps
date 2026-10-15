import { motion } from "framer-motion"

import type { SlackMsg } from "@/lib/jarvis"

/** The Slack message Jarvis has drafted, waiting for a yes. Send and Cancel here do the same as saying so. */
export function MessagePanel({
  message,
  status,
  error,
  onSend,
  onCancel,
}: {
  message: SlackMsg
  status: "idle" | "sending" | "error"
  error: string
  onSend: () => void
  onCancel: () => void
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-xl border border-cyan-400/50 bg-cyan-950/30 p-4 text-left shadow-[0_0_30px_rgba(34,211,238,0.18)] backdrop-blur sm:p-5"
      aria-label="Draft Slack message"
      data-message
    >
      <p className="text-xs font-medium tracking-widest text-cyan-700 uppercase dark:text-cyan-300">Slack message · not sent yet</p>
      <p className="text-foreground/50 mt-2 text-xs">To</p>
      <p className="font-medium">{message.to === "channel" ? "The team channel" : message.to}</p>
      <p className="text-foreground/50 mt-3 text-xs">Message</p>
      <p className="text-foreground/90 mt-1 text-sm leading-relaxed">{message.text}</p>
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-300" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onSend} disabled={status === "sending"} className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow transition-opacity hover:opacity-90 disabled:opacity-50">
          {status === "sending" ? "Sending…" : "Send on Slack"}
        </button>
        <button type="button" onClick={onCancel} disabled={status === "sending"} className="border-foreground/20 rounded-lg border px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50">
          Cancel
        </button>
        <span className="text-foreground/50 text-xs">or say “yes” to send it, or tell me what to change</span>
      </div>
    </motion.section>
  )
}
