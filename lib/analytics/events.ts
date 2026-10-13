export const EVENT_TYPES = ["view", "share_click", "chat", "store_view"] as const
export type EventType = (typeof EVENT_TYPES)[number]

export const SOURCES = ["whatsapp", "instagram", "facebook", "google", "direct", "other"] as const
export type Source = (typeof SOURCES)[number]

/** Link-preview fetchers and crawlers are not buyers. Counting them would inflate every listing. */
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|slack|preview|curl|wget|headless|lighthouse|monitor/i

export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_UA.test(userAgent)
}

/** Where the visit came from: the dealer's utm_source when they tagged the link, otherwise the referrer site. */
export function classifySource(utmSource: string | null | undefined, referrer: string | null | undefined): Source {
  const hay = `${utmSource ?? ""} ${(() => {
    try {
      return referrer ? new URL(referrer).hostname : ""
    } catch {
      return ""
    }
  })()}`.toLowerCase()
  if (/whatsapp|wa\.me/.test(hay)) return "whatsapp"
  if (/instagram|\big\b/.test(hay)) return "instagram"
  if (/facebook|fb\.com|fb\b|l\.messenger/.test(hay)) return "facebook"
  if (/google/.test(hay)) return "google"
  return hay.trim() === "" ? "direct" : "other"
}

export function deviceOf(userAgent: string | null | undefined): "mobile" | "desktop" {
  return /android|iphone|ipad|mobile/i.test(userAgent ?? "") ? "mobile" : "desktop"
}

export type ListingEvent = {
  event: EventType
  dealerId: string
  /** Car slug, or "" for the showroom page. */
  carSlug: string
  source: Source
  device: "mobile" | "desktop"
  country: string
}

/** Analytics Engine data point. The dealer id is the index, so every read is scoped to one dealer. */
export function toDataPoint(e: ListingEvent) {
  return { indexes: [e.dealerId], blobs: [e.event, e.carSlug, e.source, e.device, e.country], doubles: [1] }
}
