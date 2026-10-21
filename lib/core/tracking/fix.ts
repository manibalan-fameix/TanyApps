import { z } from "zod"

import { validCoords } from "../geo/validate"

// Live-position basics shared by every vertical that tracks someone on the move (a delivery rider, a cab driver).

// ---------- the private link a person on the move receives ----------

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

// ---------- what a phone sends ----------

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

export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  return s < 5 ? "just now" : s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`
}
