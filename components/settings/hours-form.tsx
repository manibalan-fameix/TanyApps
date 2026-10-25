"use client"

import { useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import { saveHours } from "@/app/(admin)/(shell)/settings/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DAYS, HOURS_PRESETS } from "@/lib/dealers/onboard"
import type { BusinessHours, DayKey } from "@/lib/hours"

const FALLBACK = { open: "10:00", close: "19:00" }

export function HoursForm({
  initial,
  disabled,
}: {
  initial: BusinessHours | null
  disabled?: boolean
}) {
  const [hours, setHours] = useState<BusinessHours>(initial ?? {})
  const [pending, start] = useTransition()
  const ref = Object.values(hours)[0] ?? FALLBACK

  const setDay = (day: DayKey, on: boolean) =>
    setHours((h) => {
      const next = { ...h }
      if (on) next[day] = ref
      else delete next[day]
      return next
    })
  const setTimes = (open: string, close: string) =>
    setHours(
      (h) =>
        Object.fromEntries(
          Object.keys(h).map((d) => [d, { open, close }])
        ) as BusinessHours
    )

  const submit = () =>
    start(async () => {
      const res = await saveHours(hours)
      if (res.ok) toast.success("Business hours saved.")
      else toast.error(res.error)
    })

  return (
    <div className="grid max-w-lg gap-5">
      <div className="flex flex-wrap gap-2">
        {HOURS_PRESETS.map((p) => (
          <Button
            key={p.label}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              setHours(
                Object.fromEntries(
                  p.days.map((d) => [d, { open: p.open, close: p.close }])
                ) as BusinessHours
              )
            }
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-2">
        <Label>Days you are open</Label>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Days you are open"
        >
          {DAYS.map((d) => {
            const on = Boolean(hours[d.key])
            return (
              <Button
                key={d.key}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => setDay(d.key, !on)}
              >
                {d.label}
              </Button>
            )
          })}
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Opening times</Label>
        <div className="flex items-center gap-2">
          <Input
            type="time"
            aria-label="Opens at"
            value={ref.open}
            disabled={disabled}
            onChange={(e) => setTimes(e.target.value, ref.close)}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="time"
            aria-label="Closes at"
            value={ref.close}
            disabled={disabled}
            onChange={(e) => setTimes(ref.open, e.target.value)}
          />
        </div>
      </div>
      <div>
        <Button
          onClick={submit}
          disabled={disabled || pending || Object.keys(hours).length === 0}
        >
          {pending ? "Saving..." : "Save hours"}
        </Button>
      </div>
    </div>
  )
}
