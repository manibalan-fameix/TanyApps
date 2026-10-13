import { desc, gte } from "drizzle-orm"

import { leads } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { getVariantsByIds } from "@/lib/variants/repo"

const DAY = 86_400_000
export const LEAD_STAGES = ["new", "contacted", "visited", "won", "lost"] as const
export const CAR_STATUSES = ["live", "draft", "on_hold", "sold", "archived"] as const

export type DashboardStats = {
  /** Slug and label per car, so analytics rows (keyed by slug) show a readable name. */
  carTitle: Record<string, string>
  inventoryValue: number
  soldLast30: { count: number; revenue: number }
  statusCounts: { status: string; count: number }[]
  leadStages: { stage: string; count: number }[]
  newLeads: number
  leadsLast7: number
  /** One point per day for the last 30 days. */
  leadTrend: { date: string; leads: number }[]
  recentLeads: { id: string; name: string; car: string; source: string; status: string; ago: string }[]
  /** Live cars that have sat longest without a sale. */
  aging: { id: string; title: string; days: number; price: number | null }[]
  avgDaysLive: number | null
  drafts: number
}

export async function loadDashboardStats(dealerId: string): Promise<DashboardStats> {
  const db = scopedDb(dealerId)
  const now = Date.now()
  const since30 = new Date(now - 30 * DAY)
  const [carRows, leadRows] = await Promise.all([
    db.cars.select(undefined, { limit: 500 }),
    db.leads.select(gte(leads.createdAt, since30), { orderBy: [desc(leads.createdAt)], limit: 1000 }),
  ])

  const variantIds = [...new Set(carRows.map((c) => c.variantId).filter((v): v is string => !!v))]
  const variants = variantIds.length ? await getVariantsByIds(variantIds) : []
  const vLabel = new Map(variants.map((v) => [v.id, `${v.make} ${v.model}`]))
  const title = (c: (typeof carRows)[number]) => [c.year, c.variantId ? vLabel.get(c.variantId) : null].filter(Boolean).join(" ") || "Untitled car"

  const carTitle: Record<string, string> = {}
  const carById = new Map(carRows.map((c) => [c.id, c]))
  for (const c of carRows) carTitle[c.slug] = title(c)

  const live = carRows.filter((c) => c.status === "live")
  const sold30 = carRows.filter((c) => c.status === "sold" && c.soldAt && c.soldAt >= since30)
  const days = (d: Date | null) => (d ? Math.max(0, Math.floor((now - d.getTime()) / DAY)) : 0)
  const liveAges = live.map((c) => days(c.listedAt))

  const trend = new Map<string, number>()
  for (let i = 29; i >= 0; i--) trend.set(new Date(now - i * DAY).toISOString().slice(0, 10), 0)
  for (const l of leadRows) {
    const k = l.createdAt.toISOString().slice(0, 10)
    if (trend.has(k)) trend.set(k, (trend.get(k) ?? 0) + 1)
  }

  return {
    carTitle,
    inventoryValue: live.reduce((s, c) => s + (c.askingPrice ?? 0), 0),
    soldLast30: { count: sold30.length, revenue: sold30.reduce((s, c) => s + (c.soldPrice ?? 0), 0) },
    statusCounts: CAR_STATUSES.map((status) => ({ status, count: carRows.filter((c) => c.status === status).length })),
    leadStages: LEAD_STAGES.map((stage) => ({ stage, count: leadRows.filter((l) => l.status === stage).length })),
    newLeads: leadRows.filter((l) => l.status === "new").length,
    leadsLast7: leadRows.filter((l) => l.createdAt.getTime() > now - 7 * DAY).length,
    leadTrend: [...trend].map(([date, n]) => ({ date, leads: n })),
    recentLeads: leadRows.slice(0, 6).map((l) => ({
      id: l.id,
      name: l.name,
      car: (carById.get(l.carId) && title(carById.get(l.carId)!)) || "A car",
      source: l.source,
      status: l.status,
      ago: (() => { const d = days(l.createdAt); return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago` })(),
    })),
    aging: live
      .map((c) => ({ id: c.id, title: title(c), days: days(c.listedAt), price: c.askingPrice }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 5),
    avgDaysLive: liveAges.length ? Math.round(liveAges.reduce((a, b) => a + b, 0) / liveAges.length) : null,
    drafts: carRows.filter((c) => c.status === "draft").length,
  }
}
