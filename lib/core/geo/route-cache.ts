import { and, eq } from "drizzle-orm"

import { unscopedDb } from "../../db/client"
import { routeDistances } from "../../db/schema"
import type { PlaceRef, PlacesProvider, RouteResult } from "./places"

type Source = RouteResult["source"]

/**
 * How long a road distance may be kept, by where it came from. A value of 0 means "do not store it".
 *
 *  - google: 0 by default. Google's Routes API policy says "caching of most Routes API content is restricted" and allows
 *    storing place IDs only, so distances and durations from Google are not saved unless GOOGLE_ROUTE_CACHE_DAYS is set after
 *    that has been cleared with Google or legal counsel.
 *  - osrm: 30 days. The free OpenStreetMap router has no such restriction (it is only a development fallback).
 *  - manual: never expires. Distances an operator typed in are their own data.
 */
export function ttlMs(source: Source, env: Record<string, string | undefined> = process.env): number | null {
  const day = 86_400_000
  if (source === "manual") return null
  if (source === "osrm") return 30 * day
  const days = Number(env.GOOGLE_ROUTE_CACHE_DAYS ?? 0)
  return Number.isFinite(days) && days > 0 ? Math.min(days, 30) * day : 0
}

export type StoredRoute = RouteResult & { fetchedAt: Date }

export interface RouteStore {
  find(from: string, to: string): Promise<StoredRoute[]>
  save(from: string, to: string, route: RouteResult, at: Date): Promise<void>
}

export const dbRouteStore: RouteStore = {
  async find(from, to) {
    const rows = await unscopedDb.select().from(routeDistances).where(and(eq(routeDistances.originPlaceId, from), eq(routeDistances.destPlaceId, to)))
    return rows.map((r) => ({ distanceM: r.distanceM, durationS: r.durationS, tollEstimatePaise: r.tollEstimatePaise, source: r.source, fetchedAt: r.fetchedAt }))
  },
  async save(from, to, route, at) {
    const values = { originPlaceId: from, destPlaceId: to, distanceM: route.distanceM, durationS: route.durationS, tollEstimatePaise: route.tollEstimatePaise, source: route.source, fetchedAt: at }
    await unscopedDb
      .insert(routeDistances)
      .values(values)
      .onConflictDoUpdate({ target: [routeDistances.originPlaceId, routeDistances.destPlaceId, routeDistances.source], set: { distanceM: values.distanceM, durationS: values.durationS, tollEstimatePaise: values.tollEstimatePaise, fetchedAt: at } })
  },
}

/**
 * Road distance between two places: a stored answer that is still within its time limit, else a fresh lookup that is stored
 * only if its source allows it. A failure to read or write the cache never fails the lookup.
 */
export async function routeBetween(
  provider: PlacesProvider,
  from: PlaceRef,
  to: PlaceRef,
  deps: { store?: RouteStore; now?: Date; env?: Record<string, string | undefined> } = {},
): Promise<{ route: RouteResult; cached: boolean } | null> {
  const store = deps.store ?? dbRouteStore
  const now = deps.now ?? new Date()
  const env = deps.env ?? process.env

  try {
    const hits = (await store.find(from.placeId, to.placeId))
      .filter((h) => {
        const ttl = ttlMs(h.source, env)
        return ttl === null || (ttl > 0 && now.getTime() - h.fetchedAt.getTime() < ttl)
      })
      // An operator's own figure beats anything fetched; otherwise the freshest.
      .sort((a, b) => Number(b.source === "manual") - Number(a.source === "manual") || b.fetchedAt.getTime() - a.fetchedAt.getTime())
    if (hits[0]) return { route: { distanceM: hits[0].distanceM, durationS: hits[0].durationS, tollEstimatePaise: hits[0].tollEstimatePaise, source: hits[0].source }, cached: true }
  } catch (error) {
    console.error(`route cache read failed: ${error instanceof Error ? error.message : "unknown"}`)
  }

  const fresh = await provider.route(from, to)
  if (!fresh) return null
  if ((ttlMs(fresh.source, env) ?? 1) > 0) {
    try {
      await store.save(from.placeId, to.placeId, fresh, now)
    } catch (error) {
      console.error(`route cache write failed: ${error instanceof Error ? error.message : "unknown"}`)
    }
  }
  return { route: fresh, cached: false }
}
