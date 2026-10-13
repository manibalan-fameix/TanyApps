import { redirect } from "next/navigation"

import { RealtimeTranscriber01 } from "@/components/blocks/realtime-transcriber-01"
import { getDealerContext } from "@/lib/auth/context"

export const metadata = { title: "Speech to text" }

export default async function TranscribePage() {
  // Part of the voice feature: Growth and above.
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || !ctx.plan.voiceEntry) redirect("/settings/billing")

  return (
    <div className="h-[calc(100svh-6rem)]">
      <RealtimeTranscriber01 />
    </div>
  )
}
