import type { LiveFix } from "./fix"
import type { StoredRoute } from "./route-plan"

/**
 * Where a tracked person's latest position is kept. On Cloudflare it lives in a Durable Object per tracked thing (strongly
 * consistent, see workers/tracker). Without that binding, such as local development, a vertical-supplied `FixStore`
 * (a database table) holds the same data. The rest of the app does not know which one is in use.
 *
 * The object is named `<dealerId>:<entityId>`. An Eats delivery uses its order id, so names already in use stay valid.
 */
export interface TrackerStub {
  put(fix: LiveFix): Promise<void>
  get(): Promise<LiveFix | null>
  clear(): Promise<void>
  /** The trip's road route, kept next to the position so every viewer shares one lookup. Optional: older stubs lack it. */
  putRoute?(route: StoredRoute): Promise<void>
  getRoute?(): Promise<StoredRoute | null>
}
export interface TrackerNamespace {
  idFromName(name: string): unknown
  get(id: unknown): TrackerStub
}

/** The development/fallback home for the latest position, supplied by the vertical (Eats: the order_locations table). */
export interface FixStore {
  save(dealerId: string, entityId: string, fix: LiveFix): Promise<void>
  read(dealerId: string, entityId: string): Promise<LiveFix | null>
  readMany(dealerId: string, entityIds: string[]): Promise<Map<string, LiveFix>>
  drop(dealerId: string, entityId: string): Promise<void>
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

const stubFor = (ns: TrackerNamespace, dealerId: string, entityId: string) => ns.get(ns.idFromName(`${dealerId}:${entityId}`))

/** Which store is live right now, for the admin to see. */
export async function storeKind(): Promise<"cloudflare" | "database"> {
  return (await binding()) ? "cloudflare" : "database"
}

/**
 * The position functions for one vertical. `ns` on each call is for tests: undefined looks up the real binding, null
 * forces the fallback store.
 */
export function createLiveLocation(fallback: FixStore) {
  // Plain closures (no `this`), so callers can destructure the result.
  async function saveFix(dealerId: string, entityId: string, fix: LiveFix, ns?: TrackerNamespace | null): Promise<void> {
    const space = ns === undefined ? await binding() : ns
    if (space) {
      try {
        return await stubFor(space, dealerId, entityId).put(fix)
      } catch (error) {
        console.error(`tracker put failed, using the database: ${error instanceof Error ? error.message : "unknown"}`)
      }
    }
    await fallback.save(dealerId, entityId, fix)
  }

  async function readFix(dealerId: string, entityId: string, ns?: TrackerNamespace | null): Promise<LiveFix | null> {
    const space = ns === undefined ? await binding() : ns
    if (space) {
      try {
        return await stubFor(space, dealerId, entityId).get()
      } catch (error) {
        console.error(`tracker get failed, using the database: ${error instanceof Error ? error.message : "unknown"}`)
      }
    }
    return fallback.read(dealerId, entityId)
  }

  async function readFixes(dealerId: string, entityIds: string[], ns?: TrackerNamespace | null): Promise<Map<string, LiveFix>> {
    const out = new Map<string, LiveFix>()
    if (entityIds.length === 0) return out
    const space = ns === undefined ? await binding() : ns
    if (space) {
      const got = await Promise.all(entityIds.map((id) => readFix(dealerId, id, space)))
      got.forEach((f, i) => f && out.set(entityIds[i], f))
      return out
    }
    return fallback.readMany(dealerId, entityIds)
  }

  /** Forget the position once the trip is done, so a finished trip is never shown. */
  async function dropFix(dealerId: string, entityId: string, ns?: TrackerNamespace | null): Promise<void> {
    const space = ns === undefined ? await binding() : ns
    if (space) {
      try {
        await stubFor(space, dealerId, entityId).clear()
      } catch (error) {
        console.error(`tracker clear failed: ${error instanceof Error ? error.message : "unknown"}`)
      }
    }
    await fallback.drop(dealerId, entityId)
  }

  return { saveFix, readFix, readFixes, dropFix }
}

/** The route stored for this trip, or null when none is kept (or there is no Cloudflare store). Never throws. */
export async function readRoute(dealerId: string, entityId: string, ns?: TrackerNamespace | null): Promise<StoredRoute | null> {
  const space = ns === undefined ? await binding() : ns
  if (!space) return null
  try {
    return (await stubFor(space, dealerId, entityId).getRoute?.()) ?? null
  } catch (error) {
    console.error(`tracker route get failed: ${error instanceof Error ? error.message : "unknown"}`)
    return null
  }
}

/** Keeps the route for the rest of the trip. A failure only means the next viewer looks the route up again. */
export async function saveRoute(dealerId: string, entityId: string, route: StoredRoute, ns?: TrackerNamespace | null): Promise<void> {
  const space = ns === undefined ? await binding() : ns
  if (!space) return
  try {
    await stubFor(space, dealerId, entityId).putRoute?.(route)
  } catch (error) {
    console.error(`tracker route put failed: ${error instanceof Error ? error.message : "unknown"}`)
  }
}
