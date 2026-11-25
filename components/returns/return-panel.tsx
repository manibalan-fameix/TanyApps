"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { approveReturn, closeReturnConversation, recordReturnPayback, rejectReturn } from "@/lib/returns/admin-actions"
import type { ShopResult, ShopThread } from "@/lib/returns/shop"
import { toast } from "@/lib/toast"

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`
const METHOD_LABEL: Record<string, string> = { cash: "Cash", upi: "UPI", razorpay_dashboard: "Razorpay dashboard" }
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}

/** The facts of one return and the only buttons that change its status or record money. Typing in the chat changes neither. */
export function ReturnPanel({ thread, owner, onDone, onOpen }: { thread: ShopThread; owner: boolean; onDone: () => void; onOpen: (id: string) => void }) {
  const [pending, startTransition] = useTransition()
  const run = (action: () => Promise<ShopResult>, done: string) =>
    startTransition(async () => {
      const result = await action()
      if (result.ok) toast.success(done)
      else toast.error(result.error)
      onDone()
    })
  const online = thread.order.paymentMethod === "online"

  return (
    <aside aria-label="This return" className="grid content-start gap-4 overflow-y-auto rounded-3xl border bg-card p-4 text-sm">
      <div className="grid gap-2">
        <h3 className="font-semibold">{thread.statusLabel}</h3>
        {thread.items.length > 0 ? (
          <>
            <ul className="grid gap-1">
              {thread.items.map((i) => (
                <li key={i.name} className="flex justify-between gap-3">
                  <span>{i.qty} × {i.name}</span>
                  <span className="tabular-nums">{rupees(i.qty * i.unitPrice)}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">{thread.reason}</p>
          </>
        ) : (
          <p className="text-muted-foreground">{thread.needsHelp ? "The customer wrote or asked for you. No return request has been sent yet." : "No return request was sent."}</p>
        )}
      </div>

      <dl className="grid gap-1 border-t pt-3">
        <Row label={online ? "Paid online" : "Pay on delivery or pickup"}>{rupees(thread.order.total)}{online && thread.order.paymentStatus !== "paid" ? ` (${thread.order.paymentStatus})` : ""}</Row>
        {thread.amountRequested !== null ? <Row label="Worked-out refund">{rupees(thread.amountRequested)}</Row> : null}
        {thread.amountApproved !== null ? <Row label="Approved">{rupees(thread.amountApproved)}</Row> : null}
        {thread.refundMethod ? <Row label="Paid back">{METHOD_LABEL[thread.refundMethod]} · {thread.refundPaidOn}</Row> : null}
        {thread.refundRef ? <Row label="Reference">{thread.refundRef}</Row> : null}
        {thread.changeReason ? <p className="text-muted-foreground">Amount changed: {thread.changeReason}</p> : null}
        {thread.shopNote ? <p className="text-muted-foreground">Not accepted: {thread.shopNote}</p> : null}
      </dl>

      {thread.status === "requested" ? <Decide key={thread.id} thread={thread} owner={owner} pending={pending} run={run} /> : null}
      {thread.status === "refund_due" ? <Payback key={thread.id} thread={thread} owner={owner} pending={pending} run={run} /> : null}
      {thread.status === "draft" ? (
        <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => closeReturnConversation(thread.id), "Conversation closed")}>
          Close conversation
        </Button>
      ) : null}

      {thread.earlier.length > 0 ? (
        <div className="grid gap-1 border-t pt-3">
          <h4 className="font-medium">This customer&apos;s other returns</h4>
          <ul className="grid gap-1">
            {thread.earlier.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)} className="flex w-full justify-between gap-3 text-left underline-offset-4 hover:underline">
                  <span>{r.code} · {r.statusLabel}</span>
                  {r.amount !== null ? <span className="tabular-nums">{rupees(r.amount)}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  )
}

type Run = (action: () => Promise<ShopResult>, done: string) => void

function Decide({ thread, owner, pending, run }: { thread: ShopThread; owner: boolean; pending: boolean; run: Run }) {
  const [amount, setAmount] = useState(String(Math.min(thread.amountRequested ?? 0, thread.limit)))
  const [why, setWhy] = useState("")
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const changed = Number(amount) !== thread.amountRequested
  if (rejecting)
    return (
      <form
        className="grid gap-3 border-t pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => rejectReturn(thread.id, { reason }), "Return not accepted")
        }}
      >
        <Field>
          <FieldLabel htmlFor="reject-reason">Why not?</FieldLabel>
          <Textarea id="reject-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <FieldDescription>The customer sees this. It can&apos;t be undone.</FieldDescription>
        </Field>
        <div className="flex gap-2">
          <Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 3}>Reject return</Button>
          <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
        </div>
      </form>
    )
  return (
    <form
      className="grid gap-3 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => approveReturn(thread.id, { amount: Number(amount), changeReason: changed ? why : "" }), "Approved. Now pay the customer and record it.")
      }}
    >
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel htmlFor="refund-amount">Refund amount (₹)</FieldLabel>
          <Input id="refund-amount" type="number" inputMode="numeric" min={1} max={thread.limit} step={1} required disabled={!owner} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <FieldDescription>At most {rupees(thread.limit)}.</FieldDescription>
        </Field>
        {changed && owner ? (
          <Field>
            <FieldLabel htmlFor="change-reason">Why is it different?</FieldLabel>
            <Input id="change-reason" required maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} />
            <FieldDescription>The customer sees this.</FieldDescription>
          </Field>
        ) : null}
      </FieldGroup>
      <p className="text-muted-foreground">The customer keeps or throws away the items: nothing needs to come back.</p>
      {owner ? null : <p className="text-muted-foreground">Only the owner can approve a refund.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !owner}>Approve refund</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setRejecting(true)}>Reject…</Button>
      </div>
    </form>
  )
}

function Payback({ thread, owner, pending, run }: { thread: ShopThread; owner: boolean; pending: boolean; run: Run }) {
  const online = thread.order.paymentMethod === "online" && thread.order.paymentStatus === "paid"
  const [method, setMethod] = useState(online ? "razorpay_dashboard" : "cash")
  const [paidOn, setPaidOn] = useState(today)
  const [ref, setRef] = useState("")
  const methods = online ? ["razorpay_dashboard", "upi", "cash"] : ["cash", "upi"]
  const amount = rupees(thread.amountApproved ?? 0)
  return (
    <form
      className="grid gap-3 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => recordReturnPayback(thread.id, { method, paidOn, ref }), "Payment recorded")
      }}
    >
      <p className="rounded-2xl bg-muted p-3">
        <span className="font-medium">Pay {amount} yourself, then record it here.</span> This screen does not send any money.
        {online && thread.order.razorpayPaymentId ? <span className="mt-1 block break-all text-muted-foreground">In your Razorpay dashboard, refund {amount} on payment {thread.order.razorpayPaymentId}.</span> : null}
      </p>
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel htmlFor="payback-method">How you paid</FieldLabel>
          <Select value={method} onValueChange={(v) => v && setMethod(String(v))} disabled={!owner}>
            <SelectTrigger id="payback-method" className="w-full">
              <SelectValue>{METHOD_LABEL[method]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {methods.map((m) => (
                <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="payback-date">Day you paid</FieldLabel>
          <Input id="payback-date" type="date" required max={today()} disabled={!owner} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="payback-ref">Reference (optional)</FieldLabel>
          <Input id="payback-ref" maxLength={100} disabled={!owner} value={ref} onChange={(e) => setRef(e.target.value)} />
          <FieldDescription>The customer sees it. Never enter card or bank details.</FieldDescription>
        </Field>
      </FieldGroup>
      {owner ? null : <p className="text-muted-foreground">Only the owner can record a refund.</p>}
      <Button type="submit" disabled={pending || !owner}>Record {amount} as paid back</Button>
    </form>
  )
}
