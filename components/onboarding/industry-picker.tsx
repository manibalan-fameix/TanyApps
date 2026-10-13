"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle01Icon,
  Car01Icon,
  Restaurant01Icon,
} from "@hugeicons/core-free-icons"

import { type IndustryKey, industryList } from "@/lib/industries"
import { cn } from "@/lib/utils"

const ICONS: Record<IndustryKey, typeof Car01Icon> = {
  motors: Car01Icon,
  restaurants: Restaurant01Icon,
}

/** Radio-style cards: the choice decides the labels, preview and tools the rest of onboarding uses. */
export function IndustryPicker({
  value,
  onChange,
}: {
  value: IndustryKey
  onChange: (key: IndustryKey) => void
}) {
  return (
    <div role="radiogroup" aria-label="Industry" className="grid gap-3">
      {industryList.map((industry) => {
        const selected = value === industry.key
        return (
          <button
            key={industry.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(industry.key)}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted/50",
              selected && "border-primary bg-primary/5 ring-1 ring-primary"
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <HugeiconsIcon icon={ICONS[industry.key]} className="size-5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium">{industry.label}</span>
              <span className="text-sm text-muted-foreground">
                {industry.blurb}
              </span>
            </span>
            {selected ? (
              <HugeiconsIcon
                icon={CheckmarkCircle01Icon}
                className="size-5 shrink-0 text-primary"
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
