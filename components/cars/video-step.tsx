"use client"

import { useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Video01Icon } from "@hugeicons/core-free-icons"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { copy } from "@/lib/copy"
import { extractFromVideo, VideoReadError } from "@/lib/video/client-extract"

const t = copy.admin.addCar.video
const MAX_BYTES = 500 * 1024 * 1024

type Phase =
  { kind: "idle" } | { kind: "frames"; pct: number } | { kind: "sending" }

/** Upload a creator/walkaround video. The browser pulls out frames and audio; the server reads them and starts a prefilled draft. */
export function VideoStep({
  onRead,
}: {
  onRead: (r: { carId: string; hint: string }) => void | Promise<void>
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const busy = phase.kind !== "idle"

  async function read(file: File) {
    setError(null)
    if (
      !file.type.startsWith("video/") &&
      !/\.(mp4|mov|m4v|webm)$/i.test(file.name)
    )
      return setError(t.notVideo)
    if (file.size > MAX_BYTES) return setError(t.tooBig)
    setName(file.name)
    try {
      setPhase({ kind: "frames", pct: 0 })
      const { frames, audio } = await extractFromVideo(file, (p) =>
        setPhase({ kind: "frames", pct: Math.round(p * 100) })
      )

      setPhase({ kind: "sending" })
      const body = new FormData()
      body.set("frameCount", String(frames.length))
      frames.forEach((f, i) => body.set(`frame${i}`, f, `f${i}.jpg`))
      if (audio) body.set("audio", audio, "audio.wav")
      const res = await fetch("/api/cars/from-video", { method: "POST", body })
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean
        carId?: string
        hint?: string
        error?: string
      } | null
      if (!res.ok || !json?.ok || !json.carId) {
        return setError(
          json?.error === "not_read"
            ? t.notRead
            : json?.error === "no_ai"
              ? t.noAi
              : json?.error === "rate_limited"
                ? t.rateLimited
                : t.failed
        )
      }
      await onRead({ carId: json.carId, hint: json.hint ?? "" })
    } catch (e) {
      setError(e instanceof VideoReadError ? t.unreadable : t.failed)
    } finally {
      setPhase({ kind: "idle" })
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <label
          className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-8 text-center ${busy ? "" : "cursor-pointer hover:bg-muted/50"}`}
        >
          <input
            ref={input}
            type="file"
            accept="video/mp4,video/quicktime,video/*"
            data-testid="video-file-input"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ""
              if (f) void read(f)
            }}
          />
          <HugeiconsIcon
            icon={Video01Icon}
            strokeWidth={1.5}
            className="size-12 text-muted-foreground"
          />
          <span className="text-sm font-medium">
            {busy ? name : name ? t.another : t.choose}
          </span>
          <span className="text-sm text-muted-foreground">{t.hint}</span>
        </label>

        {busy && (
          <div className="flex flex-col gap-2" aria-live="polite">
            <p className="text-sm font-medium">
              {phase.kind === "sending" ? t.phases.sending : t.phases.frames}
            </p>
            <Progress value={phase.kind === "frames" ? phase.pct : 100} />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <p className="text-sm text-muted-foreground">{t.privacy}</p>
        {error && (
          <Button variant="outline" onClick={() => input.current?.click()}>
            {t.another}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
