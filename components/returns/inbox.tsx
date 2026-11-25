"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { ArrowDown01Icon, ArrowLeft01Icon, Call02Icon, WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useOrderAlerts } from "@/components/restaurant/order-alerts"
import { ChatThread, Composer, type SendFn, useOutbox } from "@/components/returns/chat-parts"
import { ReturnPanel } from "@/components/returns/return-panel"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchReturnInbox, fetchReturnThread, replyToReturn } from "@/lib/returns/admin-actions"
import type { InboxRow, InboxTab, ShopThread } from "@/lib/returns/shop"
import { cn } from "@/lib/utils"

const INBOX_POLL_MS = 20_000
const THREAD_POLL_MS = 4_000
const TABS: { value: InboxTab; label: string; empty: string }[] = [
  { value: "shop", label: "Waiting for you", empty: "Nothing is waiting for you." },
  { value: "customer", label: "With customer", empty: "No conversation is waiting for a customer." },
  { value: "done", label: "Done", empty: "Finished returns appear here." },
]

export function ago(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`

/** The shop's inbox: the list, the conversation, and the decisions beside it. On a phone the list opens into the conversation. */
export function ReturnsInbox({ initialRows, initialId, owner, dealerId, quickReplies }: { initialRows: InboxRow[]; initialId: string | null; owner: boolean; dealerId: string; quickReplies: string[] }) {
  const [rows, setRows] = useState(initialRows)
  const [selected, setSelected] = useState(initialId)
  // Opening from a link starts on that conversation's tab.
  const [tab, setTab] = useState<InboxTab>(initialRows.find((r) => r.id === initialId)?.tab ?? "shop")
  const [query, setQuery] = useState("")
  const [now, setNow] = useState<number | null>(null)
  const { returnsChanged } = useOrderAlerts()

  const refresh = useCallback(async () => {
    const result = await fetchReturnInbox().catch(() => null)
    if (result?.ok) setRows(result.rows)
    setNow(Date.now())
  }, [])
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0)
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), INBOX_POLL_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [refresh])

  // A conversation picked in the new-activity pop-up while the inbox is already open.
  const [lastInitial, setLastInitial] = useState(initialId)
  if (initialId !== lastInitial) {
    setLastInitial(initialId)
    if (initialId) setSelected(initialId)
  }

  const q = query.trim().toLowerCase()
  const shown = rows.filter((r) => (q ? `${r.code} ${r.orderCode} ${r.customerName}`.toLowerCase().includes(q) : r.tab === tab))

  return (
    <div className="grid min-h-0 gap-3 lg:h-[calc(100dvh-11rem)] lg:grid-cols-[19rem_minmax(0,1fr)]">
      <section aria-label="Conversations" className={cn("flex min-h-0 flex-col gap-2", selected && "max-lg:hidden")}>
        <Input type="search" aria-label="Search returns" placeholder="Search return, order or name" value={query} onChange={(e) => setQuery(e.target.value)} />
        {q ? (
          <p className="text-xs text-muted-foreground">Searching every tab</p>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as InboxTab)}>
            <TabsList className="w-full">
              {TABS.map((t) => {
                const n = rows.filter((r) => r.tab === t.value).length
                return (
                  <TabsTrigger key={t.value} value={t.value} className="flex-1 gap-1 px-1.5 text-xs">
                    {t.label}
                    {n > 0 && t.value !== "done" ? <span className="tabular-nums">({n})</span> : null}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </Tabs>
        )}
        <ul className="grid min-h-0 content-start gap-1.5 overflow-y-auto">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setSelected(r.id)} aria-current={selected === r.id || undefined} className="grid w-full gap-1 rounded-2xl border bg-card p-3 text-left text-sm transition-colors hover:bg-muted aria-current:border-primary aria-current:bg-muted">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{r.code} · {r.customerName}</span>
                  {r.unread > 0 ? <Badge aria-label={`${r.unread} unread`}>{r.unread}</Badge> : null}
                </span>
                <span className="truncate text-muted-foreground">{r.preview}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>Order {r.orderCode}</span>
                  {r.amount !== null ? <span>{rupees(r.amount)}</span> : null}
                  {r.tab !== "done" && now ? <span>{ago(r.waitingSince, now)}</span> : null}
                  {r.needsHelp ? <Badge variant="destructive">Needs help</Badge> : null}
                  {r.status === "refund_due" ? <Badge variant="outline">Refund to pay</Badge> : null}
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 ? <li className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{q ? "No conversation matches." : TABS.find((t) => t.value === tab)!.empty}</li> : null}
        </ul>
      </section>

      {selected ? (
        <Conversation
          key={selected}
          id={selected}
          owner={owner}
          dealerId={dealerId}
          quickReplies={quickReplies}
          onBack={() => setSelected(null)}
          onOpen={setSelected}
          onChange={() => {
            void refresh()
            returnsChanged()
          }}
        />
      ) : (
        <p className="grid place-items-center rounded-3xl border border-dashed p-10 text-sm text-muted-foreground max-lg:hidden">Choose a conversation.</p>
      )}
    </div>
  )
}

function Conversation({ id, owner, dealerId, quickReplies, onBack, onOpen, onChange }: { id: string; owner: boolean; dealerId: string; quickReplies: string[]; onBack: () => void; onOpen: (id: string) => void; onChange: () => void }) {
  const [thread, setThread] = useState<ShopThread | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [, startTransition] = useTransition()
  const version = useRef(0)
  const unreadSeen = useRef(false)
  const changed = useRef(onChange)
  useEffect(() => {
    changed.current = onChange
  })

  const load = useCallback(async () => {
    const at = ++version.current
    const result = await fetchReturnThread(id, document.visibilityState === "visible").catch(() => null)
    if (!result || at !== version.current) return
    if (result.ok) setThread(result.thread)
    else setError(result.error)
    // Opening it read it, so the list's unread count is out of date.
    if (!unreadSeen.current) {
      unreadSeen.current = true
      changed.current()
    }
  }, [id])
  useEffect(() => {
    startTransition(() => void load())
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), THREAD_POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  const send = useCallback<SendFn>(
    async (message) => {
      const result = await replyToReturn(id, message)
      if (result.ok) {
        await load()
        changed.current()
      }
      return result
    },
    [id, load],
  )
  const { outbox, push, retry, discard } = useOutbox(send)

  const upload = async (photoId: string, blob: Blob) => {
    const res = await fetch(`/api/upload/dealers/${dealerId}/returns/shop/${photoId}.jpg`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob })
    if (!res.ok) throw new Error("Could not upload that photo.")
  }

  if (!thread)
    return (
      <p role="status" className="rounded-3xl border p-6 text-sm text-muted-foreground">
        {error ?? "Opening…"}
      </p>
    )
  const phone = thread.customer.phone
  const digits = phone.replace(/\D/g, "").slice(-10)
  const hello = encodeURIComponent(`Hi ${thread.customer.name}, this is about your return ${thread.code} (order ${thread.order.code}).`)
  return (
    <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label="Conversation" className="flex min-h-0 flex-col overflow-hidden rounded-3xl border bg-card max-lg:h-[70dvh] lg:max-xl:h-[34rem]">
        <header className="flex flex-wrap items-center gap-2 border-b p-3">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Back to the list" className="lg:hidden" onClick={onBack}>
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{thread.code} · {thread.customer.name}</h2>
            <p className="truncate text-xs text-muted-foreground">
              Order <Link href={`/orders/${thread.order.id}`} className="underline">{thread.order.code}</Link> · {thread.statusLabel}
            </p>
          </div>
          {digits.length === 10 ? (
            <>
              <a href={`tel:+91${digits}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <HugeiconsIcon icon={Call02Icon} strokeWidth={2} data-icon="inline-start" />
                Call
              </a>
              <a href={`https://wa.me/91${digits}?text=${hello}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <HugeiconsIcon icon={WhatsappIcon} strokeWidth={2} data-icon="inline-start" />
                WhatsApp
              </a>
            </>
          ) : null}
        </header>
        <ChatThread messages={thread.messages} viewer="shop" outbox={outbox} onRetry={retry} onDiscard={discard} />
        {quickReplies.length > 0 ? (
          <div className="border-t px-3 pt-2">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
                Quick replies
                <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-72">
                {quickReplies.map((reply) => (
                  // Fills the box only: nothing is sent without pressing Send.
                  <DropdownMenuItem key={reply} onClick={() => setText((t) => (t ? `${t} ${reply}` : reply))}>
                    {reply}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
        <Composer upload={upload} onSend={push} text={text} onText={setText} placeholder="Reply to the customer" />
      </section>
      <ReturnPanel
        thread={thread}
        owner={owner}
        onOpen={onOpen}
        onDone={() => {
          void load()
          changed.current()
        }}
      />
    </div>
  )
}
