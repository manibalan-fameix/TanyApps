import { and, desc, eq, gte, inArray, ne, or } from "drizzle-orm"
import { z } from "zod"

import { audit } from "../core/audit.ts"
import { customers, orderReturnLines, orderReturns, orders, returnMessages } from "../db/schema/index.ts"
import { type ScopedDb, scopedDb, scopedTransaction } from "../db/scoped.ts"
import { decrypt } from "../crypto/index.ts"
import * as say from "./flow.ts"
import { MAX_MESSAGE_CHARS, MAX_RETURN_PHOTOS, type ReturnReason, refundLimit, reasonLabel } from "./rules.ts"
import { type ReturnRow, type ThreadMessage, messagesOf, patchReturn, postMessage, priorReturns } from "./thread.ts"

/** The shop's side of a return. Money and status only ever change through these, never through words typed in the chat. */

export const INBOX_TABS = ["shop", "customer", "done"] as const
export type InboxTab = (typeof INBOX_TABS)[number]

export const tabOf = (r: Pick<ReturnRow, "status" | "waitingOn">): InboxTab => (r.waitingOn === "shop" ? "shop" : say.isOpen(r.status) ? "customer" : "done")

export type InboxRow = {
  id: string
  code: string
  orderCode: string
  customerName: string
  tab: InboxTab
  status: say.ReturnStatus
  needsHelp: boolean
  amount: number | null
  preview: string
  waitingSince: string
  updatedAt: string
  unread: number
}

export async function inbox(dealerId: string): Promise<InboxRow[]> {
  const db = scopedDb(dealerId)
  const rows = await db.orderReturns.select(eq(orderReturns.withShop, true), { orderBy: [desc(orderReturns.updatedAt)], limit: 200 })
  if (rows.length === 0) return []
  const [orderRows, messages] = await Promise.all([
    db.orders.select(inArray(orders.id, [...new Set(rows.map((r) => r.orderId))])),
    db.returnMessages.select(and(inArray(returnMessages.returnId, rows.map((r) => r.id)), eq(returnMessages.sender, "customer"))!, { orderBy: [desc(returnMessages.seq)], limit: 2000 }),
  ])
  return rows
    .map((r) => {
      const order = orderRows.find((o) => o.id === r.orderId)
      const mine = messages.filter((m) => m.returnId === r.id)
      return {
        id: r.id,
        code: r.code,
        orderCode: order?.code ?? "",
        customerName: order?.customerName ?? "Customer",
        tab: tabOf(r),
        status: r.status as say.ReturnStatus,
        needsHelp: r.needsHelp && r.status === "draft",
        amount: r.amountApproved ?? r.amountRequested,
        preview: mine.find((m) => m.body)?.body ?? "Sent a photo",
        waitingSince: r.waitingSince.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        unread: mine.filter((m) => !r.shopReadAt || m.createdAt > r.shopReadAt).length,
      }
    })
    // Longest waiting first where someone is waiting; the newest finished first.
    .sort((a, b) => (a.tab === "done" && b.tab === "done" ? b.updatedAt.localeCompare(a.updatedAt) : a.waitingSince.localeCompare(b.waitingSince)))
}

export const waitingCount = (dealerId: string) => scopedDb(dealerId).orderReturns.count(and(eq(orderReturns.withShop, true), eq(orderReturns.waitingOn, "shop"))!)

export type ShopThread = {
  id: string
  code: string
  status: say.ReturnStatus
  statusLabel: string
  needsHelp: boolean
  waitingOn: string
  waitingSince: string
  reason: string | null
  shopNote: string | null
  amountRequested: number | null
  amountApproved: number | null
  changeReason: string | null
  refundMethod: string | null
  refundRef: string | null
  refundPaidOn: string | null
  /** The most this return can be approved for. */
  limit: number
  items: { name: string; qty: number; unitPrice: number }[]
  order: { id: string; code: string; total: number; paymentMethod: string; paymentStatus: string; razorpayPaymentId: string | null }
  customer: { name: string; phone: string }
  /** The same customer's other returns at this shop, so a pattern is visible. Nothing is blocked automatically. */
  earlier: { id: string; code: string; statusLabel: string; amount: number | null }[]
  messages: ThreadMessage[]
}

async function find(db: ScopedDb, id: string) {
  if (!z.string().uuid().safeParse(id).success) return null
  const [row] = await db.orderReturns.select(eq(orderReturns.id, id), { limit: 1 })
  if (!row?.withShop) return null
  const [order] = await db.orders.select(eq(orders.id, row.orderId), { limit: 1 })
  return order ? { row, order } : null
}

export async function shopThread(dealerId: string, id: string, markRead: boolean): Promise<ShopThread | null> {
  const db = scopedDb(dealerId)
  const found = await find(db, id)
  if (!found) return null
  const { row, order } = found
  if (markRead && row.lastCustomerMessageAt && (!row.shopReadAt || row.shopReadAt < row.lastCustomerMessageAt)) await db.orderReturns.update({ shopReadAt: new Date() }, eq(orderReturns.id, row.id))
  const [lines, messages, prior, earlier, customer] = await Promise.all([
    db.orderReturnLines.select(eq(orderReturnLines.returnId, row.id)),
    messagesOf(db, row.id),
    priorReturns(db, order.id, row.id),
    row.customerId ? db.orderReturns.select(and(eq(orderReturns.customerId, row.customerId), ne(orderReturns.id, row.id), eq(orderReturns.withShop, true))!, { orderBy: [desc(orderReturns.createdAt)], limit: 5 }) : Promise.resolve([]),
    row.customerId ? db.customers.select(eq(customers.id, row.customerId), { limit: 1 }) : Promise.resolve([]),
  ])
  const status = row.status as say.ReturnStatus
  return {
    id: row.id,
    code: row.code,
    status,
    statusLabel: status === "draft" ? "Needs help" : say.STATUS_LABEL[status],
    needsHelp: row.needsHelp && status === "draft",
    waitingOn: row.waitingOn,
    waitingSince: row.waitingSince.toISOString(),
    reason: row.reason ? reasonLabel(row.reason as ReturnReason, "retail") : null,
    shopNote: row.shopNote,
    amountRequested: row.amountRequested,
    amountApproved: row.amountApproved,
    changeReason: row.changeReason,
    refundMethod: row.refundMethod,
    refundRef: row.refundRef,
    refundPaidOn: row.refundPaidOn,
    limit: refundLimit(order, prior),
    items: lines.sort((a, b) => a.orderLine - b.orderLine).map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.unitPrice })),
    order: { id: order.id, code: order.code, total: order.total, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus, razorpayPaymentId: order.razorpayPaymentId },
    customer: { name: order.customerName, phone: customer[0] ? decrypt(customer[0].phoneEnc, dealerId) : order.customerPhone },
    earlier: earlier.map((r) => ({ id: r.id, code: r.code, statusLabel: say.STATUS_LABEL[r.status as say.ReturnStatus], amount: r.amountApproved ?? r.amountRequested })),
    messages,
  }
}

export type ShopResult = { ok: true } | { ok: false; error: string }
export type Actor = { userId: string }
const gone: ShopResult = { ok: false, error: "That conversation was not found." }
const moved: ShopResult = { ok: false, error: "This return was just changed. Check the latest messages." }

/** A status change the customer sees: it is their turn to read, and the shop has answered. */
const answered = () => ({ lastShopMessageAt: new Date(), shopReadAt: new Date(), overdueAt: null, needsHelp: false })

export const replySchema = z
  .object({ text: z.string().trim().max(MAX_MESSAGE_CHARS, `Keep a message under ${MAX_MESSAGE_CHARS} characters.`), photos: z.array(z.string().uuid()).max(MAX_RETURN_PHOTOS), clientId: z.string().uuid() })
  .refine((m) => m.text !== "" || m.photos.length > 0, "Type a message or add a photo.")

export const shopPhotoKey = (dealerId: string, id: string) => `dealers/${dealerId}/returns/shop/${id}.jpg`

export async function shopReply(dealerId: string, actor: Actor, id: string, message: z.infer<typeof replySchema>, photoKeys: string[]): Promise<ShopResult> {
  return scopedTransaction(dealerId, async (db) => {
    const found = await find(db, id)
    if (!found) return gone
    if ((await db.returnMessages.count(and(eq(returnMessages.returnId, id), eq(returnMessages.clientId, message.clientId))!)) > 0) return { ok: true }
    await postMessage(db, id, { sender: "shop", body: message.text, staffUserId: actor.userId, clientId: message.clientId, photoKeys })
    // An approved refund is still the shop's to pay, so replying does not take it off the shop's list.
    const waitingOn = found.row.status === "refund_due" ? "shop" : say.isOpen(found.row.status) ? "customer" : "none"
    // needsHelp stays set on a request not yet sent, so it keeps its label until the shop closes it.
    await patchReturn(db, id, { ...answered(), needsHelp: found.row.needsHelp, waitingOn, ...(waitingOn === found.row.waitingOn ? {} : { waitingSince: new Date() }) })
    return { ok: true }
  })
}

export const approveSchema = z.object({
  amount: z.number().int("Use whole rupees.").min(1, "The refund must be at least ₹1."),
  changeReason: z.string().trim().max(300).default(""),
})

export async function approve(dealerId: string, actor: Actor, id: string, input: z.infer<typeof approveSchema>): Promise<ShopResult> {
  return scopedTransaction(dealerId, async (db) => {
    const found = await find(db, id)
    if (!found) return gone
    const { row, order } = found
    if (row.status !== "requested") return moved
    const limit = refundLimit(order, await priorReturns(db, order.id, row.id))
    if (input.amount > limit) return { ok: false, error: `At most ${say.rupees(limit)} can be paid back on this order.` }
    const changed = input.amount !== row.amountRequested
    if (changed && !input.changeReason) return { ok: false, error: "Say why the amount is different. The customer sees this." }
    const reason = changed ? input.changeReason : null
    if (!(await patchReturn(db, id, { ...answered(), status: "refund_due", resolution: "none", amountApproved: input.amount, changeReason: reason, refundState: "due", decidedAt: new Date(), waitingOn: "shop", waitingSince: new Date() }, ["requested"]))) return moved
    await postMessage(db, id, { sender: "system", event: "approved", staffUserId: actor.userId, body: say.approvedText(input.amount, reason) })
    await audit(db, { actorType: "user", actorId: actor.userId, action: "return.approve", entity: "order_return", entityId: id, diff: { requestedRupees: row.amountRequested, approvedRupees: input.amount, amountChanged: changed } })
    return { ok: true }
  })
}

export const rejectSchema = z.object({ reason: z.string().trim().min(3, "Give a reason. The customer sees it.").max(300) })

export async function reject(dealerId: string, actor: Actor, id: string, input: z.infer<typeof rejectSchema>): Promise<ShopResult> {
  return scopedTransaction(dealerId, async (db) => {
    if (!(await find(db, id))) return gone
    if (!(await patchReturn(db, id, { ...answered(), status: "rejected", shopNote: input.reason, decidedAt: new Date(), waitingOn: "none" }, ["requested"]))) return moved
    await postMessage(db, id, { sender: "system", event: "rejected", staffUserId: actor.userId, body: say.rejectedText(input.reason) })
    await audit(db, { actorType: "user", actorId: actor.userId, action: "return.reject", entity: "order_return", entityId: id })
    return { ok: true }
  })
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())

export const paybackSchema = z.object({
  method: z.enum(["cash", "upi", "razorpay_dashboard"]),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the day you paid."),
  ref: z.string().trim().max(100).default(""),
})

/** Records money the shop has already paid back itself, in cash, by UPI or from its Razorpay dashboard. Nothing is sent from here. */
export async function recordPayback(dealerId: string, actor: Actor, id: string, input: z.infer<typeof paybackSchema>): Promise<ShopResult> {
  return scopedTransaction(dealerId, async (db) => {
    const found = await find(db, id)
    if (!found) return gone
    const { row, order } = found
    if (row.status !== "refund_due") return moved
    if (input.method === "razorpay_dashboard" && (order.paymentMethod !== "online" || order.paymentStatus !== "paid")) return { ok: false, error: "This order was not paid online, so choose cash or UPI." }
    if (input.paidOn > today()) return { ok: false, error: "The payment day can't be in the future." }
    if (input.paidOn < new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(order.createdAt)) return { ok: false, error: "That day is before the order was placed." }
    const ref = input.ref || null
    if (!(await patchReturn(db, id, { ...answered(), status: "refunded", refundState: "refunded", refundMethod: input.method, refundPaidOn: input.paidOn, refundRef: ref, refundedAt: new Date(), waitingOn: "none" }, ["refund_due"]))) return moved
    await postMessage(db, id, { sender: "system", event: "refunded", staffUserId: actor.userId, body: say.paidText(row.amountApproved ?? 0, input.method, input.paidOn, ref) })
    await audit(db, { actorType: "user", actorId: actor.userId, action: "return.refund_recorded", entity: "order_return", entityId: id, diff: { amountRupees: row.amountApproved, method: input.method, paidOn: input.paidOn } })
    return { ok: true }
  })
}

/** Ends a conversation that never became a request. */
export async function closeConversation(dealerId: string, actor: Actor, id: string): Promise<ShopResult> {
  return scopedTransaction(dealerId, async (db) => {
    if (!(await find(db, id))) return gone
    if (!(await patchReturn(db, id, { ...answered(), status: "closed", botStep: "done", waitingOn: "none" }, ["draft"]))) return moved
    await postMessage(db, id, { sender: "system", event: "closed", staffUserId: actor.userId, body: say.CLOSED })
    await audit(db, { actorType: "user", actorId: actor.userId, action: "return.close", entity: "order_return", entityId: id })
    return { ok: true }
  })
}

export type ReturnAlert = { id: string; code: string; orderCode: string; customerName: string; kind: "request" | "help" | "message" | "overdue" | "withdrawn"; at: string }

/** Conversations with something new for the shop since `since`: one entry each, however many messages arrived. */
export async function returnAlerts(dealerId: string, since: Date | null): Promise<ReturnAlert[]> {
  const db = scopedDb(dealerId)
  const after = since ? new Date(since.getTime() + 1) : null
  const fresh = after ? or(gte(orderReturns.lastCustomerMessageAt, after), gte(orderReturns.overdueAt, after)) : undefined
  const rows = await db.orderReturns.select(and(eq(orderReturns.withShop, true), fresh)!, { orderBy: [desc(orderReturns.updatedAt)], limit: 20 })
  if (rows.length === 0) return []
  const orderRows = await db.orders.select(inArray(orders.id, [...new Set(rows.map((r) => r.orderId))]))
  return rows
    .map((r) => {
      const order = orderRows.find((o) => o.id === r.orderId)
      const overdue = Boolean(r.overdueAt && (!r.lastCustomerMessageAt || r.overdueAt > r.lastCustomerMessageAt))
      const sent = Boolean(r.requestedAt && r.lastCustomerMessageAt && Math.abs(r.lastCustomerMessageAt.getTime() - r.requestedAt.getTime()) < 1000)
      const kind: ReturnAlert["kind"] = overdue ? "overdue" : r.status === "withdrawn" ? "withdrawn" : sent ? "request" : r.needsHelp && r.status === "draft" ? "help" : "message"
      return { id: r.id, code: r.code, orderCode: order?.code ?? "", customerName: order?.customerName ?? "Customer", kind, at: new Date(Math.max(r.lastCustomerMessageAt?.getTime() ?? 0, r.overdueAt?.getTime() ?? 0)).toISOString() }
    })
    .sort((a, b) => b.at.localeCompare(a.at))
}

/** An order's returns, for the box on the order's own page. */
export async function returnsForOrder(dealerId: string, orderId: string) {
  const rows = await scopedDb(dealerId).orderReturns.select(and(eq(orderReturns.orderId, orderId), eq(orderReturns.withShop, true))!, { orderBy: [desc(orderReturns.createdAt)] })
  return rows.map((r) => ({ id: r.id, code: r.code, status: r.status as say.ReturnStatus, amount: r.amountApproved ?? r.amountRequested }))
}
