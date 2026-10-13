"use client"

import Link from "next/link"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export type StatCardProps = {
  icon: IconSvgElement
  label: string
  value: string
  /** Short pill at the bottom right, e.g. "1 draft". */
  pill?: string
  /** 0-100. Shows a slim bar under the value. */
  progress?: number
  href?: string
}

export function StatCard({
  icon,
  label,
  value,
  pill,
  progress,
  href,
}: StatCardProps) {
  return (
    <Card className="relative gap-0 p-5">
      <div className="flex items-start justify-between">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary/10">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <HugeiconsIcon icon={icon} strokeWidth={2} className="size-5" />
          </span>
        </span>
        {href ? (
          <Link
            href={href}
            aria-label={`Open ${label}`}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <HugeiconsIcon
              icon={ArrowUpRight01Icon}
              strokeWidth={2}
              className="size-4"
            />
          </Link>
        ) : null}
      </div>
      <p className="mt-5 text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        {pill ? (
          <Badge
            variant="secondary"
            className="mb-1 rounded-full bg-primary/10 text-primary"
          >
            {pill}
          </Badge>
        ) : null}
      </div>
      {progress != null ? (
        <Progress value={Math.min(100, progress)} className="mt-3" />
      ) : null}
    </Card>
  )
}
