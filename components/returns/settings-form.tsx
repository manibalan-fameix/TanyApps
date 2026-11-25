"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { saveReturnSettings } from "@/lib/restaurant/admin-actions"
import { MAX_QUICK_REPLIES, type ReturnReason, type ReturnSettings, reasonLabel, windowHoursFor } from "@/lib/returns/rules"
import { toast } from "@/lib/toast"

export function ReturnSettingsForm({ initial, categories, reasons, industry, disabled }: { initial: ReturnSettings; categories: { id: string; name: string }[]; reasons: ReturnReason[]; industry: string; disabled: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [defaultHours, setDefaultHours] = useState(String(initial.defaultWindowHours))
  const [hours, setHours] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial.categoryHours).map(([k, v]) => [k, String(v)])))
  const [blocked, setBlocked] = useState(new Set(initial.blockedCategories))
  const [offered, setOffered] = useState(new Set(initial.reasons))
  const [photos, setPhotos] = useState(new Set(initial.photoReasons))
  const [replyHours, setReplyHours] = useState(String(initial.replyHours))
  const [quick, setQuick] = useState(initial.quickReplies.join("\n"))
  const [policy, setPolicy] = useState(initial.policy)

  const flip = <T,>(set: Set<T>, value: T, on: boolean) => {
    const next = new Set(set)
    if (on) next.add(value)
    else next.delete(value)
    return next
  }
  const fallback = Number(defaultHours) || initial.defaultWindowHours

  const save = () =>
    startTransition(async () => {
      const result = await saveReturnSettings({
        enabled,
        defaultWindowHours: Number(defaultHours),
        categoryHours: Object.fromEntries(categories.filter((c) => (hours[c.id] ?? "").trim() !== "").map((c) => [c.id, Number(hours[c.id])])),
        blockedCategories: categories.filter((c) => blocked.has(c.id)).map((c) => c.id),
        reasons: [...offered],
        photoReasons: [...photos],
        replyHours: Number(replyHours),
        quickReplies: quick.split("\n").map((s) => s.trim()).filter(Boolean),
        policy,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Return settings saved")
      router.refresh()
    })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <fieldset disabled={disabled || pending} className="grid gap-6">
        <Field orientation="horizontal" className="rounded-2xl border p-4">
          <div className="grid flex-1 gap-1">
            <FieldLabel htmlFor="returns-on">Take return requests</FieldLabel>
            <FieldDescription>Signed-in customers can report a problem from their order. Conversations already open stay open if you switch this off.</FieldDescription>
          </div>
          <Switch id="returns-on" checked={enabled} onCheckedChange={setEnabled} />
        </Field>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="default-hours">Hours to report a problem</FieldLabel>
            <Input id="default-hours" type="number" min={1} max={1440} required value={defaultHours} onChange={(e) => setDefaultHours(e.target.value)} className="max-w-40" />
            <FieldDescription>Counted from delivery or pickup. 72 hours is 3 days. Fresh and chilled food gets 24 hours unless you set it below.</FieldDescription>
          </Field>
        </FieldGroup>

        {categories.length > 0 ? (
          <FieldSet>
            <FieldLegend>Categories</FieldLegend>
            <FieldDescription>Leave the hours empty to use the figure shown.</FieldDescription>
            <ul className="divide-y rounded-2xl border">
              {categories.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="min-w-40 flex-1 font-medium">{c.name}</span>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    aria-label={`Hours for ${c.name}`}
                    placeholder={String(windowHoursFor(c, { ...initial, categoryHours: {}, defaultWindowHours: fallback }, industry))}
                    value={hours[c.id] ?? ""}
                    disabled={blocked.has(c.id)}
                    onChange={(e) => setHours((h) => ({ ...h, [c.id]: e.target.value }))}
                    className="w-24"
                  />
                  <label className="flex items-center gap-2">
                    <Checkbox checked={blocked.has(c.id)} onCheckedChange={(on) => setBlocked((s) => flip(s, c.id, on === true))} />
                    Can&apos;t be returned
                  </label>
                </li>
              ))}
            </ul>
          </FieldSet>
        ) : null}

        <FieldSet>
          <FieldLegend>Reasons</FieldLegend>
          <FieldDescription>A missing item never needs a photo.</FieldDescription>
          <ul className="divide-y rounded-2xl border">
            {reasons.map((r) => (
              <li key={r} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <label className="flex min-w-48 flex-1 items-center gap-2 font-medium">
                  <Checkbox checked={offered.has(r)} onCheckedChange={(on) => setOffered((s) => flip(s, r, on === true))} />
                  {reasonLabel(r, industry)}
                </label>
                {r !== "missing_item" ? (
                  <label className="flex items-center gap-2">
                    <Checkbox checked={photos.has(r)} disabled={!offered.has(r)} onCheckedChange={(on) => setPhotos((s) => flip(s, r, on === true))} />
                    Photo required
                  </label>
                ) : null}
              </li>
            ))}
          </ul>
        </FieldSet>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="reply-hours">You usually reply within (hours)</FieldLabel>
            <Input id="reply-hours" type="number" min={1} max={168} required value={replyHours} onChange={(e) => setReplyHours(e.target.value)} className="max-w-40" />
            <FieldDescription>Customers are told this. After it passes, the chat offers them a Call button and you are reminded.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="quick-replies">Quick replies</FieldLabel>
            <Textarea id="quick-replies" rows={5} value={quick} onChange={(e) => setQuick(e.target.value)} />
            <FieldDescription>One per line, up to {MAX_QUICK_REPLIES}.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="return-policy">Return policy shown to customers</FieldLabel>
            <Textarea id="return-policy" rows={4} maxLength={1000} value={policy} onChange={(e) => setPolicy(e.target.value)} />
          </Field>
        </FieldGroup>

        <Button type="submit" className="w-fit" disabled={disabled || pending}>{pending ? "Saving…" : "Save"}</Button>
      </fieldset>
    </form>
  )
}
