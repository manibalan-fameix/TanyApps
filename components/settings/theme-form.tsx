"use client"

import { useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import { saveTheme } from "@/app/(admin)/(shell)/settings/actions"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { PALETTES, RADIUS_KEYS } from "@/lib/dealers/onboard"
import {
  type DealerTheme,
  RADIUS_OPTIONS,
  readableOn,
} from "@/lib/theme/tokens"
import { cn } from "@/lib/utils"

const RADIUS_LABEL = {
  none: "Square",
  sm: "Soft",
  md: "Rounded",
  lg: "Round",
} as const

export function ThemeForm({
  initial,
  disabled,
}: {
  initial: DealerTheme
  disabled?: boolean
}) {
  const [primary, setPrimary] = useState(initial.primary)
  const [accent, setAccent] = useState(initial.accent)
  const [radius, setRadius] = useState(initial.radius)
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      const res = await saveTheme({
        primary,
        primaryForeground: readableOn(primary),
        accent,
        radius,
      })
      if (res.ok) toast.success(res.note ?? "Theme saved.")
      else toast.error(res.error)
    })

  return (
    <div className="grid max-w-lg gap-5">
      <div className="grid gap-2">
        <Label>Brand colour</Label>
        <div className="flex flex-wrap items-center gap-2">
          {PALETTES.map((p) => (
            <button
              key={p.name}
              type="button"
              title={p.name}
              aria-label={p.name}
              aria-pressed={primary === p.primary}
              disabled={disabled}
              onClick={() => {
                setPrimary(p.primary)
                setAccent(p.accent)
              }}
              className={cn(
                "size-9 rounded-full border-2 border-transparent",
                primary === p.primary &&
                  "ring-2 ring-ring ring-offset-2 ring-offset-background"
              )}
              style={{ backgroundColor: p.primary }}
            />
          ))}
          <label className="ml-1 flex items-center gap-2 text-sm text-muted-foreground">
            Custom
            <input
              type="color"
              aria-label="Custom brand colour"
              value={primary}
              disabled={disabled}
              onChange={(e) => setPrimary(e.target.value)}
              className="size-9 cursor-pointer rounded-md border bg-transparent p-0.5"
            />
          </label>
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Accent colour</Label>
        <input
          type="color"
          aria-label="Accent colour"
          value={accent}
          disabled={disabled}
          onChange={(e) => setAccent(e.target.value)}
          className="size-9 cursor-pointer rounded-md border bg-transparent p-0.5"
        />
      </div>
      <div className="grid gap-2">
        <Label>Corner style</Label>
        <div className="flex gap-2" role="group" aria-label="Corner style">
          {RADIUS_KEYS.map((r) => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant={radius === r ? "default" : "outline"}
              aria-pressed={radius === r}
              disabled={disabled}
              onClick={() => setRadius(r)}
            >
              {RADIUS_LABEL[r]}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Preview</Label>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-9 items-center px-4 text-sm font-medium"
            style={{
              backgroundColor: primary,
              color: readableOn(primary),
              borderRadius: RADIUS_OPTIONS[radius],
            }}
          >
            Book a test drive
          </span>
          <span
            className="inline-flex h-9 items-center px-4 text-sm font-medium"
            style={{
              backgroundColor: accent,
              color: readableOn(accent),
              borderRadius: RADIUS_OPTIONS[radius],
            }}
          >
            Accent
          </span>
        </div>
      </div>
      <div>
        <Button onClick={submit} disabled={disabled || pending}>
          {pending ? "Saving..." : "Save theme"}
        </Button>
      </div>
    </div>
  )
}
