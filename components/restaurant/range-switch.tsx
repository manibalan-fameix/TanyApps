import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const RANGES = [7, 30, 90] as const

export function parseRange(value: string | undefined): (typeof RANGES)[number] {
  const n = Number(value)
  return (RANGES as readonly number[]).includes(n) ? (n as (typeof RANGES)[number]) : 30
}

/** The 7 / 30 / 90 days switch, same look as the motors reports page. */
export function RangeSwitch({ path, days }: { path: string; days: number }) {
  return (
    <div className="flex gap-1 rounded-lg border p-1" role="group" aria-label="Time range">
      {RANGES.map((r) => (
        <Link key={r} href={`${path}?days=${r}`} aria-current={r === days} className={cn(buttonVariants({ size: "sm", variant: r === days ? "default" : "ghost" }))}>
          {r} days
        </Link>
      ))}
    </div>
  )
}
