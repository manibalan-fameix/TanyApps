import type { ReturnReason } from "./rules.ts"
import { reasonLabel, windowText } from "./rules.ts"

/**
 * What the assistant says. It is scripted: every sentence is built from the order and the shop's rules, typed words are never
 * interpreted, and it never approves, refuses or promises money or a date the shop has not set. Pure, so each reply can be tested.
 */

export const STATUSES = ["draft", "requested", "refund_due", "refunded", "rejected", "withdrawn", "closed"] as const
export type ReturnStatus = (typeof STATUSES)[number]
export const OPEN_STATUSES = ["draft", "requested", "refund_due"] as const satisfies readonly ReturnStatus[]
export const isOpen = (s: string) => (OPEN_STATUSES as readonly string[]).includes(s)
/** Requests that hold their items and money: the same item cannot be asked for twice. */
export const COUNTED_STATUSES = ["requested", "refund_due", "refunded"] as const satisfies readonly ReturnStatus[]

export type BotStep = "reason" | "items" | "photo" | "summary" | "done" | "outside"
export type RefundMethod = "cash" | "upi" | "razorpay_dashboard"

export const STATUS_LABEL: Record<ReturnStatus, string> = {
  draft: "Not sent yet",
  requested: "Waiting for the shop",
  refund_due: "Approved · refund to be paid",
  refunded: "Refunded",
  rejected: "Not accepted",
  withdrawn: "Cancelled by customer",
  closed: "Closed",
}

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`

const whenOpen = (opensAt: string | null) => (opensAt ? ` The shop is closed now and opens ${opensAt}.` : "")
const replyTime = (h: number) => `The shop usually replies within ${windowText(h)}.`

export const greeting = (code: string, handedOver: string) => `Hi! I can help with order ${code}, handed over ${handedOver}. What went wrong?`
export const noReturnsGreeting = (code: string, why: string) => `Hi! This chat is about order ${code}. ${why} You can still write to the shop here, but a return request can't be made.`
export const ASK_ITEMS = "Which items?"
export const ASK_PHOTO = "Please add a photo of the problem."
export const START_AGAIN = "No problem, let's start again. What went wrong?"

export function summaryText(items: { name: string; qty: number }[], reason: ReturnReason, industry: string, photos: number, estimate: number, paidOnline: boolean): string {
  const list = items.map((i) => `${i.name} × ${i.qty}`).join(", ")
  const proof = photos > 0 ? ` · ${photos} ${photos === 1 ? "photo" : "photos"}` : ""
  const how = paidOnline ? " to the way you paid" : ", paid back by the shop"
  return `Here is your request: ${list} · ${reasonLabel(reason, industry)}${proof}. Estimated refund ${rupees(estimate)}${how}. The shop decides.`
}

export const sentText = (code: string, replyHours: number, opensAt: string | null) => `Sent. Your return number is ${code}. ${replyTime(replyHours)}${whenOpen(opensAt)}`
export const savedText = (opensAt: string | null) => `I've sent this to the shop. They'll read it and reply here.${whenOpen(opensAt)}`
export const talkText = (replyHours: number, opensAt: string | null) => `I've asked the shop to join this chat. ${replyTime(replyHours)} You can type your message below.${whenOpen(opensAt)}`
export const OVERDUE = "Still waiting for the shop. You can call them."

export function approvedText(amount: number, changeReason: string | null): string {
  return `Approved · refund ${rupees(amount)}. No need to send anything back.${changeReason ? ` The amount was changed: ${changeReason}` : ""} The shop will pay this and record it here.`
}
export const rejectedText = (reason: string) => `The shop could not accept this return. Reason: ${reason}`
export const WITHDRAWN = "You cancelled this return."
export const CLOSED = "The shop closed this conversation."

const METHOD_TEXT: Record<RefundMethod, string> = { cash: "in cash", upi: "by UPI", razorpay_dashboard: "to the way you paid online" }
export const day = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`))

/** The shop pays outside this app and records it, so the words never say the app sent the money. */
export function paidText(amount: number, method: RefundMethod, paidOn: string, ref: string | null): string {
  const bank = method === "razorpay_dashboard" ? " Banks can take 5 to 7 working days to show it." : ""
  return `Paid back by the shop: ${rupees(amount)} ${METHOD_TEXT[method]} on ${day(paidOn)}, as recorded by the shop.${ref ? ` Reference ${ref}.` : ""}${bank}`
}

/** The answer to "Where is my refund?", from the record alone. */
export function refundStatusText(r: { status: string; amountRequested: number | null; amountApproved: number | null; refundMethod: string | null; refundPaidOn: string | null; refundRef: string | null }): string {
  if (r.status === "refunded" && r.refundMethod && r.refundPaidOn) return paidText(r.amountApproved ?? 0, r.refundMethod as RefundMethod, r.refundPaidOn, r.refundRef)
  if (r.status === "refund_due") return `${rupees(r.amountApproved ?? 0)} is approved. The shop has not recorded the payment yet.`
  if (r.status === "requested") return "The shop has not decided yet, so no refund is approved."
  if (r.status === "rejected") return "This return was not accepted, so there is no refund."
  if (r.status === "withdrawn") return "This return was cancelled, so there is no refund."
  return "No return request has been sent, so there is no refund yet."
}
