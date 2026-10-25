"use client"

import { useRouter } from "next/navigation"
import { useCallback, useRef, useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import { requestDocumentUpload } from "@/lib/cabs/admin-actions"
import type { Fail } from "@/lib/cabs/admin-actions"
import { EXPIRY_LABEL, type ExpiryStatus } from "@/lib/cabs/expiry"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DOC_TYPES, MAX_DOC_BYTES } from "@/lib/media/documents"
import { cn } from "@/lib/utils"

type ActionResult = { ok: true } | Fail

/**
 * Runs a server action and handles the answer the same way everywhere: a toast for success or failure, field errors handed back to
 * the form, a prompt to upgrade when a plan limit was hit, and a refresh of the page's data.
 */
export function useAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const run = useCallback(
    <R extends ActionResult>(fn: () => Promise<R>, opts: { success?: string; confirm?: string; onOk?: (r: Extract<R, { ok: true }>) => void } = {}) => {
      if (opts.confirm && !window.confirm(opts.confirm)) return
      start(async () => {
        setFieldErrors({})
        const res = await fn()
        if (res.ok) {
          if (opts.success) toast.success(opts.success)
          opts.onOk?.(res as Extract<R, { ok: true }>)
          router.refresh()
          return
        }
        setFieldErrors(res.fieldErrors ?? {})
        if (res.upgrade) toast.error(res.error, { action: { label: "See plans", onClick: () => router.push("/settings/billing") }, duration: 10_000 })
        else toast.error(res.error)
      })
    },
    [router],
  )
  return { run, pending, fieldErrors }
}

/** A text field that shows the server's complaint about it. */
export function TextField({ id, label, value, onChange, error, hint, ...rest }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string } & Omit<React.ComponentProps<typeof Input>, "id" | "value" | "onChange">) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} value={value} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} {...rest} />
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  )
}

/** Rupees as typed ("14.50"). The server turns it into paise. */
export function MoneyField({ id, label, value, onChange, error, hint, optional }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; optional?: boolean }) {
  return (
    <TextField
      id={id}
      label={optional ? `${label} (optional)` : label}
      value={value}
      onChange={(v) => onChange(v.replace(/[^\d.]/g, ""))}
      error={error}
      hint={hint}
      inputMode="decimal"
      placeholder="0"
    />
  )
}

export function SelectField({ id, label, value, onChange, options, error, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; error?: string; placeholder?: string }) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select items={options} value={value} onValueChange={(v) => onChange(String(v ?? ""))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder ?? "Choose…"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  )
}

const TONE: Record<ExpiryStatus, "secondary" | "destructive" | "default" | "outline"> = { none: "outline", expired: "destructive", soon: "default", ok: "secondary" }
const TONE_CLASS: Record<ExpiryStatus, string> = { none: "text-muted-foreground", expired: "", soon: "bg-amber-500/15 text-amber-700 dark:text-amber-300", ok: "" }

/** Expired (red), expiring within 30 days (amber), valid, or no expiry. */
export function ExpiryBadge({ status, className }: { status: ExpiryStatus; className?: string }) {
  return (
    <Badge variant={TONE[status]} className={cn(TONE_CLASS[status], className)}>
      {EXPIRY_LABEL[status]}
    </Badge>
  )
}

/** "3 expired", "2 expiring soon" or nothing, for a list row. */
export function ExpirySummary({ expired, soon, total }: { expired: number; soon: number; total: number }) {
  if (total === 0) return <span className="text-muted-foreground">No documents</span>
  return (
    <span className="flex flex-wrap gap-1">
      {expired > 0 ? <Badge variant="destructive">{expired} expired</Badge> : null}
      {soon > 0 ? <Badge className={TONE_CLASS.soon}>{soon} expiring soon</Badge> : null}
      {expired === 0 && soon === 0 ? <Badge variant="secondary">{total} valid</Badge> : null}
    </span>
  )
}

/** Picks a PDF or photo, sends it to private storage, and reports the key to save with the record. */
export function DocumentUpload({ kind, value, onChange, error, disabled }: { kind: "vehicle-doc" | "driver-doc"; value: string; onChange: (key: string) => void; error?: string; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState("")

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const target = await requestDocumentUpload(kind, file.type, file.size)
      if (!target.ok) throw new Error(target.error)
      const res = await fetch(target.url, { method: target.method, headers: target.headers, body: file })
      if (!res.ok) throw new Error(res.status === 415 ? "That file does not look like a PDF or a photo." : res.status === 413 ? "That file is too large." : "Upload failed. Try again.")
      setName(file.name)
      onChange(target.key)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Could not upload that file.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel>Scan or photo (optional)</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy || disabled} onClick={() => input.current?.click()}>
          {busy ? "Uploading…" : value ? "Replace file" : "Choose file"}
        </Button>
        {value ? (
          <>
            <span className="max-w-48 truncate text-sm text-muted-foreground">{name || "File attached"}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(""); setName("") }}>
              Remove
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">PDF, JPG, PNG or WebP, up to {MAX_DOC_BYTES / 1024 / 1024} MB</span>
        )}
        <input ref={input} type="file" accept={DOC_TYPES.join(",")} className="sr-only" aria-label="Choose a document file" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = "" }} />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  )
}

/** A link to a stored document, served only to the business that owns it. */
export function FileLink({ fileKey }: { fileKey: string | null }) {
  if (!fileKey) return <span className="text-muted-foreground">No file</span>
  return (
    <a href={`/api/cabs/files/${fileKey}`} target="_blank" rel="noreferrer" className="text-sm font-medium underline">
      View
    </a>
  )
}

export const istDateTime = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso))

/** A <input type="datetime-local"> value is a wall-clock time with no zone; in TanyCabs that clock is India's. */
export const localToIst = (v: string) => (v ? `${v.length === 16 ? `${v}:00` : v}+05:30` : "")
