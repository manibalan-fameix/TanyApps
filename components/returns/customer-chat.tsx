"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { Add01Icon, BubbleChatIcon, Call02Icon, MinusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { openReturnChat, pressReturnButton, readReturnChat, sendReturnMessage } from "@/app/(tenant)/sites/[dealer]/return-actions"
import { ChatThread, Composer, type SendFn, useOutbox } from "@/components/returns/chat-parts"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import type { CustomerResult, CustomerView, Step } from "@/lib/returns/customer"
import { toast } from "@/lib/toast"

const POLL_MS = 4_000

async function uploadPhoto(id: string, blob: Blob) {
  const res = await fetch(`/api/t/return-upload?id=${id}`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob })
  const data = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null
  if (!res.ok || !data?.ok) throw new Error(data?.error || "Could not upload that photo.")
}

/** The button on an order page and the chat it opens: full screen on a phone, a side panel on a computer. */
export function ReturnChat({ orderCode, unread, started, autoOpen }: { orderCode: string; unread: boolean; started: boolean; autoOpen: boolean }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(autoOpen)
  const [seen, setSeen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => {
          setOpen(true)
          setSeen(true)
        }}
      >
        <HugeiconsIcon icon={BubbleChatIcon} strokeWidth={2} data-icon="inline-start" />
        {started ? "Return help" : "Report a problem or return"}
        {unread && !seen && !autoOpen ? <Badge>Shop replied</Badge> : null}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={isMobile ? "bottom" : "right"} className="flex flex-col gap-0 overflow-hidden p-0 data-[side=bottom]:h-[100dvh] data-[side=right]:md:w-[30rem] data-[side=right]:md:max-w-[30rem]">
          {open ? <Conversation orderCode={orderCode} /> : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

function Conversation({ orderCode }: { orderCode: string }) {
  const [view, setView] = useState<CustomerView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [pending, startTransition] = useTransition()
  // Replies can arrive out of order, so a read started before the latest change is ignored.
  const version = useRef(0)

  const apply = useCallback((result: CustomerResult, at: number) => {
    if (result.ok && at === version.current) setView(result.view)
    return result
  }, [])

  const open = useCallback(
    (startNew: boolean) => {
      const at = ++version.current
      startTransition(async () => {
        const result = apply(await openReturnChat(orderCode, startNew), at)
        setError(result.ok ? null : result.error)
      })
    },
    [apply, orderCode],
  )
  useEffect(() => open(false), [open])

  const returnId = view?.returnId
  useEffect(() => {
    if (!returnId) return
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return
      const at = version.current
      void readReturnChat(returnId).then((r) => apply(r, at), () => undefined)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [returnId, apply])

  const send = useCallback<SendFn>(
    async (message) => {
      if (!returnId) return { ok: false, error: "The chat is not open." }
      const at = ++version.current
      const result = apply(await sendReturnMessage(returnId, message), at)
      return result.ok ? { ok: true } : result
    },
    [returnId, apply],
  )
  const { outbox, push, retry, discard } = useOutbox(send)

  const press = (step: Step) => {
    if (!returnId) return
    const at = ++version.current
    startTransition(async () => {
      const result = apply(await pressReturnButton(returnId, step), at)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <>
      <SheetHeader className="border-b pr-14">
        <SheetTitle>Return help · Order {orderCode}</SheetTitle>
        <SheetDescription>{view ? `${view.shopName}${view.status === "draft" ? "" : ` · ${view.code} · ${view.statusLabel}`}` : "Chat with the shop"}</SheetDescription>
        {view?.shopPhone ? (
          <a href={`tel:${view.shopPhone}`} className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}>
            <HugeiconsIcon icon={Call02Icon} strokeWidth={2} data-icon="inline-start" />
            Call the shop
          </a>
        ) : null}
      </SheetHeader>
      {view ? (
        <>
          <ChatThread messages={view.messages} viewer="customer" outbox={outbox} onRetry={retry} onDiscard={discard} footer={<Actions key={`${view.returnId}-${view.step}`} view={view} busy={pending || outbox.length > 0} press={press} startNew={() => open(true)} />} />
          {view.canWrite ? (
            <Composer upload={uploadPhoto} onSend={push} text={text} onText={setText} photoPrompt={view.status === "draft" && view.step === "photo"} placeholder={view.status === "draft" || view.status === "requested" || view.status === "refund_due" ? "Type a message to the shop" : "Send one more message"} note="Never share card or bank details here." />
          ) : (
            <p className="border-t p-3 text-sm text-muted-foreground">This conversation is closed. Call the shop if you need more help.</p>
          )}
        </>
      ) : error ? (
        <div className="grid gap-3 p-4 text-sm">
          <p role="alert">{error}</p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route that redirects to another host; <Link> cannot follow it */}
          <a href="/api/t/auth/start?next=%2Fprofile" className={buttonVariants({ variant: "outline", className: "w-fit" })}>Sign in with another number</a>
        </div>
      ) : (
        <p role="status" className="p-4 text-sm text-muted-foreground">Opening the chat…</p>
      )}
    </>
  )
}

/** The assistant's buttons for where the conversation is now. */
function Actions({ view, busy, press, startNew }: { view: CustomerView; busy: boolean; press: (step: Step) => void; startNew: () => void }) {
  const [chosen, setChosen] = useState<Record<number, number>>({})
  const picked = Object.entries(chosen).map(([position, qty]) => ({ position: Number(position), qty }))
  const draft = view.status === "draft"
  const pick = (position: number, qty: number) =>
    setChosen((c) => {
      const next = { ...c }
      if (qty < 1) delete next[position]
      else next[position] = qty
      return next
    })
  const chip = (label: string, step: Step, primary = false) => (
    <Button key={label} type="button" size="sm" variant={primary ? "default" : "outline"} disabled={busy} onClick={() => press(step)}>
      {label}
    </Button>
  )
  return (
    <div className="grid gap-2">
      {draft && view.step === "reason" ? <div className="flex flex-wrap gap-2">{view.reasons.map((r) => chip(r.label, { kind: "reason", reason: r.value }))}</div> : null}
      {draft && view.step === "items" ? (
        <div className="grid gap-2">
          <ul className="grid gap-2">
            {view.lines.map((line) => {
              const qty = chosen[line.position] ?? 0
              const id = `return-line-${line.position}`
              return (
                <li key={line.position} className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-sm">
                  <Checkbox id={id} checked={qty > 0} disabled={line.available === 0 || busy} onCheckedChange={(on) => pick(line.position, on ? 1 : 0)} />
                  <label htmlFor={id} className="min-w-0 flex-1">
                    <span className="block font-medium">{line.name}{line.portion ? ` (${line.portion})` : ""}</span>
                    <span className="block text-xs text-muted-foreground">{line.available === 0 ? line.note : `₹${line.unitPrice.toLocaleString("en-IN")} each · ordered ${line.ordered}`}</span>
                  </label>
                  {qty > 0 && line.available > 1 ? (
                    <span className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="icon-xs" aria-label={`One less ${line.name}`} disabled={qty <= 1} onClick={() => pick(line.position, qty - 1)}>
                        <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
                      </Button>
                      <span aria-live="polite" className="w-5 text-center tabular-nums">{qty}</span>
                      <Button type="button" variant="outline" size="icon-xs" aria-label={`One more ${line.name}`} disabled={qty >= line.available} onClick={() => pick(line.position, qty + 1)}>
                        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                      </Button>
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <Button type="button" disabled={busy || picked.length === 0} onClick={() => press({ kind: "items", lines: picked })}>Continue</Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {view.canSend ? chip("Send to shop", { kind: "send" }, true) : null}
        {view.canChange ? chip("Change", { kind: "change" }) : null}
        {view.canTalk ? chip("Talk to the shop", { kind: "talk" }) : null}
        {view.canAskRefund ? chip("Where is my refund?", { kind: "refund" }) : null}
        {view.canWithdraw ? chip("Cancel this return", { kind: "withdraw" }) : null}
        {view.overdue && view.shopPhone ? <a href={`tel:${view.shopPhone}`} className={buttonVariants({ size: "sm" })}>Call the shop</a> : null}
        {view.canStartNew ? (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={startNew}>Report another problem</Button>
        ) : null}
      </div>
      {draft && view.policy ? <p className="text-xs whitespace-pre-wrap text-muted-foreground">Return policy: {view.policy}</p> : null}
    </div>
  )
}
