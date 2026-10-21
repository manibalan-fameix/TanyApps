"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { BubbleChatIcon } from "@hugeicons/core-free-icons"

import { ChatPanel, type ChatHandoff } from "@/components/chat/chat-panel"
import { type ChatScope } from "@/components/chat/use-tenant-chat"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { copy } from "@/lib/copy"

const t = copy.tenant.chat

export function ChatWidget({
  scope,
  greeting,
  questions,
  handoff,
}: {
  scope: ChatScope
  greeting: string
  questions: readonly string[]
  handoff?: ChatHandoff | null
}) {
  return (
    <Sheet>
      <SheetTrigger
        className="fixed right-4 bottom-24 z-40 flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105 max-md:bottom-[calc(5rem+var(--safe-area-inset-bottom))] sm:right-6"
        aria-label={t.openLabel}
      >
        <HugeiconsIcon
          icon={BubbleChatIcon}
          strokeWidth={2}
          className="size-5"
        />
        <span className="hidden sm:inline">{t.openLabel}</span>
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle>{t.title}</SheetTitle>
        </SheetHeader>
        <ChatPanel
          scope={scope}
          greeting={greeting}
          questions={questions}
          handoff={handoff}
        />
      </SheetContent>
    </Sheet>
  )
}
