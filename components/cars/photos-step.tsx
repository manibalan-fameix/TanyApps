"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  Camera01Icon,
  CheckmarkCircle02Icon,
  Refresh01Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons"

import { CameraSession } from "@/components/capture/camera-session"
import { useUploads } from "@/components/capture/upload-provider"
import { useCarSync } from "@/components/cars/use-car-sync"
import { FooterAction } from "@/components/cars/wizard-shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { CAR_ANGLES, HERO_ANGLE, type CarAngle } from "@/lib/angles"
import type { CarState } from "@/lib/cars/state"
import { isLanded } from "@/lib/cars/readiness"
import { copy } from "@/lib/copy"
import { readVideoMeta, type Resized } from "@/lib/image/resize"
import { cn } from "@/lib/utils"

const t = copy.admin.addCar.photos
const total = CAR_ANGLES.length

export function PhotosStep({
  car,
  onCarChange,
  onNext,
}: {
  car: CarState
  onCarChange: (c: CarState) => void
  onNext: () => void
}) {
  const uploads = useUploads()
  const [session, setSession] = useState<CarAngle[] | null>(null)
  // Local previews show instantly, before the upload lands. The ref mirrors state only for cleanup.
  const [previews, setPreviews] = useState<Partial<Record<CarAngle, string>>>(
    {}
  )
  const previewsRef = useRef(previews)
  const mine = uploads.items(car.id)

  useEffect(() => {
    previewsRef.current = previews
  }, [previews])
  useEffect(
    () => () =>
      Object.values(previewsRef.current).forEach((url) =>
        URL.revokeObjectURL(url)
      ),
    []
  )

  useCarSync(car, onCarChange)
  const video = car.media.find((m) => m.kind === "video")

  const byAngle = useMemo(() => {
    const landed = new Set(
      car.media
        .filter((m) => m.kind === "photo" && m.angle && isLanded(m))
        .map((m) => m.angle as CarAngle)
    )
    const inQueue = new Map<CarAngle, (typeof mine)[number]>()
    for (const i of mine)
      if (i.kind === "photo" && i.angle) inQueue.set(i.angle, i)
    return CAR_ANGLES.map((angle) => {
      const q = inQueue.get(angle)
      // `state` keeps its three-way meaning for the rest of the screen; `phase` tells a waiting file from one in flight.
      const phase =
        q?.state === "failed"
          ? "failed"
          : q?.state === "uploading"
            ? "uploading"
            : q && q.state !== "done"
              ? "queued"
              : landed.has(angle) || q?.state === "done"
                ? "done"
                : "empty"
      const state = phase === "queued" ? "uploading" : phase
      const server = car.media.find(
        (m) => m.kind === "photo" && m.angle === angle
      )
      return {
        angle,
        state,
        phase,
        progress: q?.progress ?? 0,
        error: q?.error,
        src:
          previews[angle] ?? (server && isLanded(server) ? server.url : null),
      }
    })
  }, [car.media, mine, previews])

  const uploaded = byAngle.filter((b) => b.state === "done").length
  const pending = byAngle.filter((b) => b.state === "uploading").length
  const failed = byAngle.filter((b) => b.state === "failed").length
  const inFlight = byAngle.filter((b) => b.phase === "uploading").length
  const waiting = byAngle.filter((b) => b.phase === "queued").length
  const missing = byAngle.filter((b) => b.state === "empty").map((b) => b.angle)

  function onShot(angle: CarAngle, shot: Resized) {
    const old = previewsRef.current[angle]
    if (old) URL.revokeObjectURL(old)
    setPreviews((p) => ({ ...p, [angle]: URL.createObjectURL(shot.blob) }))
    void uploads.enqueue({
      id: crypto.randomUUID(),
      carId: car.id,
      kind: "photo",
      angle,
      contentType: "image/jpeg",
      blob: shot.blob,
      width: shot.width,
      height: shot.height,
    })
  }

  async function onVideo(file: File) {
    const meta = await readVideoMeta(file).catch(() => null)
    const contentType = ["video/mp4", "video/quicktime", "video/webm"].includes(
      file.type
    )
      ? file.type
      : "video/mp4"
    await uploads.enqueue({
      id: crypto.randomUUID(),
      carId: car.id,
      kind: "video",
      contentType,
      blob: file,
      width: meta?.width,
      height: meta?.height,
      durationSec: meta?.durationSec,
    })
  }

  const videoItem = mine.find((i) => i.kind === "video")
  const videoState =
    videoItem && videoItem.state !== "done"
      ? "uploading"
      : video
        ? video.status === "ready"
          ? "ready"
          : video.status === "failed"
            ? "failed"
            : "processing"
        : null
  const analysis = video?.analysis
  const photoMissingLabels = missing.map((a) => copy.admin.angles[a].label)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span
                className="font-medium"
                aria-live="polite"
                data-testid="upload-count"
              >
                {t.uploaded(uploaded, total)}
              </span>
              {!uploads.online && (
                <span className="text-muted-foreground">{t.waiting}</span>
              )}
            </div>
            <Progress value={(uploaded / total) * 100} />
            {(pending > 0 || failed > 0) && (
              <p
                className="text-xs text-muted-foreground"
                data-testid="upload-summary"
              >
                {t.status.summary(uploaded, inFlight, waiting, failed)}
              </p>
            )}
          </div>

          {failed > 0 && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between gap-3">
                {t.failed}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void uploads.retryFailed(car.id)}
                >
                  {t.retry}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <Button
            size="lg"
            onClick={() =>
              setSession(missing.length ? missing : [...CAR_ANGLES])
            }
          >
            <HugeiconsIcon
              icon={Camera01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {uploaded === 0 && pending === 0 ? t.start : t.continueCapture}
          </Button>

          <ul
            className="grid grid-cols-3 gap-2 sm:grid-cols-4"
            data-testid="angle-grid"
          >
            {byAngle.map(({ angle, state, phase, progress, error, src }) => (
              <li key={angle} className="relative">
                <button
                  type="button"
                  onClick={() => setSession([angle])}
                  aria-label={`${copy.admin.angles[angle].label}: ${state === "empty" ? t.take : t.retake}`}
                  data-state={state}
                  data-phase={phase}
                  data-angle={angle}
                  className={cn(
                    "relative flex aspect-[4/3] w-full flex-col items-center justify-end overflow-hidden rounded-xl border bg-muted text-xs",
                    state === "empty"
                      ? "border-dashed border-border"
                      : "border-transparent",
                    state === "failed" && "border-destructive"
                  )}
                >
                  {src && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt=""
                      className={cn(
                        "absolute inset-0 size-full object-cover",
                        phase !== "done" && phase !== "empty" && "opacity-60"
                      )}
                    />
                  )}
                  {angle === HERO_ANGLE && (
                    <Badge className="absolute top-1 left-1">{t.cover}</Badge>
                  )}
                  {phase !== "empty" && (
                    <span
                      role="status"
                      title={phase === "failed" ? error : undefined}
                      className={cn(
                        "absolute top-1 right-1 flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium",
                        phase === "done" && "text-success",
                        phase === "failed" && "text-destructive"
                      )}
                    >
                      {phase === "done" && (
                        <HugeiconsIcon
                          icon={CheckmarkCircle02Icon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                      )}
                      {phase === "failed" && (
                        <HugeiconsIcon
                          icon={Alert02Icon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                      )}
                      {phase === "uploading" && (
                        <span
                          aria-hidden
                          className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                        />
                      )}
                      {phase === "done"
                        ? t.status.uploaded
                        : phase === "failed"
                          ? t.status.failed
                          : phase === "uploading"
                            ? t.status.uploading(Math.round(progress * 100))
                            : uploads.online
                              ? t.status.queued
                              : t.waiting.split(".")[0]}
                    </span>
                  )}
                  <span className="relative w-full truncate bg-background/80 px-1.5 py-1 text-center font-medium backdrop-blur-sm">
                    {copy.admin.angles[angle].label}
                  </span>
                  {phase === "uploading" && (
                    <span
                      className="absolute inset-x-0 bottom-0 h-1 bg-foreground/10"
                      aria-hidden
                    >
                      <span
                        className="block h-full bg-primary transition-[width]"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </span>
                  )}
                </button>
                {phase === "failed" && (
                  <Button
                    size="xs"
                    variant="destructive"
                    className="absolute bottom-8 left-1"
                    onClick={() => void uploads.retryFailed(car.id)}
                  >
                    <HugeiconsIcon
                      icon={Refresh01Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t.status.retryOne}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Video01Icon}
              strokeWidth={2}
              className="size-5"
            />
            {t.video.title}
          </CardTitle>
          <CardDescription>{t.video.body}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="inline-flex w-fit">
            <input
              type="file"
              accept="video/*"
              capture="environment"
              data-testid="video-file-input"
              className="sr-only"
              disabled={videoState === "uploading"}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ""
                if (f) void onVideo(f)
              }}
            />
            <span className="inline-flex h-9 cursor-pointer items-center rounded-4xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">
              {video ? t.video.replace : t.video.add}
            </span>
          </label>

          {videoState === "uploading" && (
            <div className="flex flex-col gap-1.5" role="status">
              <p className="text-sm text-muted-foreground">
                {videoItem?.state === "uploading"
                  ? t.status.uploading(
                      Math.round((videoItem.progress ?? 0) * 100)
                    )
                  : uploads.online
                    ? t.status.queued
                    : t.waiting}
              </p>
              <Progress value={(videoItem?.progress ?? 0) * 100} />
            </div>
          )}
          {videoItem?.state === "failed" && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between gap-3">
                {t.status.failed}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void uploads.retryFailed(car.id)}
                >
                  {t.retry}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {videoState === "processing" && (
            <p className="text-sm text-muted-foreground">
              {t.video.processing}
            </p>
          )}
          {videoState === "ready" && (
            <p className="text-sm font-medium">{t.video.ready}</p>
          )}

          {analysis && (
            <div
              className="flex flex-col gap-1 text-sm"
              data-testid="video-analysis"
            >
              <p className="font-medium">
                {t.video.covers(
                  CAR_ANGLES.length - analysis.missing.length,
                  CAR_ANGLES.length
                )}
              </p>
              {analysis.missing.length > 0 && (
                <p className="text-muted-foreground">
                  {t.video.notShown}{" "}
                  {analysis.missing
                    .map((a) => copy.admin.angles[a as CarAngle]?.label ?? a)
                    .join(", ")}
                </p>
              )}
              <p className="text-muted-foreground">
                {photoMissingLabels.length
                  ? `${t.video.photosNeeded} ${photoMissingLabels.join(", ")}`
                  : t.video.allPhotos}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <FooterAction>
        <Button size="lg" onClick={onNext}>
          {copy.admin.addCar.next}
        </Button>
      </FooterAction>

      {session && (
        <CameraSession
          angles={session}
          onShot={onShot}
          onClose={() => setSession(null)}
        />
      )}
    </div>
  )
}
