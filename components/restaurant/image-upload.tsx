"use client"

import { useRef, useState } from "react"
import { ImageUpload01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "@/lib/toast"

import { requestImageUpload } from "@/app/(admin)/(shell)/menu/actions"
import { Button } from "@/components/ui/button"
import { resizeToJpeg } from "@/lib/image/resize"
import type { ImageKind } from "@/lib/restaurant/images"
import { cn } from "@/lib/utils"

const MAX_EDGE = 1280

/**
 * Picks a photo, shrinks it in the browser (which also strips location data), uploads it to the restaurant's own
 * storage, and reports the finished address. Nothing is saved on the dish until the form is saved.
 */
export function ImageUpload({
  value,
  onChange,
  kind,
  label,
  wide,
  requestUpload,
}: {
  value: string
  onChange: (url: string) => void
  kind: ImageKind
  label: string
  /** Wide preview for banners. */
  wide?: boolean
  /** Asks the server where to PUT the photo. Defaults to the restaurant action; other verticals pass their own. */
  requestUpload?: () => Promise<{ ok: true; url: string; method: string; headers: Record<string, string>; publicUrl: string } | { ok: false; error: string }>
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function pick(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith("image/")) return toast.error("Choose an image file.")
    setBusy(true)
    const upload = async () => {
      const { blob } = await resizeToJpeg(file, MAX_EDGE)
      const target = await (requestUpload ? requestUpload() : requestImageUpload(kind))
      if (!target.ok) throw new Error(target.error)
      const res = await fetch(target.url, { method: target.method, headers: target.headers, body: blob })
      if (!res.ok) throw new Error("Upload failed.")
      onChange(target.publicUrl)
    }
    try {
      await toast.promise(upload, {
        loading: { title: "Uploading photo…" },
        success: { title: "Photo uploaded." },
        error: (e) => ({ title: e instanceof Error && e.message ? e.message : "Could not upload that photo. Try another." }),
      })
    } catch {
      // the error toast above already told the user
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted", wide ? "h-16 w-32" : "size-20")}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="size-full object-cover" />
        ) : (
          <HugeiconsIcon icon={ImageUpload01Icon} className="size-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploading..." : value ? `Change ${label}` : `Upload ${label}`}
        </Button>
        {value && !busy ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            Remove
          </Button>
        ) : null}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={`Choose ${label}`}
          onChange={(e) => {
            void pick(e.target.files?.[0])
            e.target.value = ""
          }}
        />
      </div>
    </div>
  )
}
