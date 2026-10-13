"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { AiChatIcon, SendIcon, WhatsappIcon } from "@hugeicons/core-free-icons"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button, buttonVariants } from "@/components/ui/button"
import { Marker, MarkerContent } from "@/components/ui/marker"
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Textarea } from "@/components/ui/textarea"
import { copy } from "@/lib/copy"
import { whatsappLink } from "@/lib/whatsapp"
import {
  type ChatScope,
  useTenantChat,
} from "@/components/chat/use-tenant-chat"

const t = copy.tenant.chat

export type ChatHandoff = { phone: string; message: string }

export function ChatPanel({
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
  const { messages, status, send } = useTenantChat(scope, greeting)
  const [draft, setDraft] = useState("")
  const showQuestions = messages.length === 1

  const submit = (text: string) => {
    setDraft("")
    void send(text)
  }

  // The car link is read at click time so the dealer sees exactly which listing the buyer was on.
  const openWhatsapp = () => {
    if (!handoff) return
    const text =
      scope.type === "car"
        ? `${handoff.message}\n${window.location.href}`
        : handoff.message
    window.open(
      whatsappLink(handoff.phone, text),
      "_blank",
      "noopener,noreferrer"
    )
  }

  return (
    <MessageScrollerProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        {handoff ? (
          <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 py-2">
            <span className="text-xs text-muted-foreground">
              {t.whatsappHint}
            </span>
            <button
              type="button"
              onClick={openWhatsapp}
              aria-label={t.whatsapp}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <HugeiconsIcon
                icon={WhatsappIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              WhatsApp
            </button>
          </div>
        ) : null}
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="px-4 py-4">
              {messages.map((message) => (
                <MessageScrollerItem key={message.id}>
                  <Message align={message.role === "user" ? "end" : "start"}>
                    {message.role === "assistant" ? (
                      <MessageAvatar>
                        <Avatar size="sm">
                          <AvatarFallback>
                            <HugeiconsIcon
                              icon={AiChatIcon}
                              strokeWidth={2}
                              className="size-4"
                            />
                          </AvatarFallback>
                        </Avatar>
                      </MessageAvatar>
                    ) : null}
                    <MessageContent>
                      {message.content ? (
                        <Bubble
                          align={message.role === "user" ? "end" : "start"}
                          variant={
                            message.role === "user" ? "default" : "secondary"
                          }
                        >
                          <BubbleContent className="whitespace-pre-wrap">
                            {message.content}
                          </BubbleContent>
                        </Bubble>
                      ) : (
                        <Marker>
                          <MarkerContent className="shimmer">
                            {t.thinking}
                          </MarkerContent>
                        </Marker>
                      )}
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>

        {showQuestions ? (
          <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
            {questions.map((q) => (
              <Button
                key={q}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => submit(q)}
                disabled={status === "sending"}
              >
                {q}
              </Button>
            ))}
          </div>
        ) : null}

        <form
          className="flex items-end gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (draft.trim()) submit(draft)
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                if (draft.trim()) submit(draft)
              }
            }}
            placeholder={t.placeholder}
            className="min-h-10 py-2"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={status === "sending" || !draft.trim()}
            aria-label={t.send}
          >
            <HugeiconsIcon icon={SendIcon} strokeWidth={2} />
          </Button>
        </form>
      </div>
    </MessageScrollerProvider>
  )
}
