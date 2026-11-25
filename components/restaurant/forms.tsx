"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import { requestReviewVideoUpload, requestTableBooking, sendEnquiry, submitReview, submitShopReview } from "@/app/(tenant)/sites/[dealer]/actions"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { resizeToJpeg } from "@/lib/image/resize"
import { MAX_REVIEW_PHOTOS, MAX_REVIEW_VIDEO_BYTES, REVIEW_VIDEO_TYPES } from "@/lib/restaurant/review-media"
import { cn } from "@/lib/utils"

export function EnquiryForm() {
  const [pending, start] = useTransition()
  const [sent, setSent] = useState(false)
  const [v, setV] = useState({ name: "", phone: "", message: "" })
  const [err, setErr] = useState<{ field?: string; message: string } | null>(null)
  if (sent) return <p className="rounded-xl border p-6 text-center text-sm">Thank you. We will get back to you soon.</p>
  const bad = (f: string) => (err?.field === f ? err.message : undefined)
  return (
    <FieldGroup>
      <Field data-invalid={Boolean(bad("name"))}>
        <FieldLabel htmlFor="en-name">Your name</FieldLabel>
        <Input id="en-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        {bad("name") ? <FieldError>{bad("name")}</FieldError> : null}
      </Field>
      <Field data-invalid={Boolean(bad("phone"))}>
        <FieldLabel htmlFor="en-phone">Mobile number</FieldLabel>
        <Input id="en-phone" inputMode="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        {bad("phone") ? <FieldError>{bad("phone")}</FieldError> : null}
      </Field>
      <Field data-invalid={Boolean(bad("message"))}>
        <FieldLabel htmlFor="en-msg">Message</FieldLabel>
        <Textarea id="en-msg" rows={4} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} />
        {bad("message") ? <FieldError>{bad("message")}</FieldError> : null}
      </Field>
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null)
            const res = await sendEnquiry(v)
            if (res.ok) setSent(true)
            else {
              setErr({ field: res.field, message: res.error })
              if (!res.field) toast.error(res.error)
            }
          })
        }
      >
        {pending ? "Sending..." : "Send message"}
      </Button>
    </FieldGroup>
  )
}

type Attachment = { id: string; type: "image" | "video"; url: string; preview: string }

/** The photos and the video a customer adds to a review: picked, shrunk (photos), uploaded straight away, shown with a remove button. */
function MediaPicker({ items, onChange, onBusy }: { items: Attachment[]; onChange: (next: Attachment[] | ((cur: Attachment[]) => Attachment[])) => void; onBusy: (delta: number) => void }) {
  const photoInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const photos = items.filter((i) => i.type === "image")
  const video = items.find((i) => i.type === "video")
  const maxMb = Math.round(MAX_REVIEW_VIDEO_BYTES / 1024 / 1024)

  async function addPhotos(files: FileList | null) {
    const room = MAX_REVIEW_PHOTOS - photos.length
    const picked = [...(files ?? [])].filter((f) => f.type.startsWith("image/")).slice(0, room)
    if ((files?.length ?? 0) > room) toast.error(`You can add up to ${MAX_REVIEW_PHOTOS} photos.`)
    await Promise.all(
      picked.map(async (file) => {
        onBusy(1)
        try {
          const { blob } = await resizeToJpeg(file, 1280)
          const id = crypto.randomUUID()
          const res = await fetch(`/api/t/review-upload?id=${id}`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob })
          const data = (await res.json().catch(() => null)) as { ok: boolean; url?: string; error?: string } | null
          if (!res.ok || !data?.ok || !data.url) throw new Error(data?.error || "Could not upload that photo.")
          onChange((cur) => [...cur, { id, type: "image", url: data.url!, preview: URL.createObjectURL(blob) }])
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not upload that photo.")
        } finally {
          onBusy(-1)
        }
      }),
    )
  }

  async function addVideo(file: File | undefined) {
    if (!file || video) return
    if (!(REVIEW_VIDEO_TYPES as readonly string[]).includes(file.type)) return toast.error("Add an MP4, MOV or WebM video.")
    if (file.size > MAX_REVIEW_VIDEO_BYTES) return toast.error(`The video must be under ${maxMb} MB.`)
    onBusy(1)
    try {
      const target = await requestReviewVideoUpload({ contentType: file.type, size: file.size })
      if (!target.ok) throw new Error(target.error)
      const res = await fetch(target.url, { method: target.method, headers: target.headers, body: file })
      if (!res.ok) throw new Error("The video did not upload. Try again.")
      onChange((cur) => [...cur, { id: crypto.randomUUID(), type: "video", url: target.publicUrl, preview: URL.createObjectURL(file) }])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The video did not upload. Try again.")
    } finally {
      onBusy(-1)
    }
  }

  const remove = (it: Attachment) => {
    URL.revokeObjectURL(it.preview)
    onChange((cur) => cur.filter((x) => x.id !== it.id))
  }

  return (
    <div className="grid gap-2">
      {items.length ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((it) => (
            <li key={it.id} className="relative size-16 overflow-hidden rounded-lg border bg-muted">
              {it.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.preview} alt="" className="size-full object-cover" />
              ) : (
                <video src={it.preview} muted playsInline preload="metadata" className="size-full object-cover" />
              )}
              {it.type === "video" ? <span className="absolute bottom-0.5 left-0.5 rounded bg-foreground px-1 text-[10px] font-semibold text-background">Video</span> : null}
              <button type="button" aria-label={`Remove ${it.type}`} onClick={() => remove(it)} className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-foreground text-xs leading-none text-background">
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={photos.length >= MAX_REVIEW_PHOTOS} onClick={() => photoInput.current?.click()}>
          Add photos ({photos.length}/{MAX_REVIEW_PHOTOS})
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={Boolean(video)} onClick={() => videoInput.current?.click()}>
          Add video (up to {maxMb} MB)
        </Button>
        <input ref={photoInput} type="file" accept="image/*" multiple className="sr-only" aria-label="Choose photos" onChange={(e) => { void addPhotos(e.target.files); e.target.value = "" }} />
        <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" aria-label="Choose a video" onChange={(e) => { void addVideo(e.target.files?.[0]); e.target.value = "" }} />
      </div>
    </div>
  )
}

/** Stars and a comment box, and (when `media` is on) photos and a video. `onSubmit` does the saving; `heading` and `thanks` are the words around it. */
function RatingBox({ heading, thanks, media = false, onSubmit }: { heading: string; thanks: string; media?: boolean; onSubmit: (v: { rating: number; comment: string; media: { type: "image" | "video"; url: string }[] }) => Promise<{ ok: true } | { ok: false; error: string }> }) {
  const [pending, start] = useTransition()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const [done, setDone] = useState(false)
  const [items, setItems] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(0)
  if (done) return <p className="rounded-xl border p-4 text-center text-sm">{thanks}</p>
  return (
    <div className="grid gap-3 rounded-xl border p-4">
      <p className="font-medium">{heading}</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            className={cn("size-9 rounded-md border text-lg", n <= rating ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            ★
          </button>
        ))}
      </div>
      <Textarea aria-label="Your review" rows={3} placeholder="Tell us more (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {media ? <MediaPicker items={items} onChange={setItems} onBusy={(d) => setUploading((n) => n + d)} /> : null}
      <Button
        type="button"
        disabled={pending || rating === 0 || uploading > 0}
        onClick={() =>
          start(async () => {
            const res = await onSubmit({ rating, comment, media: items.map(({ type, url }) => ({ type, url })) })
            if (res.ok) setDone(true)
            else toast.error(res.error)
          })
        }
      >
        {uploading > 0 ? "Uploading…" : "Submit review"}
      </Button>
    </div>
  )
}

/** A review of one completed order. */
export function ReviewForm({ code, media = false }: { code: string; media?: boolean }) {
  return <RatingBox heading="How was your order?" thanks="Thanks for your review!" media={media} onSubmit={(v) => submitReview({ code, ...v })} />
}

/** A review of the shop itself, from the Reviews tab. Held for the owner's approval. */
export function ShopReviewForm() {
  return <RatingBox heading="Rate this shop" thanks="Thanks! Your review will show once the shop approves it." media onSubmit={(v) => submitShopReview(v)} />
}

/** Ask for a table: who, how many, when. The restaurant calls back to confirm. */
export function TableBookingForm() {
  const [pending, start] = useTransition()
  const [sent, setSent] = useState(false)
  const [v, setV] = useState({ name: "", phone: "", guests: "2", date: "", time: "", note: "" })
  const [err, setErr] = useState<{ field?: string; message: string } | null>(null)
  if (sent) return <p className="rounded-xl border p-6 text-center text-sm">Thank you. We have your request and will call to confirm your table.</p>
  const bad = (f: string) => (err?.field === f ? err.message : undefined)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  return (
    <FieldGroup>
      <Field data-invalid={Boolean(bad("name"))}>
        <FieldLabel htmlFor="tb-name">Your name</FieldLabel>
        <Input id="tb-name" value={v.name} onChange={set("name")} />
        {bad("name") ? <FieldError>{bad("name")}</FieldError> : null}
      </Field>
      <Field data-invalid={Boolean(bad("phone"))}>
        <FieldLabel htmlFor="tb-phone">Mobile number</FieldLabel>
        <Input id="tb-phone" inputMode="tel" value={v.phone} onChange={set("phone")} />
        {bad("phone") ? <FieldError>{bad("phone")}</FieldError> : null}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field data-invalid={Boolean(bad("date"))}>
          <FieldLabel htmlFor="tb-date">Date</FieldLabel>
          <Input id="tb-date" type="date" value={v.date} onChange={set("date")} />
          {bad("date") ? <FieldError>{bad("date")}</FieldError> : null}
        </Field>
        <Field data-invalid={Boolean(bad("time"))}>
          <FieldLabel htmlFor="tb-time">Time</FieldLabel>
          <Input id="tb-time" type="time" value={v.time} onChange={set("time")} />
          {bad("time") ? <FieldError>{bad("time")}</FieldError> : null}
        </Field>
      </div>
      <Field data-invalid={Boolean(bad("guests"))}>
        <FieldLabel htmlFor="tb-guests">Guests</FieldLabel>
        <Input id="tb-guests" type="number" inputMode="numeric" min={1} max={20} value={v.guests} onChange={set("guests")} />
        {bad("guests") ? <FieldError>{bad("guests")}</FieldError> : null}
      </Field>
      <Field data-invalid={Boolean(bad("note"))}>
        <FieldLabel htmlFor="tb-note">Anything we should know? (optional)</FieldLabel>
        <Textarea id="tb-note" rows={3} value={v.note} onChange={set("note")} />
        {bad("note") ? <FieldError>{bad("note")}</FieldError> : null}
      </Field>
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null)
            const res = await requestTableBooking({ ...v, guests: Number(v.guests) })
            if (res.ok) setSent(true)
            else {
              setErr({ field: res.field, message: res.error })
              if (!res.field) toast.error(res.error)
            }
          })
        }
      >
        {pending ? "Sending..." : "Request a table"}
      </Button>
    </FieldGroup>
  )
}
