const IST_OFFSET_MS = 5.5 * 3_600_000

/** Midnight at the start of `now`'s day in India, as an instant. */
export function startOfDayIst(now: Date): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - IST_OFFSET_MS)
}

export type OrderStats = {
  todayOrders: number
  todayRevenue: number
  weekRevenue: number
  open: number
  fresh: number
}

/** Cancelled orders, and online orders still waiting for payment, are not sales and not work for the kitchen. */
const NOT_PLACED = new Set(["cancelled", "pending_payment"])
const OPEN = new Set(["new", "confirmed", "preparing", "ready", "out_for_delivery"])

/** Revenue counts every order that was not cancelled. */
export function summariseOrders(rows: { total: number; status: string; createdAt: Date }[], now = new Date()): OrderStats {
  const today = startOfDayIst(now).getTime()
  const week = today - 6 * 86_400_000
  const stats: OrderStats = { todayOrders: 0, todayRevenue: 0, weekRevenue: 0, open: 0, fresh: 0 }
  for (const r of rows) {
    const t = r.createdAt.getTime()
    if (NOT_PLACED.has(r.status)) continue
    if (t >= today) {
      stats.todayOrders += 1
      stats.todayRevenue += r.total
    }
    if (t >= week) stats.weekRevenue += r.total
    if (OPEN.has(r.status)) stats.open += 1
    if (r.status === "new") stats.fresh += 1
  }
  return stats
}

export type DayPoint = { date: string; orders: number; revenue: number }

/** One point per Indian calendar day for the last `days` days, oldest first, with zeros for quiet days. */
export function dailyOrders(rows: { total: number; status: string; createdAt: Date }[], days: number, now = new Date()): DayPoint[] {
  const today = startOfDayIst(now).getTime()
  const points: DayPoint[] = Array.from({ length: days }, (_, i) => ({
    date: new Date(today - (days - 1 - i) * 86_400_000).toISOString(),
    orders: 0,
    revenue: 0,
  }))
  for (const r of rows) {
    if (NOT_PLACED.has(r.status)) continue
    const t = r.createdAt.getTime()
    // Orders since midnight belong to the last point; earlier ones are however many whole days before it (rounded up).
    const idx = t >= today ? days - 1 : days - 1 - Math.ceil((today - t) / 86_400_000)
    if (idx >= 0 && idx < days) {
      points[idx].orders += 1
      points[idx].revenue += r.total
    }
  }
  return points
}

/** Best-selling dishes by quantity, ignoring cancelled orders. */
export function topDishes(rows: { status: string; lines: { name: string; qty: number; price: number }[] }[], limit = 6) {
  const byName = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const r of rows) {
    if (NOT_PLACED.has(r.status)) continue
    for (const l of r.lines) {
      const d = byName.get(l.name) ?? { name: l.name, qty: 0, revenue: 0 }
      d.qty += l.qty
      d.revenue += l.qty * l.price
      byName.set(l.name, d)
    }
  }
  return [...byName.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, limit)
}

export function countBy<T>(rows: T[], key: (r: T) => string): { key: string; count: number }[] {
  const m = new Map<string, number>()
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1)
  return [...m].map(([k, count]) => ({ key: k, count }))
}

// ---------- analytics ----------

type OrderLike = { total: number; status: string; createdAt: Date }

const live = <T extends OrderLike>(rows: T[]) => rows.filter((r) => !NOT_PLACED.has(r.status))

/** Hour of the day (0 to 23, Indian time) for an instant. */
export const hourIst = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).getUTCHours()
/** Day of the week for an instant in Indian time, 0 = Monday. */
export const weekdayIst = (d: Date) => (new Date(d.getTime() + IST_OFFSET_MS).getUTCDay() + 6) % 7

const HOUR_LABEL = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Orders per hour, with every hour of the day present. */
export function ordersByHour(rows: OrderLike[]): { hour: string; orders: number }[] {
  const counts = Array.from({ length: 24 }, () => 0)
  for (const r of live(rows)) counts[hourIst(r.createdAt)] += 1
  return counts.map((orders, h) => ({ hour: HOUR_LABEL(h), orders }))
}

export function ordersByWeekday(rows: OrderLike[]): { day: string; orders: number; revenue: number }[] {
  const out = WEEKDAYS.map((day) => ({ day, orders: 0, revenue: 0 }))
  for (const r of live(rows)) {
    const d = out[weekdayIst(r.createdAt)]
    d.orders += 1
    d.revenue += r.total
  }
  return out
}

export function revenueByDish(rows: { status: string; lines: { name: string; qty: number; price: number }[] }[], limit = 8) {
  return topDishes(rows, 1000)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
}

/** Guests who ordered more than once in the period, and the share of orders that came from them. */
export function repeatStats(rows: (OrderLike & { customerPhone: string })[]) {
  const per = new Map<string, number>()
  for (const r of live(rows)) per.set(r.customerPhone, (per.get(r.customerPhone) ?? 0) + 1)
  const guests = per.size
  const returning = [...per.values()].filter((n) => n > 1).length
  return { guests, returning, new: guests - returning, repeatRate: guests === 0 ? 0 : Math.round((returning / guests) * 100) }
}

export function averageOrderValue(rows: OrderLike[]): number {
  const l = live(rows)
  return l.length === 0 ? 0 : Math.round(l.reduce((n, r) => n + r.total, 0) / l.length)
}

export type AreaRow = { pincode: string; zone: string; orders: number; revenue: number; average: number }

/** Delivery orders grouped by pincode. Pickup and dine-in orders have no address, so they are left out. */
export function ordersByPincode(rows: (OrderLike & { pincode: string | null; zoneName: string | null })[]): AreaRow[] {
  const m = new Map<string, AreaRow>()
  for (const r of live(rows)) {
    if (!r.pincode) continue
    const a = m.get(r.pincode) ?? { pincode: r.pincode, zone: r.zoneName ?? "", orders: 0, revenue: 0, average: 0 }
    a.orders += 1
    a.revenue += r.total
    if (r.zoneName) a.zone = r.zoneName
    m.set(r.pincode, a)
  }
  return [...m.values()].map((a) => ({ ...a, average: Math.round(a.revenue / a.orders) })).sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)
}
