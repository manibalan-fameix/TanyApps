import type { MonthlyOffer } from "@/lib/restaurant/settings"

/**
 * Rules for monthly grocery plans, with no database and no framework so they can be tested on their own. Every date here is
 * India time: a plan's "5th of the month" means the 5th in India, whatever time zone the server runs in.
 */

/** Delivery days run 1 to 28 so every month has the day. */
export const MAX_DELIVERY_DAY = 28

export type IstDate = { year: number; month: number; day: number; /** "YYYY-MM" */ cycle: string }

const IST_MS = 5.5 * 3_600_000

export function istDate(now: Date): IstDate {
  const d = new Date(now.getTime() + IST_MS)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() + 1
  return { year, month, day: d.getUTCDate(), cycle: `${year}-${String(month).padStart(2, "0")}` }
}

export const cycleOf = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`

/** What the subscriber offer takes off a bill of `subtotal`. Zero when the offer is off. */
export function monthlyDiscount(subtotal: number, offer: MonthlyOffer): number {
  if (!offer.enabled || offer.percentOff <= 0 || subtotal <= 0) return 0
  const raw = Math.floor((subtotal * offer.percentOff) / 100)
  return Math.max(0, Math.min(offer.maxDiscount != null ? Math.min(raw, offer.maxDiscount) : raw, subtotal))
}

/** The bill for one month. Free delivery drops the fee; otherwise the usual fee stands. */
export function monthlyBill(subtotal: number, usualDeliveryFee: number, offer: MonthlyOffer): { subtotal: number; discount: number; deliveryFee: number; total: number } {
  const discount = monthlyDiscount(subtotal, offer)
  const deliveryFee = offer.enabled && offer.freeDelivery ? 0 : usualDeliveryFee
  return { subtotal, discount, deliveryFee, total: subtotal - discount + deliveryFee }
}

/**
 * The `last_cycle` a brand-new (or resumed) plan starts with. If its delivery day is still ahead this month the first order is
 * created on that day (nothing recorded yet); if the day has come or gone, this month is skipped and the first order is next month.
 */
export function startingCycle(deliveryDay: number, now: Date): string | null {
  const t = istDate(now)
  return t.day >= deliveryDay ? t.cycle : null
}

/** Should the daily job create this plan's order now? Once per month, on or after its day. A failed attempt is retried on later days. */
export function isDue(plan: { status: string; deliveryDay: number; lastCycle: string | null }, now: Date): boolean {
  if (plan.status !== "active") return false
  const t = istDate(now)
  return plan.lastCycle !== t.cycle && t.day >= plan.deliveryDay
}

/** The date the customer should expect their next delivery, for display. */
export function nextDelivery(plan: { deliveryDay: number; lastCycle: string | null }, now: Date): { year: number; month: number; day: number } {
  const t = istDate(now)
  if (plan.lastCycle !== t.cycle) return { year: t.year, month: t.month, day: plan.deliveryDay }
  return t.month === 12 ? { year: t.year + 1, month: 1, day: plan.deliveryDay } : { year: t.year, month: t.month + 1, day: plan.deliveryDay }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export const formatDate = (d: { year: number; month: number; day: number }) => `${d.day} ${MONTHS[d.month - 1]} ${d.year}`

/** "1st", "2nd", "3rd", "4th"... for the day picker. */
export function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`
}
