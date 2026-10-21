import { eq, inArray } from "drizzle-orm"

import { type FixStore, createLiveLocation } from "../core/tracking/live-location"
import { orderLocations } from "../db/schema"
import { scopedDb } from "../db/scoped"

// The generic position store lives in lib/core/tracking/live-location.ts. This is the Eats side: a delivery is tracked
// under its order id, and without the Cloudflare Durable Object the latest position is one order_locations row per order.
export { readRoute, saveRoute, storeKind, type TrackerNamespace, type TrackerStub } from "../core/tracking/live-location"

const orderLocationStore: FixStore = {
  async save(dealerId, orderId, fix) {
    const row = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, heading: fix.heading, updatedAt: new Date(fix.at) }
    // The caller has already proved this order belongs to the dealer. The conflict update never touches dealer or order.
    await scopedDb(dealerId).orderLocations.insert({ orderId, ...row }).onConflictDoUpdate({ target: orderLocations.orderId, set: row })
  },
  async read(dealerId, orderId) {
    const [row] = await scopedDb(dealerId).orderLocations.select(eq(orderLocations.orderId, orderId), { limit: 1 })
    return row ? { lat: row.lat, lng: row.lng, accuracy: row.accuracy, heading: row.heading, at: row.updatedAt.getTime() } : null
  },
  async readMany(dealerId, orderIds) {
    const out = new Map<string, { lat: number; lng: number; accuracy: number | null; heading: number | null; at: number }>()
    const rows = await scopedDb(dealerId).orderLocations.select(inArray(orderLocations.orderId, orderIds))
    for (const r of rows) out.set(r.orderId, { lat: r.lat, lng: r.lng, accuracy: r.accuracy, heading: r.heading, at: r.updatedAt.getTime() })
    return out
  },
  async drop(dealerId, orderId) {
    await scopedDb(dealerId).orderLocations.delete(eq(orderLocations.orderId, orderId))
  },
}

export const { saveFix, readFix, readFixes, dropFix } = createLiveLocation(orderLocationStore)
