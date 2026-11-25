"use client"

import { useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import { requestTableBooking, sendEnquiry, submitReview } from "@/app/(tenant)/sites/[dealer]/actions"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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

export function ReviewForm({ code }: { code: string }) {
  const [pending, start] = useTransition()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const [done, setDone] = useState(false)
  if (done) return <p className="rounded-xl border p-4 text-center text-sm">Thanks for your review!</p>
  return (
    <div className="grid gap-3 rounded-xl border p-4">
      <p className="font-medium">How was your order?</p>
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
      <Button
        type="button"
        disabled={pending || rating === 0}
        onClick={() =>
          start(async () => {
            const res = await submitReview({ code, rating, comment })
            if (res.ok) setDone(true)
            else toast.error(res.error)
          })
        }
      >
        Submit review
      </Button>
    </div>
  )
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
