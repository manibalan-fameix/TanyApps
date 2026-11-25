import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"

import { isUniqueViolation } from "../cabs/pg.ts"
import type { SignedInCustomer } from "../core/login/customer.ts"
import { decrypt } from "../crypto/index.ts"
import { orderReturns, orders, returnMedia, returnMessages } from "../db/schema/index.ts"
import { phoneLookupHash } from "../db/sealed.ts"
import { type ScopedDb, scopedDb, scopedTransaction } from "../db/scoped.ts"
import { isOpenAt, nextOpeningLabel } from "../hours.ts"
import { getStorage } from "../storage/index.ts"
import type { DealerProfile } from "../tenant/dealer.ts"
import * as say from "./flow.ts"
import { type LineState, MAX_MESSAGE_CHARS, MAX_RETURN_PHOTOS, REASONS, type ReturnReason, type ReturnSettings, type Selection, estimateRefund, handedOverAt, lineStates, photoNeeded, readReturnSettings, reasonLabel, reasonsFor, selectionError, windowText } from "./rules.ts"
import { type ReturnRow, type ThreadMessage, categoryLookup, dropStaleDrafts, latestFirst, messagesOf, patchReturn, postMessage, priorReturns, waitForShop } from "./thread.ts"

/** The customer's side of a return chat. Every function is given a signed-in customer and checks that the order is theirs. */

export type OrderRow = typeof orders.$inferSelect
export type Who = { dealer: DealerProfile; customer: SignedInCustomer }

export type CustomerView = {
  returnId: string
  code: string
  status: say.ReturnStatus
  statusLabel: string
  step: say.BotStep
  orderCode: string
  shopName: string
  shopPhone: string | null
  messages: ThreadMessage[]
  /** Buttons for the current step of a request not yet sent. */
  reasons: { value: ReturnReason; label: string }[]
  lines: (LineState & { note: string })[]
  chosen: Selection
  photoKeysAllowed: number
  /** Whether the customer can type: always while open, and once more after it is finished. */
  canWrite: boolean
  canTalk: boolean
  canSend: boolean
  canChange: boolean
  canWithdraw: boolean
  canAskRefund: boolean
  canStartNew: boolean
  overdue: boolean
  policy: string
}

export type CustomerResult = { ok: true; view: CustomerView } | { ok: false; error: string }
const fail = (error: string) => ({ ok: false as const, error })
const NOT_FOUND = "We could not find that order on your account."

/** An order belongs to a customer when it was placed with the number they have proved is theirs. The order link alone is never enough. */
export function ownsOrder(order: Pick<OrderRow, "customerPhone">, who: Who): boolean {
  if (!who.customer.verifiedAt) return false
  const phone = decrypt(who.customer.phoneEnc, who.dealer.id)
  return Boolean(order.customerPhone) && phoneLookupHash(order.customerPhone) === phoneLookupHash(phone)
}

const opensAt = (dealer: DealerProfile, at: Date) => (isOpenAt(dealer.businessHours, at) === false ? nextOpeningLabel(dealer.businessHours, at) : null)

const whenText = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d)

async function load(db: ScopedDb, who: Who, returnId: string): Promise<{ row: ReturnRow; order: OrderRow } | null> {
  if (!z.string().uuid().safeParse(returnId).success) return null
  const [row] = await db.orderReturns.select(eq(orderReturns.id, returnId), { limit: 1 })
  if (!row || row.customerId !== who.customer.id) return null
  const [order] = await db.orders.select(eq(orders.id, row.orderId), { limit: 1 })
  return order && ownsOrder(order, who) ? { row, order } : null
}

async function statesFor(db: ScopedDb, who: Who, order: OrderRow, settings: ReturnSettings, exceptId?: string) {
  const [categoryOf, prior] = await Promise.all([categoryLookup(db, order.lines.map((l) => l.itemId)), priorReturns(db, order.id, exceptId)])
  return { prior, states: lineStates(order, categoryOf, settings, who.dealer.industry, prior, new Date()) }
}

function whyNothing(states: LineState[]): string {
  if (states.every((s) => s.blocked === "returned")) return "Every item on it has already been reported."
  const late = states.filter((s) => s.blocked === "window")
  if (late.length === states.length) return `The ${windowText(Math.max(...late.map((s) => s.windowHours)))} return time has passed.`
  return "Its items can't be returned now."
}

async function view(db: ScopedDb, who: Who, id: string): Promise<CustomerResult> {
  const found = await load(db, who, id)
  if (!found) return fail(NOT_FOUND)
  const { row, order } = found
  const settings = readReturnSettings(who.dealer.profile)
  const [{ states }, messages, count] = await Promise.all([statesFor(db, who, order, settings, row.id), messagesOf(db, row.id), db.orderReturns.count(eq(orderReturns.orderId, order.id))])
  const status = row.status as say.ReturnStatus
  const draft = status === "draft"
  const open = say.isOpen(status)
  return {
    ok: true,
    view: {
      returnId: row.id,
      code: row.code,
      status,
      statusLabel: say.STATUS_LABEL[status],
      step: row.botStep as say.BotStep,
      orderCode: order.code,
      shopName: who.dealer.displayName,
      shopPhone: who.dealer.phone ?? null,
      messages,
      reasons: reasonsFor(who.dealer.industry, settings).map((value) => ({ value, label: reasonLabel(value, who.dealer.industry) })),
      lines: states.map((s) => ({ ...s, note: s.blocked === "returned" ? "Already reported" : s.blocked === "category" ? "Can't be returned" : s.blocked === "window" ? `${windowText(s.windowHours)} return time has passed` : "" })),
      chosen: row.draft.lines ?? [],
      photoKeysAllowed: MAX_RETURN_PHOTOS,
      canWrite: open || !row.followUpUsed,
      canTalk: draft && !row.needsHelp,
      canSend: draft && row.botStep === "summary" && settings.enabled,
      canChange: draft && ["items", "photo", "summary"].includes(row.botStep),
      canWithdraw: status === "requested",
      canAskRefund: ["requested", "refund_due", "refunded"].includes(status),
      canStartNew: !open && settings.enabled && count < 20 && states.some((s) => s.available > 0),
      overdue: Boolean(row.overdueAt) && row.waitingOn === "shop",
      policy: settings.policy,
    },
  }
}

/** Opens the chat for an order: the conversation already going, else a new one when the shop takes returns. */
export async function openChat(who: Who, orderCode: string, startNew: boolean): Promise<CustomerResult> {
  const db = scopedDb(who.dealer.id)
  if (!/^[A-Za-z0-9]{6}$/.test(orderCode)) return fail(NOT_FOUND)
  const [order] = await db.orders.select(eq(orders.code, orderCode.toUpperCase()), { limit: 1 })
  if (!order || !ownsOrder(order, who)) return fail(NOT_FOUND)
  if (order.status !== "completed") return fail("You can report a problem once the order has reached you.")
  await dropStaleDrafts(db)
  const [latest] = await db.orderReturns.select(eq(orderReturns.orderId, order.id), { orderBy: latestFirst, limit: 1 })
  if (latest && (say.isOpen(latest.status) || !startNew)) return seen(db, who, latest.id)

  const settings = readReturnSettings(who.dealer.profile)
  if (!settings.enabled) return fail("This shop is not taking return requests in the app. Please call the shop.")
  if ((await db.orderReturns.count(eq(orderReturns.orderId, order.id))) >= 20) return fail("Please call the shop about this order.")
  const { states } = await statesFor(db, who, order, settings)
  const eligible = states.some((s) => s.available > 0)
  const hello = eligible ? say.greeting(order.code, whenText(handedOverAt(order))) : say.noReturnsGreeting(order.code, whyNothing(states))

  for (let attempt = 0; attempt < 6; attempt++) {
    const digits = attempt < 4 ? 4 : 6
    const code = `R-${Math.floor(Math.random() * 9 * 10 ** (digits - 1)) + 10 ** (digits - 1)}`
    try {
      const id = await scopedTransaction(who.dealer.id, async (tx) => {
        const [row] = await tx.orderReturns.insert({ orderId: order.id, customerId: who.customer.id, code, botStep: eligible ? "reason" : "outside", customerReadAt: new Date() }).returning({ id: orderReturns.id })
        await postMessage(tx, row.id, { sender: "assistant", body: hello })
        return row.id
      })
      return view(db, who, id)
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
      // Either the number was taken, or the chat was opened twice at once: show the one that won.
      const [open] = await db.orderReturns.select(eq(orderReturns.orderId, order.id), { orderBy: latestFirst, limit: 1 })
      if (open && say.isOpen(open.status)) return view(db, who, open.id)
    }
  }
  return fail("Could not open the chat. Please try again.")
}

/** What the open chat polls: adds the "still waiting" note when the shop is late, and marks the shop's messages as read. */
export async function readChat(who: Who, returnId: string): Promise<CustomerResult> {
  return seen(scopedDb(who.dealer.id), who, returnId)
}

async function seen(db: ScopedDb, who: Who, returnId: string): Promise<CustomerResult> {
  const found = await load(db, who, returnId)
  if (!found) return fail(NOT_FOUND)
  const { row } = found
  const { replyHours } = readReturnSettings(who.dealer.profile)
  if (row.withShop && row.waitingOn === "shop" && !row.overdueAt && Date.now() - row.waitingSince.getTime() > replyHours * 3_600_000) {
    await scopedTransaction(who.dealer.id, async (tx) => {
      // Only the first poll to claim it writes the note.
      const claimed = await tx.orderReturns.update({ overdueAt: new Date() }, and(eq(orderReturns.id, row.id), eq(orderReturns.waitingOn, "shop"), isNull(orderReturns.overdueAt))!).returning({ id: orderReturns.id })
      if (claimed.length === 1) {
        await patchReturn(tx, row.id, {})
        await postMessage(tx, row.id, { sender: "assistant", body: say.OVERDUE })
      }
    })
  }
  if (row.lastShopMessageAt && (!row.customerReadAt || row.customerReadAt < row.lastShopMessageAt)) await db.orderReturns.update({ customerReadAt: new Date() }, eq(orderReturns.id, row.id))
  return view(db, who, row.id)
}

export type Step =
  | { kind: "reason"; reason: string }
  | { kind: "items"; lines: Selection }
  | { kind: "change" }
  | { kind: "send" }
  | { kind: "talk" }
  | { kind: "refund" }
  | { kind: "withdraw" }

export const stepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reason"), reason: z.string() }),
  z.object({ kind: z.literal("items"), lines: z.array(z.object({ position: z.number().int().min(0).max(500), qty: z.number().int().min(1).max(1000) })).max(100) }),
  z.object({ kind: z.literal("change") }),
  z.object({ kind: z.literal("send") }),
  z.object({ kind: z.literal("talk") }),
  z.object({ kind: z.literal("refund") }),
  z.object({ kind: z.literal("withdraw") }),
])

const MOVED = "This chat has moved on. Check the latest messages."

async function summaryFor(db: ScopedDb, who: Who, order: OrderRow, row: ReturnRow, draft: ReturnRow["draft"], photos: number) {
  const { prior } = await statesFor(db, who, order, readReturnSettings(who.dealer.profile), row.id)
  const reason = draft.reason as ReturnReason
  const lines = draft.lines ?? []
  const estimate = estimateRefund(order, lines, reason, prior)
  return say.summaryText(lines.map((l) => ({ name: order.lines[l.position].name, qty: l.qty })), reason, who.dealer.industry, photos, estimate.amount, order.paymentMethod === "online")
}

const photoCount = async (db: ScopedDb, returnId: string) => (await messagesOf(db, returnId)).filter((m) => m.sender === "customer").reduce((n, m) => n + m.photos.length, 0)

/** A button the customer pressed. */
export async function takeStep(who: Who, returnId: string, step: Step): Promise<CustomerResult> {
  const found = await load(scopedDb(who.dealer.id), who, returnId)
  if (!found) return fail(NOT_FOUND)
  const settings = readReturnSettings(who.dealer.profile)
  const now = () => new Date()
  const error = await scopedTransaction(who.dealer.id, async (db): Promise<string | null> => {
    // Read again inside the transaction, so a double tap acts once.
    await db.orderReturns.update({ updatedAt: now() }, eq(orderReturns.id, returnId))
    const [row] = await db.orderReturns.select(eq(orderReturns.id, returnId), { limit: 1 })
    const { order } = found
    const draft = row.status === "draft"
    const said = (body: string) => postMessage(db, row.id, { sender: "customer", body })
    const reply = (body: string) => postMessage(db, row.id, { sender: "assistant", body })

    if (step.kind === "reason") {
      const reason = reasonsFor(who.dealer.industry, settings).find((r) => r === step.reason)
      if (!draft || row.botStep !== "reason" || !reason) return MOVED
      await patchReturn(db, row.id, { botStep: "items", draft: { reason } })
      await said(reasonLabel(reason, who.dealer.industry))
      await reply(say.ASK_ITEMS)
      return null
    }
    if (step.kind === "items") {
      if (!draft || row.botStep !== "items" || !(REASONS as readonly string[]).includes(row.draft.reason ?? "")) return MOVED
      const { states } = await statesFor(db, who, order, settings, row.id)
      const bad = selectionError(step.lines, states)
      if (bad) return bad
      const next = { reason: row.draft.reason, lines: step.lines }
      const askPhoto = photoNeeded(row.draft.reason as ReturnReason, settings)
      await patchReturn(db, row.id, { botStep: askPhoto ? "photo" : "summary", draft: next })
      await said(step.lines.map((l) => `${order.lines[l.position].name} × ${l.qty}`).join(", "))
      await reply(askPhoto ? say.ASK_PHOTO : await summaryFor(db, who, order, row, next, 0))
      return null
    }
    if (step.kind === "change") {
      if (!draft || !["items", "photo", "summary"].includes(row.botStep)) return MOVED
      await patchReturn(db, row.id, { botStep: "reason", draft: {} })
      await said("Change")
      await reply(say.START_AGAIN)
      return null
    }
    if (step.kind === "send") {
      if (!draft || row.botStep !== "summary" || !settings.enabled) return MOVED
      const reason = row.draft.reason as ReturnReason
      const lines = row.draft.lines ?? []
      if (!reasonsFor(who.dealer.industry, settings).includes(reason)) return "That reason is no longer offered. Press Change."
      // Checked again now: time has passed and another return may have been decided since the items were picked.
      const { states, prior } = await statesFor(db, who, order, settings, row.id)
      const bad = selectionError(lines, states)
      if (bad) return bad
      if (photoNeeded(reason, settings) && (await photoCount(db, row.id)) === 0) return "Please add a photo first."
      const estimate = estimateRefund(order, lines, reason, prior)
      if (!(await patchReturn(db, row.id, { status: "requested", botStep: "done", reason, resolution: null, amountRequested: estimate.amount, requestedAt: now(), lastCustomerMessageAt: now(), overdueAt: null, ...waitForShop(row), waitingSince: now() }, ["draft"]))) return MOVED
      for (const l of estimate.lines) {
        const item = order.lines[l.position]
        await db.orderReturnLines.insert({ returnId: row.id, orderLine: l.position, itemId: item.itemId, name: item.name, qty: l.qty, unitPrice: item.price, refundPaise: l.paise })
      }
      await said("Send to shop")
      await reply(say.sentText(row.code, settings.replyHours, opensAt(who.dealer, now())))
      return null
    }
    if (step.kind === "talk") {
      if (!draft || row.needsHelp) return MOVED
      await patchReturn(db, row.id, { needsHelp: true, savedNoteSent: true, lastCustomerMessageAt: now(), ...waitForShop(row) })
      await said("Talk to the shop")
      await reply(say.talkText(settings.replyHours, opensAt(who.dealer, now())))
      return null
    }
    if (step.kind === "refund") {
      if (!["requested", "refund_due", "refunded"].includes(row.status)) return MOVED
      await said("Where is my refund?")
      await reply(say.refundStatusText(row))
      return null
    }
    if (!(await patchReturn(db, row.id, { status: "withdrawn", waitingOn: "none", lastCustomerMessageAt: now() }, ["requested"]))) return MOVED
    await postMessage(db, row.id, { sender: "system", event: "withdrawn", body: say.WITHDRAWN })
    return null
  })
  return error ? fail(error) : view(scopedDb(who.dealer.id), who, returnId)
}

export const messageSchema = z
  .object({
    text: z.string().trim().max(MAX_MESSAGE_CHARS, `Keep a message under ${MAX_MESSAGE_CHARS} characters.`),
    photos: z.array(z.string().uuid()).max(MAX_RETURN_PHOTOS, `You can send up to ${MAX_RETURN_PHOTOS} photos at once.`),
    clientId: z.string().uuid(),
  })
  .refine((m) => m.text !== "" || m.photos.length > 0, "Type a message or add a photo.")

/** Where one customer's return photo lives: under the shop and the customer, with a name nobody can guess. */
export const returnPhotoKey = (dealerId: string, customerId: string, id: string) => `dealers/${dealerId}/returns/${customerId}/${id}.jpg`

const MAX_PHOTOS_PER_RETURN = 12

/** A typed message, with or without photos. Words are passed to the shop as they are; the assistant never reads them. */
export async function sendCustomerMessage(who: Who, returnId: string, message: z.infer<typeof messageSchema>): Promise<CustomerResult> {
  const outer = scopedDb(who.dealer.id)
  const found = await load(outer, who, returnId)
  if (!found) return fail(NOT_FOUND)
  const already = () => outer.returnMessages.count(and(eq(returnMessages.returnId, returnId), eq(returnMessages.clientId, message.clientId))!)
  if ((await already()) > 0) return view(outer, who, returnId)

  const storage = getStorage()
  const photoKeys = [...new Set(message.photos)].map((id) => returnPhotoKey(who.dealer.id, who.customer.id, id))
  for (const key of photoKeys) if (!(await storage.head(key))) return fail("A photo did not finish uploading. Please add it again.")

  const settings = readReturnSettings(who.dealer.profile)
  try {
    const error = await scopedTransaction(who.dealer.id, async (db): Promise<string | null> => {
      await db.orderReturns.update({ updatedAt: new Date() }, eq(orderReturns.id, returnId))
      const [row] = await db.orderReturns.select(eq(orderReturns.id, returnId), { limit: 1 })
      const open = say.isOpen(row.status)
      if (!open && row.followUpUsed) return "This conversation is closed. Please call the shop."
      if (photoKeys.length && (await db.returnMedia.count(eq(returnMedia.returnId, returnId))) + photoKeys.length > MAX_PHOTOS_PER_RETURN) return "This chat already has the most photos it can hold."
      await postMessage(db, row.id, { sender: "customer", body: message.text, clientId: message.clientId, photoKeys })

      // Photos at the photo step answer the assistant's question, so the request moves on to its summary.
      if (row.status === "draft" && row.botStep === "photo" && photoKeys.length > 0) {
        await patchReturn(db, row.id, { botStep: "summary", ...(row.withShop ? { lastCustomerMessageAt: new Date() } : {}) })
        await postMessage(db, row.id, { sender: "assistant", body: await summaryFor(db, who, found.order, row, row.draft, await photoCount(db, row.id)) })
        return null
      }
      // Anything else is for the shop.
      await patchReturn(db, row.id, {
        ...waitForShop(row),
        lastCustomerMessageAt: new Date(),
        ...(row.status === "draft" ? { needsHelp: true, savedNoteSent: true } : {}),
        ...(open ? {} : { followUpUsed: true }),
      })
      if (row.status === "draft" && !row.savedNoteSent) await postMessage(db, row.id, { sender: "assistant", body: say.savedText(opensAt(who.dealer, new Date())) })
      return null
    })
    if (error) return fail(error)
  } catch (e) {
    // The same message arriving twice at once: the first one saved it.
    if (!isUniqueViolation(e) || (await already()) === 0) throw e
  }
  return view(outer, who, returnId)
}
