import { z } from "zod"

import { validCoords } from "./location"
import { formatKm } from "./service-area"
import { whatsappLink } from "../whatsapp"

// ---------- the private link a rider receives ----------

/** 24 random bytes, URL-safe. Whoever holds the link can see and update that one delivery, so it is long and unguessable. */
export function newRiderToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Only this hash is stored, so a copy of the database cannot be turned back into working links. */
export async function hashRiderToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/
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

// ---------- what a rider's phone sends ----------

export const fixInputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().min(0).max(100_000).nullish(),
  heading: z.number().min(0).max(360).nullish(),
})
export type FixInput = z.infer<typeof fixInputSchema>

export type LiveFix = { lat: number; lng: number; accuracy: number | null; heading: number | null; at: number }

/** A position worth keeping: a real point in India. Anything else is a glitch or a spoof and is dropped. */
export function toFix(input: unknown, now = Date.now()): LiveFix | null {
  const parsed = fixInputSchema.safeParse(input)
  if (!parsed.success || !validCoords(parsed.data.lat, parsed.data.lng)) return null
  const { lat, lng, accuracy, heading } = parsed.data
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, accuracy: accuracy ?? null, heading: heading ?? null, at: now }
}

/** A fix older than this is treated as "not live": the rider lost signal or stopped sharing. */
export const FIX_FRESH_MS = 45_000
export const isFresh = (fix: Pick<LiveFix, "at"> | null, now = Date.now()) => fix !== null && now - fix.at <= FIX_FRESH_MS

// ---------- arrival estimate ----------

const SCOOTER_KMH = 22
// Roads are longer than the straight line between two points.
const ROAD_FACTOR = 1.3

/** A rough arrival time from the straight-line distance. Honest about being rough: shown as "about N min". */
export function etaMinutes(distanceKm: number): number {
  return Math.max(1, Math.ceil(((distanceKm * ROAD_FACTOR) / SCOOTER_KMH) * 60))
}

export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  return s < 5 ? "just now" : s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`
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
