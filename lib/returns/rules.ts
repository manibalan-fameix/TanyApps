import { z } from "zod"

import type { OrderLine } from "../db/schema/restaurant.ts"

/** The rules of a return (docs/returns/design.md, sections 4 and 5). Pure: everything is worked out from the order and the shop's settings. */

export const REASONS = ["damaged", "wrong_item", "missing_item", "expired", "quality", "changed_mind"] as const
export type ReturnReason = (typeof REASONS)[number]

export const REASON_LABEL: Record<ReturnReason, string> = {
  damaged: "Damaged",
  wrong_item: "Wrong item",
  missing_item: "Missing item",
  expired: "Expired or spoiled",
  quality: "Quality not as expected",
  changed_mind: "Changed my mind",
}

/** A restaurant only takes back what it got wrong, and the food never travels back. */
const RESTAURANT_REASONS: readonly ReturnReason[] = ["wrong_item", "missing_item", "expired"]
export const reasonLabel = (reason: ReturnReason, industry: string) => (industry === "restaurants" && reason === "expired" ? "Spoiled" : REASON_LABEL[reason])

export const MAX_RETURN_PHOTOS = 3
export const MAX_MESSAGE_CHARS = 1000
export const MAX_QUICK_REPLIES = 12
export const FRESH_WINDOW_HOURS = 24

export const DEFAULT_QUICK_REPLIES = [
  "Sorry about that. We are checking now.",
  "Please send one more photo.",
  "No need to send it back.",
  "Please call us so we can sort this out.",
]

const hours = z.number().int().min(1, "A return window is at least 1 hour.").max(24 * 60, "A return window can be at most 60 days.")

export const returnSettingsSchema = z.object({
  /** Off until the owner turns it on. */
  enabled: z.boolean().default(false),
  defaultWindowHours: hours.default(72),
  /** Windows the owner set for particular categories, by category id. */
  categoryHours: z.record(z.string(), hours).default({}),
  blockedCategories: z.array(z.string()).max(500).default([]),
  reasons: z.array(z.enum(REASONS)).min(1, "Keep at least one reason.").default(["damaged", "wrong_item", "missing_item", "expired", "quality"]),
  photoReasons: z.array(z.enum(REASONS)).default(["damaged", "wrong_item", "expired"]),
  replyHours: z.number().int().min(1).max(168).default(24),
  quickReplies: z.array(z.string().trim().min(1).max(200)).max(MAX_QUICK_REPLIES, `Keep up to ${MAX_QUICK_REPLIES} quick replies.`).default(DEFAULT_QUICK_REPLIES),
  policy: z.string().trim().max(1000).default(""),
})
export type ReturnSettings = z.infer<typeof returnSettingsSchema>

const stored = (profile: unknown) => (profile as { returns?: unknown } | null | undefined)?.returns

/** The shop's return rules, kept in dealers.profile.returns. Anything unreadable falls back to the defaults (which are off). */
export function readReturnSettings(profile: unknown): ReturnSettings {
  const parsed = returnSettingsSchema.safeParse(stored(profile) ?? {})
  return parsed.success ? parsed.data : returnSettingsSchema.parse({})
}

/**
 * Whether the owner has ever saved return settings. Until then there can be no conversations, so no screen needs to look for any.
 * A shop that later switches returns off still sees the conversations it has.
 */
export const returnsConfigured = (profile: unknown) => stored(profile) !== undefined

export function reasonsFor(industry: string, settings: ReturnSettings): ReturnReason[] {
  return REASONS.filter((r) => settings.reasons.includes(r) && (industry !== "restaurants" || RESTAURANT_REASONS.includes(r)))
}

export const photoNeeded = (reason: ReturnReason, settings: ReturnSettings) => reason !== "missing_item" && settings.photoReasons.includes(reason)

const FRESH = /fruit|vegetable|veggie|dairy|milk|curd|paneer|bread|bakery|egg|meat|chicken|mutton|fish|seafood|chill|frozen|fresh/i

/** The hours a category's items can be returned in: the owner's figure, else 24 hours for fresh and chilled food and the default for the rest. */
export function windowHoursFor(category: { id: string; name: string } | null, settings: ReturnSettings, industry: string): number {
  if (category && settings.categoryHours[category.id] !== undefined) return settings.categoryHours[category.id]
  if (industry === "restaurants" || (category && FRESH.test(category.name))) return Math.min(FRESH_WINDOW_HOURS, settings.defaultWindowHours)
  return settings.defaultWindowHours
}

export const windowText = (h: number) => (h % 24 === 0 && h >= 48 ? `${h / 24} days` : h === 1 ? "1 hour" : `${h} hours`)

export type ReturnOrder = {
  status: string
  lines: OrderLine[]
  subtotal: number
  discount: number
  gst: number
  deliveryFee: number
  tip: number
  total: number
  deliveredAt: Date | null
  updatedAt: Date
}

/** When the customer got the order. Orders completed before the time was recorded fall back to their last change. */
export const handedOverAt = (order: Pick<ReturnOrder, "deliveredAt" | "updatedAt">) => order.deliveredAt ?? order.updatedAt

/** An earlier return on the same order that still counts: sent, approved or refunded. Rejected and withdrawn ones do not. */
export type PriorReturn = {
  lines: { position: number; qty: number }[]
  reason: ReturnReason
  /** The system's figure when it was sent. */
  requested: number
  /** What the shop agreed to pay, once approved. */
  approved: number | null
}

export type LineState = {
  position: number
  name: string
  portion: string | null
  unitPrice: number
  ordered: number
  /** How many can still be returned. */
  available: number
  /** Why none can be, or null. */
  blocked: "returned" | "category" | "window" | null
  windowHours: number
}

export function lineStates(
  order: ReturnOrder,
  categoryOf: (itemId: string) => { id: string; name: string } | null,
  settings: ReturnSettings,
  industry: string,
  prior: PriorReturn[],
  now: Date,
): LineState[] {
  const since = now.getTime() - handedOverAt(order).getTime()
  return order.lines.map((l, position) => {
    const category = categoryOf(l.itemId)
    const windowHours = windowHoursFor(category, settings, industry)
    const gone = prior.reduce((n, r) => n + r.lines.reduce((m, x) => m + (x.position === position ? x.qty : 0), 0), 0)
    const left = Math.max(0, l.qty - gone)
    const blocked = left === 0 ? "returned" : category && settings.blockedCategories.includes(category.id) ? "category" : since > windowHours * 3_600_000 ? "window" : null
    return { position, name: l.name, portion: l.portion, unitPrice: l.price, ordered: l.qty, available: blocked ? 0 : left, blocked, windowHours }
  })
}

export const blockedText = (s: Pick<LineState, "blocked" | "windowHours">) =>
  s.blocked === "returned" ? "Already reported" : s.blocked === "category" ? "This kind of item can't be returned" : s.blocked === "window" ? `The ${windowText(s.windowHours)} return time has passed` : ""

export type Selection = { position: number; qty: number }[]

/** Null when the selection is acceptable, else why not. Used both when picking and again, inside the transaction, when sending. */
export function selectionError(selection: Selection, states: LineState[]): string | null {
  if (selection.length === 0) return "Choose at least one item."
  if (new Set(selection.map((s) => s.position)).size !== selection.length) return "An item was chosen twice."
  for (const s of selection) {
    const line = states[s.position]
    if (!line || !Number.isInteger(s.qty) || s.qty < 1) return "Choose the items again."
    if (s.qty > line.available) return line.blocked ? `${line.name}: ${blockedText(line).toLowerCase()}.` : `Only ${line.available} of ${line.name} can be returned.`
  }
  return null
}

export const shopAtFault = (reason: ReturnReason) => reason !== "changed_mind"

/** The most that can still be paid back on an order: what was paid, less the tip (never taken back) and what other returns already hold. */
export function refundLimit(order: Pick<ReturnOrder, "total" | "tip">, prior: PriorReturn[]): number {
  return Math.max(0, order.total - order.tip - prior.reduce((n, r) => n + (r.approved ?? r.requested), 0))
}

export type RefundEstimate = { amount: number; deliveryFee: number; lines: { position: number; qty: number; paise: number }[] }

/**
 * For each chosen item: its value, less its share of the coupon, plus its share of GST. The sum is rounded down to whole rupees.
 * The return that completes a whole-order return takes the rounding left over, and gets the delivery fee back too when every part
 * of the order was the shop's fault.
 */
export function estimateRefund(order: ReturnOrder, selection: Selection, reason: ReturnReason, prior: PriorReturn[]): RefundEstimate {
  const paidForItems = Math.max(0, order.subtotal - order.discount + order.gst)
  const lines = selection.map((s) => {
    const value = (order.lines[s.position]?.price ?? 0) * s.qty
    return { position: s.position, qty: s.qty, paise: order.subtotal > 0 ? Math.floor((value * 100 * paidForItems) / order.subtotal) : 0 }
  })
  let items = Math.floor(lines.reduce((n, l) => n + l.paise, 0) / 100)

  const returned = new Map<number, number>()
  for (const r of [...prior, { lines: selection }]) for (const l of r.lines) returned.set(l.position, (returned.get(l.position) ?? 0) + l.qty)
  const completes = order.lines.every((l, i) => (returned.get(i) ?? 0) >= l.qty)
  let deliveryFee = 0
  if (completes) {
    // Earlier requests never include the delivery fee, so their figures are item money only.
    items = Math.max(0, paidForItems - prior.reduce((n, r) => n + r.requested, 0))
    if (shopAtFault(reason) && prior.every((r) => shopAtFault(r.reason))) deliveryFee = order.deliveryFee
  }
  const amount = Math.min(items + deliveryFee, refundLimit(order, prior))
  return { amount, deliveryFee: Math.min(deliveryFee, amount), lines }
}
