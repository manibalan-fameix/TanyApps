"use client"

import { useCallback, useRef, useState } from "react"
import { Cancel01Icon, Image01Icon, SendHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Message, MessageContent, MessageHeader } from "@/components/ui/message"
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller"
import { Textarea } from "@/components/ui/textarea"
import { resizeToJpeg } from "@/lib/image/resize"
import { MAX_MESSAGE_CHARS, MAX_RETURN_PHOTOS } from "@/lib/returns/rules"
import type { ThreadMessage } from "@/lib/returns/thread"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"

/** The pieces the customer's chat and the shop's chat share. Messages are plain text: links in them are not clickable. */

export type Outgoing = { clientId: string; text: string; photos: { id: string; preview: string }[]; failed: string | null }
export type SendFn = (message: { text: string; photos: string[]; clientId: string }) => Promise<{ ok: true } | { ok: false; error: string }>

/** Messages on their way: each shows "Sending", then leaves the list once saved, or stays with Retry. A retry never posts twice. */
export function useOutbox(send: SendFn) {
  const [outbox, setOutbox] = useState<Outgoing[]>([])
  const deliver = useCallback(
    async (item: Outgoing) => {
      setOutbox((list) => list.map((x) => (x.clientId === item.clientId ? { ...x, failed: null } : x)))
      const result = await send({ text: item.text, photos: item.photos.map((p) => p.id), clientId: item.clientId }).catch(() => ({ ok: false as const, error: "No connection." }))
      setOutbox((list) => (result.ok ? list.filter((x) => x.clientId !== item.clientId) : list.map((x) => (x.clientId === item.clientId ? { ...x, failed: result.error } : x))))
    },
    [send],
  )
  return {
    outbox,
    push: (text: string, photos: Outgoing["photos"]) => {
      const item: Outgoing = { clientId: crypto.randomUUID(), text, photos, failed: null }
      setOutbox((list) => [...list, item])
      void deliver(item)
    },
    retry: (item: Outgoing) => void deliver(item),
    discard: (clientId: string) => setOutbox((list) => list.filter((x) => x.clientId !== clientId)),
  }
}

const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" })
const dayFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" })

function Photos({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {urls.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Photo in this chat" className="size-24 rounded-xl border object-cover" />
        </a>
      ))}
    </div>
  )
}

/** The conversation. `viewer` decides which side is "You". The assistant is always named, so nobody mistakes it for a person. */
export function ChatThread({
  messages,
  viewer,
  outbox,
  onRetry,
  onDiscard,
  footer,
}: {
  messages: ThreadMessage[]
  viewer: "customer" | "shop"
  outbox: Outgoing[]
  onRetry: (item: Outgoing) => void
  onDiscard: (clientId: string) => void
  /** What follows the last message, such as the assistant's buttons. */
  footer?: React.ReactNode
}) {
  const who = (sender: ThreadMessage["sender"]) => (sender === viewer ? "You" : sender === "assistant" ? "Assistant" : sender === "shop" ? "Shop" : "Customer")
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport className="px-3 py-3">
          <MessageScrollerContent className="gap-3">
            {messages.map((m, i) => {
              const day = dayFmt.format(new Date(m.at))
              const newDay = i === 0 || day !== dayFmt.format(new Date(messages[i - 1].at))
              const mine = m.sender === viewer
              return (
                <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={mine}>
                  {newDay ? <p className="pb-3 text-center text-xs text-muted-foreground">{day}</p> : null}
                  {m.sender === "system" ? (
                    <p className="mx-auto w-fit max-w-[90%] rounded-2xl border bg-muted px-3 py-2 text-center text-sm font-medium whitespace-pre-wrap" data-event={m.event ?? undefined}>
                      {m.body}
                      <span className="block text-xs font-normal text-muted-foreground">{timeFmt.format(new Date(m.at))}</span>
                    </p>
                  ) : (
                    <Message align={mine ? "end" : "start"}>
                      <MessageContent className={cn("gap-1", mine ? "items-end" : "items-start")}>
                        <MessageHeader>
                          {who(m.sender)} · {timeFmt.format(new Date(m.at))}
                        </MessageHeader>
                        <Photos urls={m.photos} />
                        {m.body ? (
                          <Bubble align={mine ? "end" : "start"} variant={mine ? "default" : m.sender === "assistant" ? "muted" : "outline"}>
                            <BubbleContent className="whitespace-pre-wrap">{m.body}</BubbleContent>
                          </Bubble>
                        ) : null}
                      </MessageContent>
                    </Message>
                  )}
                </MessageScrollerItem>
              )
            })}
            {outbox.map((item) => (
              <MessageScrollerItem key={item.clientId} messageId={item.clientId} scrollAnchor>
                <Message align="end">
                  <MessageContent className="items-end gap-1">
                    <Photos urls={item.photos.map((p) => p.preview)} />
                    {item.text ? (
                      <Bubble align="end" className="opacity-70">
                        <BubbleContent className="whitespace-pre-wrap">{item.text}</BubbleContent>
                      </Bubble>
                    ) : null}
                    {item.failed ? (
                      <p role="alert" className="flex flex-wrap items-center justify-end gap-2 text-xs text-destructive">
                        Not sent. {item.failed}
                        <Button type="button" variant="outline" size="xs" onClick={() => onRetry(item)}>Retry</Button>
                        <Button type="button" variant="ghost" size="xs" onClick={() => onDiscard(item.clientId)}>Remove</Button>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sending…</p>
                    )}
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            ))}
            {footer ? (
              <MessageScrollerItem messageId="actions" scrollAnchor={false}>
                {footer}
              </MessageScrollerItem>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

const PHOTO_EDGE = 1280

/** The text box with photos. Photos are shrunk in the browser (which also drops their location data) and uploaded when picked. */
export function Composer({
  upload,
  onSend,
  placeholder,
  note,
  text,
  onText,
  photoPrompt,
}: {
  /** Saves one JPEG under the given id, or throws with a message to show. */
  upload: (id: string, blob: Blob) => Promise<void>
  onSend: (text: string, photos: Outgoing["photos"]) => void
  placeholder: string
  note?: string
  text: string
  onText: (value: string) => void
  /** Shows a clear "Add photo" button above the box, for when a photo is being asked for. */
  photoPrompt?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<Outgoing["photos"]>([])
  const [uploading, setUploading] = useState(0)

  async function add(files: FileList | null) {
    const room = MAX_RETURN_PHOTOS - photos.length
    const picked = [...(files ?? [])].filter((f) => f.type.startsWith("image/")).slice(0, room)
    if ((files?.length ?? 0) > room) toast.error(`You can send up to ${MAX_RETURN_PHOTOS} photos at once.`)
    await Promise.all(
      picked.map(async (file) => {
        setUploading((n) => n + 1)
        try {
          const { blob } = await resizeToJpeg(file, PHOTO_EDGE)
          const id = crypto.randomUUID()
          await upload(id, blob)
          setPhotos((list) => [...list, { id, preview: URL.createObjectURL(blob) }])
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not upload that photo.")
        } finally {
          setUploading((n) => n - 1)
        }
      }),
    )
  }

  const ready = uploading === 0 && (text.trim() !== "" || photos.length > 0)
  const submit = () => {
    if (!ready) return
    onSend(text.trim(), photos)
    onText("")
    setPhotos([])
  }

  return (
    <form
      className="grid gap-2 border-t bg-card p-3 pb-[calc(0.75rem+var(--safe-area-inset-bottom))]"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {photoPrompt && photos.length === 0 ? (
        <Button type="button" onClick={() => input.current?.click()} disabled={uploading > 0}>
          <HugeiconsIcon icon={Image01Icon} strokeWidth={2} data-icon="inline-start" />
          {uploading > 0 ? "Uploading…" : "Add photo"}
        </Button>
      ) : null}
      {photos.length > 0 ? (
        <ul className="flex gap-2">
          {photos.map((p) => (
            <li key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="Photo to send" className="size-16 rounded-xl border object-cover" />
              <Button type="button" variant="secondary" size="icon-xs" aria-label="Remove photo" className="absolute -top-1.5 -right-1.5 rounded-full" onClick={() => setPhotos((list) => list.filter((x) => x.id !== p.id))}>
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-end gap-2">
        <input ref={input} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void add(e.target.files); e.target.value = "" }} />
        <Button type="button" variant="outline" size="icon" aria-label="Add photo" disabled={uploading > 0 || photos.length >= MAX_RETURN_PHOTOS} onClick={() => input.current?.click()}>
          <HugeiconsIcon icon={Image01Icon} strokeWidth={2} />
        </Button>
        <Textarea
          aria-label="Message"
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          maxLength={MAX_MESSAGE_CHARS}
          rows={1}
          placeholder={uploading > 0 ? "Uploading photo…" : placeholder}
          className="max-h-32 min-h-10 flex-1 py-2"
        />
        <Button type="submit" size="icon" aria-label="Send" disabled={!ready}>
          <HugeiconsIcon icon={SendHorizontalIcon} strokeWidth={2} />
        </Button>
      </div>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </form>
  )
}
