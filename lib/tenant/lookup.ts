import { and, eq, inArray, isNotNull } from "drizzle-orm"
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"

import { cars, dealerDomains, dealers } from "../db/schema"
import * as schema from "../db/schema"
import { effectivePlanKey } from "../billing/state"
import { getPlan } from "../plans"

// Custom domains (paid tier) and short links: the two lookups the proxy makes on the hot path.
// Lookup only: adding and verifying a domain lives in lib/tenant/domains.ts.

// The proxy runs as Node middleware on Cloudflare Workers, where node-postgres cannot be bundled
// (no raw sockets in that bundle, and a static `pg` import makes the middleware an async module that
// OpenNext cannot load). So on Neon it queries over HTTP; anywhere else (local Postgres) it falls
// back to the shared node-postgres handle, imported lazily.
type ProxyDb = PgDatabase<PgQueryResultHKT, typeof schema>
let cachedDb: Promise<ProxyDb> | null = null

function proxyDb(): Promise<ProxyDb> {
  return (cachedDb ??= (async () => {
    const url = process.env.DATABASE_URL ?? ""
    if (/\.neon\.tech(:|\/|$)/.test(new URL(url).host)) {
      const { neon } = await import("@neondatabase/serverless")
      const { drizzle } = await import("drizzle-orm/neon-http")
      return drizzle(neon(url), { schema }) as unknown as ProxyDb
    }
    return (await import("../db/client")).unscopedDb as unknown as ProxyDb
  })())
}

type Entry = { slug: string | null; expires: number }
const CACHE_TTL_MS = 60_000
const NEGATIVE_TTL_MS = 15_000
const domainCache = new Map<string, Entry>()

/** Resolve a verified custom hostname to a dealer slug. Cached: the proxy runs on every request. */
export async function resolveCustomDomain(hostname: string): Promise<string | null> {
  const hit = domainCache.get(hostname)
  if (hit && hit.expires > Date.now()) return hit.slug

  const db = await proxyDb()
  const [row] = await db
    .select({ slug: dealers.slug, plan: dealers.plan, nextPlan: dealers.nextPlan, nextPlanStartsAt: dealers.nextPlanStartsAt })
    .from(dealerDomains)
    .innerJoin(dealers, eq(dealers.id, dealerDomains.dealerId))
    .where(and(eq(dealerDomains.hostname, hostname), isNotNull(dealerDomains.verifiedAt)))
    .limit(1)

  const slug = row && getPlan(effectivePlanKey(row)).customDomain ? row.slug : null
  if (domainCache.size > 5000) domainCache.clear()
  domainCache.set(hostname, { slug, expires: Date.now() + (slug ? CACHE_TTL_MS : NEGATIVE_TTL_MS) })
  return slug
}

const primaryCache = new Map<string, { host: string | null; expires: number }>()

/**
 * The business's own domain, when it should be used in place of <slug>.<root>: confirmed by the owner, working now, and the plan
 * still includes it. Null otherwise, including on any database error, so the default address keeps serving whatever happens.
 */
export async function resolvePrimaryHost(slug: string): Promise<string | null> {
  // Switched off until Cloudflare for SaaS is set up: no query, and nothing depends on the new columns yet.
  if (!process.env.CUSTOM_DOMAIN_TARGET?.trim()) return null
  const hit = primaryCache.get(slug)
  if (hit && hit.expires > Date.now()) return hit.host

  let host: string | null = null
  try {
    const db = await proxyDb()
    const [row] = await db
      .select({ hostname: dealerDomains.hostname, slug: dealers.slug, plan: dealers.plan, nextPlan: dealers.nextPlan, nextPlanStartsAt: dealers.nextPlanStartsAt })
      .from(dealerDomains)
      .innerJoin(dealers, eq(dealers.id, dealerDomains.dealerId))
      .where(and(eq(dealers.slug, slug), isNotNull(dealerDomains.verifiedAt), isNotNull(dealerDomains.primaryAt)))
      .limit(1)
    host = row && getPlan(effectivePlanKey(row)).customDomain ? row.hostname : null
  } catch (error) {
    console.error("primary domain lookup failed:", error instanceof Error ? error.message : "unknown")
  }
  if (primaryCache.size > 5000) primaryCache.clear()
  primaryCache.set(slug, { host, expires: Date.now() + (host ? CACHE_TTL_MS : NEGATIVE_TTL_MS) })
  return host
}

/** Drops cached answers after a change. Reaches only this server instance; others catch up within the cache time. */
export function forgetDomain(slug: string, hostname: string): void {
  primaryCache.delete(slug)
  domainCache.delete(hostname)
}

/**
 * Short code -> canonical slug, for this dealer's own cars only. The dealer filter is what stops
 * one dealer's short link from ever resolving to another dealer's car. Drafts and archived cars
 * do not resolve; sold cars still do, so an old link keeps working.
 */
export async function resolveShortCode(dealerSlug: string, code: string): Promise<string | null> {
  return (await resolveShortLink(dealerSlug, code))?.carSlug ?? null
}

/** Same lookup, also returning the dealer id, so a click can be counted against the right dealer. */
export async function resolveShortLink(dealerSlug: string, code: string): Promise<{ carSlug: string; dealerId: string } | null> {
  const db = await proxyDb()
  const [row] = await db
    .select({ slug: cars.slug, dealerId: cars.dealerId })
    .from(cars)
    .innerJoin(dealers, eq(dealers.id, cars.dealerId))
    .where(and(eq(dealers.slug, dealerSlug), eq(cars.shortCode, code), inArray(cars.status, ["live", "on_hold", "sold"])))
    .limit(1)
  return row ? { carSlug: row.slug, dealerId: row.dealerId } : null
}
