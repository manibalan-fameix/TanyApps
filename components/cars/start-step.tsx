"use client"

import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  Car01Icon,
  Folder01Icon,
  LockIcon,
  Mic01Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { copy } from "@/lib/copy"
import { cn } from "@/lib/utils"

const t = copy.admin.addCar.start

function Option({
  icon,
  title,
  body,
  onClick,
  href,
  testId,
  locked,
}: {
  icon: typeof Car01Icon
  title: string
  body: string
  onClick?: () => void
  href?: string
  testId?: string
  locked?: string
}) {
  const inner = (
    <>
      <span className="flex size-24 shrink-0 items-center justify-center rounded-2xl bg-muted">
        <HugeiconsIcon
          icon={icon}
          strokeWidth={1.5}
          className="size-10 text-muted-foreground"
        />
      </span>
      <span className="flex flex-1 flex-col gap-1 text-left">
        <span className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          {title}
          {locked ? (
            <Badge variant="secondary" className="h-6 gap-1 px-2.5">
              <HugeiconsIcon icon={LockIcon} strokeWidth={2} />
              {locked}
            </Badge>
          ) : null}
        </span>
        <span className="text-muted-foreground">{body}</span>
      </span>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        strokeWidth={2}
        className="size-5 shrink-0 text-muted-foreground"
      />
    </>
  )
  const cls = cn(
    "flex w-full items-center gap-6 rounded-3xl border border-border bg-card p-6 transition-colors hover:bg-muted/50",
    locked && "opacity-80"
  )
  return href ? (
    <Link href={href} className={cls} data-testid={testId}>
      {inner}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={cls}
      data-testid={testId}
    >
      {inner}
    </button>
  )
}

export function StartStep({
  onNew,
  onVideo,
  onVoice,
  voiceLocked,
}: {
  onNew: () => void
  onVideo: () => void
  onVoice: () => void
  voiceLocked: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <Option
        icon={Car01Icon}
        title={t.newTitle}
        body={t.newBody}
        onClick={onNew}
        testId="start-new"
      />
      {voiceLocked ? (
        // Voice entry is a Growth-and-above feature: the option stays visible and leads to the plans.
        <Option
          icon={Mic01Icon}
          title={t.voiceTitle}
          body={t.voiceLockedBody}
          href="/settings/billing"
          testId="start-voice-locked"
          locked={t.voiceLockedBadge}
        />
      ) : (
        <Option
          icon={Mic01Icon}
          title={t.voiceTitle}
          body={t.voiceBody}
          onClick={onVoice}
          testId="start-voice"
        />
      )}
      <Option
        icon={Video01Icon}
        title={t.videoTitle}
        body={t.videoBody}
        onClick={onVideo}
        testId="start-video"
      />
      <Option
        icon={Folder01Icon}
        title={t.continueTitle}
        body={t.continueBody}
        href="/cars"
        testId="start-continue"
      />
    </div>
  )
}
