import { type CabPlanLimits, getVertical } from "../verticals"

/**
 * What a cab plan allows, read from the vertical registry (the numbers live there, nowhere else).
 *
 * Vehicles and drivers are HARD limits: adding one past the limit is refused with an upgrade prompt. Bookings per month are a
 * SOFT limit: a customer's booking is never refused because of it. The operator is told instead, at 80% and at 100%.
 */
export function cabLimitsFor(plan: string): CabPlanLimits | null {
  return getVertical("cabs").cabLimits?.[plan as keyof NonNullable<ReturnType<typeof getVertical>["cabLimits"]>] ?? null
}

export type HardLimitKind = "vehicles" | "drivers"

export type LimitCheck = { ok: true; limit: number; remaining: number } | { ok: false; limit: number; message: string }

/** Whether one more vehicle or driver may be added. `current` counts everything the business already has. */
export function checkHardLimit(kind: HardLimitKind, current: number, plan: string): LimitCheck {
  const limits = cabLimitsFor(plan)
  if (!limits) return { ok: false, limit: 0, message: "Your plan does not include TanyCabs. Choose a plan to add vehicles and drivers." }
  const limit = limits[kind]
  if (current >= limit) {
    const noun = kind === "vehicles" ? "vehicles" : "drivers"
    return { ok: false, limit, message: `You have reached the ${limit} ${noun} your plan allows. Upgrade your plan to add more.` }
  }
  return { ok: true, limit, remaining: limit - current - 1 }
}

export type BookingsLevel = "ok" | "warn" | "over"

export type BookingsUsage = { used: number; limit: number; percent: number; level: BookingsLevel }

/** 80% of the monthly allowance is a warning; 100% (or more) is "over". Over is still allowed: bookings are never blocked. */
export function bookingsUsage(used: number, plan: string): BookingsUsage | null {
  const limits = cabLimitsFor(plan)
  if (!limits) return null
  const limit = limits.bookingsPerMonth
  const percent = Math.floor((used * 100) / limit)
  return { used, limit, percent, level: used >= limit ? "over" : used * 100 >= limit * 80 ? "warn" : "ok" }
}

/** The text and tone of the banner for an operator, or null when there is nothing to say. */
export function bookingsBanner(u: BookingsUsage | null): { title: string; body: string; tone: "warning" | "destructive" } | null {
  if (!u || u.level === "ok") return null
  if (u.level === "over")
    return { tone: "destructive", title: "You are over this month's bookings allowance", body: `You have ${u.used.toLocaleString("en-IN")} bookings this month and your plan includes ${u.limit.toLocaleString("en-IN")}. Customers can still book. Upgrade your plan to stay within your allowance.` }
  return { tone: "warning", title: `${u.percent}% of this month's bookings used`, body: `${u.used.toLocaleString("en-IN")} of ${u.limit.toLocaleString("en-IN")} bookings this month. Customers can keep booking; consider upgrading before you reach the limit.` }
}

/** Audit-log action recorded the first time a month crosses each line, for the Tany team to see. */
export const BOOKINGS_EVENT: Record<Exclude<BookingsLevel, "ok">, string> = { warn: "plan.bookings_80_percent", over: "plan.bookings_100_percent" }

/** "2026-11": the month an allowance counts in (IST). */
export const monthKey = (d: Date): string => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 7)
