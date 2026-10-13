import { eq, inArray } from "drizzle-orm"

import { orderLocations } from "../db/schema"
import { scopedDb } from "../db/scoped"
import type { LiveFix } from "./tracking"

/**
 * Where a rider's latest position is kept. On Cloudflare it lives in a Durable Object per order (strongly consistent,
 * see workers/tracker). Without that binding, such as local development, the same data is one row per order in the
 * database. The rest of the app does not know which one is in use.
 */
export interface TrackerStub {
  put(fix: LiveFix): Promise<void>
  get(): Promise<LiveFix | null>
  clear(): Promise<void>
}
export interface TrackerNamespace {
  idFromName(name: string): unknown
  get(id: unknown): TrackerStub
}

async function binding(): Promise<TrackerNamespace | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    return (getCloudflareContext().env as { TRACKER?: TrackerNamespace }).TRACKER ?? null
  } catch {
    // Not running on Cloudflare: use the database.
    return null
  }
}

const stubFor = (ns: TrackerNamespace, dealerId: string, orderId: string) => ns.get(ns.idFromName(`${dealerId}:${orderId}`))

/** Which store is live right now, for the admin to see. */
export async function storeKind(): Promise<"cloudflare" | "database"> {
  return (await binding()) ? "cloudflare" : "database"
}

/** `ns` is for tests: undefined looks up the real binding, null forces the database. */
export async function saveFix(dealerId: string, orderId: string, fix: LiveFix, ns?: TrackerNamespace | null): Promise<void> {
  const space = ns === undefined ? await binding() : ns
  if (space) {
    try {
      return await stubFor(space, dealerId, orderId).put(fix)
    } catch (error) {
      console.error(`tracker put failed, using the database: ${error instanceof Error ? error.message : "unknown"}`)
    }
  }
  const row = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, heading: fix.heading, updatedAt: new Date(fix.at) }
  // The caller has already proved this order belongs to the dealer. The conflict update never touches dealer or order.
  await scopedDb(dealerId).orderLocations.insert({ orderId, ...row }).onConflictDoUpdate({ target: orderLocations.orderId, set: row })
}

export async function readFix(dealerId: string, orderId: string, ns?: TrackerNamespace | null): Promise<LiveFix | null> {
  const space = ns === undefined ? await binding() : ns
  if (space) {
    try {
      return await stubFor(space, dealerId, orderId).get()
    } catch (error) {
      console.error(`tracker get failed, using the database: ${error instanceof Error ? error.message : "unknown"}`)
    }
  }
  const [row] = await scopedDb(dealerId).orderLocations.select(eq(orderLocations.orderId, orderId), { limit: 1 })
  return row ? { lat: row.lat, lng: row.lng, accuracy: row.accuracy, heading: row.heading, at: row.updatedAt.getTime() } : null
}

export async function readFixes(dealerId: string, orderIds: string[], ns?: TrackerNamespace | null): Promise<Map<string, LiveFix>> {
  const out = new Map<string, LiveFix>()
  if (orderIds.length === 0) return out
  const space = ns === undefined ? await binding() : ns
  if (space) {
    const got = await Promise.all(orderIds.map((id) => readFix(dealerId, id, space)))
    got.forEach((f, i) => f && out.set(orderIds[i], f))
    return out
  }
  const rows = await scopedDb(dealerId).orderLocations.select(inArray(orderLocations.orderId, orderIds))
  for (const r of rows) out.set(r.orderId, { lat: r.lat, lng: r.lng, accuracy: r.accuracy, heading: r.heading, at: r.updatedAt.getTime() })
  return out
}

/** Forget the position once the delivery is done, so a finished trip is never shown. */
export async function dropFix(dealerId: string, orderId: string, ns?: TrackerNamespace | null): Promise<void> {
  const space = ns === undefined ? await binding() : ns
  if (space) {
    try {
      await stubFor(space, dealerId, orderId).clear()
    } catch (error) {
      console.error(`tracker clear failed: ${error instanceof Error ? error.message : "unknown"}`)
    }
  }
  await scopedDb(dealerId).orderLocations.delete(eq(orderLocations.orderId, orderId))
}
