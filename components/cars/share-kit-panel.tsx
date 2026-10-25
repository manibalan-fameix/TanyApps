"use client"

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import { toast } from "@/lib/toast"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowUpRight01Icon,
  Chat01Icon,
  Copy01Icon,
  Download01Icon,
  Facebook01Icon,
  InstagramIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { ShareKit } from "@/lib/cars/publish"
import { copy } from "@/lib/copy"
import { cropPortrait45 } from "@/lib/image/resize"

const t = copy.admin.addCar.done

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t.copied)
  } catch {
    toast.error(text) // clipboard blocked: show the text so it can be copied by hand
  }
}

/** The storage key inside a photo URL, so it can be read through our own origin. */
const keyOf = (url: string) =>
  /dealers\/[0-9a-f-]+\/cars\/[^?#]+/i.exec(url)?.[0] ?? null

async function fetchPhoto(url: string): Promise<Blob> {
  // Our own origin first: R2's public address blocks cross-origin reads unless the bucket has a CORS policy.
  const key = keyOf(url)
  if (key) {
    const res = await fetch(`/api/media/${key}`)
    if (res.ok) return res.blob()
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error("photo unavailable")
  return res.blob()
}

/** 4:5 crops of the listing photos, done on the device so nothing extra is stored or paid for. */
async function buildCarousel(photos: ShareKit["photos"]): Promise<File[]> {
  const files: File[] = []
  for (const [i, p] of photos.entries()) {
    const blob = await cropPortrait45(await fetchPhoto(p.url))
    files.push(
      new File([blob], `car-${String(i + 1).padStart(2, "0")}.jpg`, {
        type: "image/jpeg",
      })
    )
  }
  return files
}

type Source = "whatsapp" | "instagram" | "facebook"

const CHANNELS: { source: Source; icon: typeof Chat01Icon; tone: string }[] = [
  {
    source: "whatsapp",
    icon: Chat01Icon,
    tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  {
    source: "instagram",
    icon: InstagramIcon,
    tone: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  },
  {
    source: "facebook",
    icon: Facebook01Icon,
    tone: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
]

export function ShareKitPanel({
  kit,
  title,
  aside,
}: {
  kit: ShareKit
  title?: string
  aside?: React.ReactNode
}) {
  const [busy, setBusy] = useState<"download" | null>(null)
  // The carousel is prepared as soon as the panel opens. Browsers only allow the share sheet right after a tap,
  // so it cannot be built after the tap without the share being refused.
  const [files, setFiles] = useState<File[] | null>(null)
  const [preparing, setPreparing] = useState(kit.photos.length > 0)
  const [caption, setCaption] = useState(kit.caption)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (kit.photos.length === 0) return
    buildCarousel(kit.photos)
      .then((f) => !cancelled && setFiles(f))
      .catch(() => undefined) // sharing then falls back to the link and caption
      .finally(() => !cancelled && setPreparing(false))
    return () => {
      cancelled = true
    }
  }, [kit.photos])

  const trackedLink = (source: Source) =>
    `${kit.shortLink}?utm_source=${source}`
  // The caption is editable, and every app gets its own tracked copy of the link inside it.
  const messageFor = (source: Source) =>
    caption.includes(kit.shortLink)
      ? caption.split(kit.shortLink).join(trackedLink(source))
      : `${caption}\n\n${trackedLink(source)}`

  async function shareToInstagram() {
    const message = messageFor("instagram")
    const heading = title ?? t.shareText
    try {
      const withFiles: ShareData = {
        title: heading,
        text: message,
        files: files ?? [],
      }
      if (files?.length && navigator.canShare?.(withFiles)) {
        // Instagram takes only the photos from a share and drops the text. Copy the caption first,
        // so it can be pasted into the post.
        const copied = await navigator.clipboard?.writeText(message).then(
          () => true,
          () => false
        )
        if (copied) toast.message(t.captionCopiedForPaste)
        await navigator.share(withFiles)
      } else {
        // Desktop: no share sheet for files. Give them the caption and the photos to post by hand.
        await copyText(message)
        toast.message(t.instagramDesktop)
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      await copyText(message)
    }
  }

  async function shareToWhatsapp() {
    const message = messageFor("whatsapp")
    const heading = title ?? t.shareText
    const fallback = () => {
      // wa.me links can only prefill text, never attach files. Desktop browsers also can't hand
      // files to WhatsApp Desktop via the share sheet, so photos need to be dragged in by hand.
      window.open(
        `https://wa.me/?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer"
      )
      if (files?.length) toast.message(t.whatsappDesktop)
    }
    try {
      const withFiles: ShareData = {
        title: heading,
        text: message,
        files: files ?? [],
      }
      if (files?.length && navigator.canShare?.(withFiles)) {
        await navigator.share(withFiles)
      } else {
        fallback()
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      fallback()
    }
  }

  function onChannel(source: Source) {
    if (source === "instagram") return void shareToInstagram()
    if (source === "whatsapp") return void shareToWhatsapp()
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(trackedLink("facebook"))}&quote=${encodeURIComponent(caption.split(kit.shortLink).join("").trim())}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  async function download() {
    setBusy("download")
    try {
      for (const file of files ?? (await buildCarousel(kit.photos))) {
        const url = URL.createObjectURL(file)
        const a = Object.assign(document.createElement("a"), {
          href: url,
          download: file.name,
        })
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
      }
    } catch {
      toast.error(t.downloadFailed)
    } finally {
      setBusy(null)
    }
  }

  const photo = kit.photos[current]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
            {t.title}
          </CardTitle>
          <CardDescription>{title}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {photo && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative w-full max-w-xs shrink-0 overflow-hidden rounded-2xl bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt=""
                  className="aspect-[4/5] w-full object-cover"
                />
                <span className="absolute top-2 right-2 rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium backdrop-blur">
                  {current + 1} / {kit.photos.length}
                </span>
              </div>
              <ul
                className="flex gap-2 overflow-x-auto sm:max-h-[26rem] sm:flex-col sm:overflow-x-visible sm:overflow-y-auto"
                aria-label={t.carousel}
              >
                {kit.photos.map((p, i) => (
                  <li key={p.angle} className="w-16 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCurrent(i)}
                      aria-label={`${t.photo} ${i + 1}`}
                      aria-current={i === current}
                      className={cn(
                        "block overflow-hidden rounded-lg ring-2 ring-transparent transition",
                        i === current
                          ? "ring-primary"
                          : "opacity-70 hover:opacity-100"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt=""
                        className="aspect-[4/5] w-full object-cover"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="share-caption" className="text-sm font-medium">
                {t.caption}
              </label>
              <div className="flex gap-1">
                {caption !== kit.caption && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCaption(kit.caption)}
                  >
                    <HugeiconsIcon
                      icon={RefreshIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t.reset}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyText(messageFor("instagram"))}
                >
                  <HugeiconsIcon
                    icon={Copy01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t.copy}
                </Button>
              </div>
            </div>
            <Textarea
              id="share-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={9}
              data-testid="caption"
            />
            <p className="text-xs text-muted-foreground">{t.captionHint}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4">
        <Card>
          <CardHeader>
            <CardTitle>{t.shareNow}</CardTitle>
            <CardDescription>{t.shareNowBody}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {preparing && kit.photos.length > 0 && (
              <p className="text-xs text-muted-foreground">{t.preparingHint}</p>
            )}
            {CHANNELS.map(({ source, icon, tone }) => {
              const waitingOnPhotos =
                preparing && kit.photos.length > 0 && source !== "facebook"
              return (
                <button
                  key={source}
                  type="button"
                  onClick={() => onChannel(source)}
                  disabled={waitingOnPhotos}
                  className="group flex items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-content-center rounded-full",
                      tone
                    )}
                  >
                    <HugeiconsIcon
                      icon={icon}
                      strokeWidth={2}
                      className="size-5"
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium">
                      {t.sources[source]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.channelHint[source]}
                    </span>
                  </span>
                  <HugeiconsIcon
                    icon={ArrowUpRight01Icon}
                    strokeWidth={2}
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                </button>
              )
            })}

            <div className="mt-2 flex flex-col gap-2">
              <p className="text-sm font-medium">{t.link}</p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={kit.shortLink}
                  aria-label={t.link}
                  data-testid="short-link"
                  className="h-10"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="outline"
                  onClick={() => copyText(kit.shortLink)}
                >
                  <HugeiconsIcon
                    icon={Copy01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t.copy}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.trackedLinksHint}
              </p>
            </div>

            {kit.photos.length > 0 && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => void download()}
                disabled={busy !== null}
              >
                <HugeiconsIcon
                  icon={Download01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {busy === "download" || (preparing && !files)
                  ? t.preparing
                  : t.download}
              </Button>
            )}
          </CardContent>
        </Card>
        {aside}
      </div>
    </div>
  )
}
