import { formatKm } from "../core/geo/distance"
import { whatsappLink } from "../whatsapp"

// The generic live-position code moved to lib/core/tracking/fix.ts; re-exported so existing imports keep working. What is
// left here is specific to food deliveries: when a rider's link is open, the scooter ETA, and the WhatsApp messages.
export { FIX_FRESH_MS, TOKEN_RE, ago, fixInputSchema, hashRiderToken, isFresh, newRiderToken, toFix, type FixInput, type LiveFix } from "../core/tracking/fix"

/** How long a rider's link keeps working after the delivery is marked done, so the page can still show "Delivered". */
export const LINK_GRACE_MS = 2 * 3_600_000

const IN_PLAY = new Set(["new", "confirmed", "preparing", "ready", "out_for_delivery"])

/** Whether a rider's link still opens its delivery: while the order is open, and briefly after it is delivered. Never once cancelled. */
export function riderLinkOpen(order: { status: string; deliveredAt: Date | null; updatedAt: Date }, now = Date.now()): boolean {
  if (IN_PLAY.has(order.status)) return true
  if (order.status === "completed") return now - (order.deliveredAt ?? order.updatedAt).getTime() < LINK_GRACE_MS
  return false
}

/** Positions are shared only while a rider is actually on the job. */
export function sharingAllowed(status: string): boolean {
  return status === "confirmed" || status === "preparing" || status === "ready" || status === "out_for_delivery"
}

// ---------- arrival estimate ----------

const SCOOTER_KMH = 22
// Roads are longer than the straight line between two points.
const ROAD_FACTOR = 1.3

/** A rough arrival time from the straight-line distance. Honest about being rough: shown as "about N min". */
export function etaMinutes(distanceKm: number): number {
  return Math.max(1, Math.ceil(((distanceKm * ROAD_FACTOR) / SCOOTER_KMH) * 60))
}

// ---------- the messages the restaurant sends ----------

export function riderMessage(p: { restaurant: string; riderName: string; code: string; address: string; link: string }): string {
  return `Hi ${p.riderName}, new delivery from ${p.restaurant}.\nOrder ${p.code}\nTo: ${p.address || "see the link"}\n\nOpen your delivery link for the details, directions and to share your live location:\n${p.link}`
}

export function customerMessage(p: { restaurant: string; customerName: string; code: string; riderName: string | null; riderPhone: string | null; trackUrl: string; etaKm?: number | null }): string {
  const who = p.riderName ? `${p.riderName}${p.riderPhone ? ` (${p.riderPhone})` : ""} is delivering your order` : "Your order is being prepared for delivery"
  return `Hi ${p.customerName}, ${who} from ${p.restaurant}.\nOrder ${p.code}${p.etaKm ? ` · about ${formatKm(p.etaKm)} km away` : ""}\n\nTrack it live on the map:\n${p.trackUrl}`
}

/** Opens WhatsApp with the message ready to send. Works without any API account. */
export const shareOnWhatsApp = (phone: string, text: string) => whatsappLink(phone, text)
