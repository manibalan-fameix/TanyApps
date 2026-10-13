import { EVENT_TYPES, SOURCES, type EventType, type Source } from "./events"

export const DATASET = "showmoto_listing_events"

export type ListingStats = {
  carSlug: string
  views: number
  shareClicks: number
  chats: number
  topSource: Source | null
  /** Views and shared-link clicks that came from each source. */
  sources: Record<Source, { views: number; clicks: number }>
}
export type Performance = {
  days: number
  listings: ListingStats[]
  storeViews: number
  totals: { views: number; shareClicks: number; chats: number }
  /** The same source breakdown summed over every listing. */
  sourceTotals: Record<Source, { views: number; clicks: number }>
}

const emptySources = () => Object.fromEntries(SOURCES.map((s) => [s, { views: 0, clicks: 0 }])) as Record<Source, { views: number; clicks: number }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Counts per listing, event and source. `_sample_interval` undoes Analytics Engine's sampling. Inputs are validated: they go into SQL text. */
export function buildSql(dealerId: string, days: number): string {
  if (!UUID.test(dealerId)) throw new Error("invalid dealer id")
  const d = Math.min(90, Math.max(1, Math.floor(days)))
  return `SELECT blob2 AS car_slug, blob1 AS event, blob3 AS source, SUM(_sample_interval) AS n FROM ${DATASET} WHERE index1 = '${dealerId}' AND timestamp > NOW() - INTERVAL '${d}' DAY GROUP BY car_slug, event, source FORMAT JSON`
}

type Row = { car_slug: string; event: string; source: string; n: number | string }

export function summarise(rows: Row[], days: number): Performance {
  const by = new Map<string, ListingStats>()
  let storeViews = 0
  for (const r of rows) {
    const n = Math.round(Number(r.n) || 0)
    if (!(EVENT_TYPES as readonly string[]).includes(r.event)) continue
    const event = r.event as EventType
    if (event === "store_view") {
      storeViews += n
      continue
    }
    if (!r.car_slug) continue
    const l = by.get(r.car_slug) ?? { carSlug: r.car_slug, views: 0, shareClicks: 0, chats: 0, topSource: null, sources: emptySources() }
    const s = ((SOURCES as readonly string[]).includes(r.source) ? r.source : "other") as Source
    if (event === "view") {
      l.views += n
      l.sources[s].views += n
    } else if (event === "share_click") {
      l.shareClicks += n
      l.sources[s].clicks += n
    }
    else if (event === "chat") l.chats += n
    by.set(r.car_slug, l)
  }
  const listings = [...by.values()].map((l) => {
    const best = SOURCES.map((src) => [src, l.sources[src].views + l.sources[src].clicks] as const).sort((a, b) => b[1] - a[1])[0]
    return { ...l, topSource: best[1] > 0 ? best[0] : null }
  })
  listings.sort((a, b) => b.views + b.shareClicks - (a.views + a.shareClicks))
  const totals = listings.reduce((t, l) => ({ views: t.views + l.views, shareClicks: t.shareClicks + l.shareClicks, chats: t.chats + l.chats }), { views: 0, shareClicks: 0, chats: 0 })
  const sourceTotals = emptySources()
  for (const l of listings) for (const s of SOURCES) {
    sourceTotals[s].views += l.sources[s].views
    sourceTotals[s].clicks += l.sources[s].clicks
  }
  return { days, listings, storeViews, totals, sourceTotals }
}

export type PerformanceResult = { ok: true; data: Performance } | { ok: false; reason: "not_configured" | "no_access" | "failed" }

/** Reads the dealer's numbers from Cloudflare's Analytics Engine SQL API. */
export async function fetchPerformance(dealerId: string, days: number): Promise<PerformanceResult> {
  const token = (process.env.CLOUDFLARE_ANALYTICS_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN)?.trim()
  const account = (process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.R2_ACCOUNT_ID)?.trim()
  if (!token || !account) return { ok: false, reason: "not_configured" }
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: buildSql(dealerId, days),
      signal: AbortSignal.timeout(8000),
    })
    const text = await res.text()
    if (res.status === 401 || res.status === 403 || /authorization error/i.test(text)) return { ok: false, reason: "no_access" }
    // Before the first event is written the dataset does not exist yet: that is an empty result, not a failure.
    if (!res.ok && /unable to find type of column|table .* does not exist|unknown table|not found/i.test(text)) return { ok: true, data: summarise([], days) }
    if (!res.ok) return { ok: false, reason: "failed" }
    const json = JSON.parse(text) as { data?: Row[] }
    return { ok: true, data: summarise(json.data ?? [], days) }
  } catch {
    return { ok: false, reason: "failed" }
  }
}
