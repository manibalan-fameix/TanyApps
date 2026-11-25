import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { getDealerContext } from "../auth/context"
import { type DealerProfile, getDealerBySlug } from "../tenant/dealer"
import { TENANT_HEADER } from "../tenant/host"
import type { IndustryKey } from "../verticals"

/** One industry, or several that share a backend (see ORDER_INDUSTRIES). */
type Industries = IndustryKey | readonly IndustryKey[]
const runs = (dealerIndustry: IndustryKey, allowed: Industries) => (typeof allowed === "string" ? dealerIndustry === allowed : allowed.includes(dealerIndustry))

/**
 * The one place that decides whether a request may act on a vertical's data. Replaces the copies of "is this a restaurant,
 * and is it open" that each action and route used to carry.
 *
 * Tenant side (public pages, `/api/t/*`, server actions on a tenant host): the tenant comes from the host, via the
 * `x-tenant-slug` header the proxy sets. Never from anything the client sends.
 * Admin side: the tenant comes from the signed-in user's membership, never from the request.
 */

type HeaderReader = Pick<Headers, "get">

import { clientIp } from "./client-ip"

export { clientIp }

export type TenantContext = { dealer: DealerProfile; ip: string }

/** For route handlers: the tenant behind this host if it runs `industry` and is open for business, else null. */
export async function tenantFrom(h: HeaderReader, industry: Industries): Promise<TenantContext | null> {
  const slug = h.get(TENANT_HEADER)
  const dealer = slug ? await getDealerBySlug(slug) : null
  if (!dealer || !runs(dealer.industry, industry) || dealer.suspended) return null
  return { dealer, ip: clientIp(h) }
}

/** For server actions and server components on a tenant host. */
export async function tenantContext(industry: Industries): Promise<TenantContext | null> {
  return tenantFrom(await headers(), industry)
}

/** Fails loudly if a tenant row loaded for one tenant is used in a request for another. */
export function assertSameTenant(rowDealerId: string, ctxDealerId: string): void {
  if (rowDealerId !== ctxDealerId) throw new Error("tenant mismatch")
}

export type AdminSession = { dealer: NonNullable<Extract<Awaited<ReturnType<typeof getDealerContext>>, { status: "ok" }>["dealer"]>; owner: boolean; /** Who is acting, for the audit log. */ userId: string }

/** For admin server actions: the signed-in owner/staff of an `industry` business that exists in the database, or null. */
export async function industrySession(industry: Industries): Promise<AdminSession | null> {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || !ctx.dealerInDb || !runs(ctx.dealer.industry, industry)) return null
  return { dealer: ctx.dealer, owner: ctx.role === "owner", userId: ctx.user.id }
}

/** For admin pages: sends everyone else (signed out, no business, or another industry) away. */
export async function requireIndustry(industry: Industries): Promise<AdminSession> {
  const ctx = await getDealerContext()
  if (ctx.status === "anonymous") redirect("/login")
  if (ctx.status === "no-dealer") redirect("/onboarding")
  if (!runs(ctx.dealer.industry, industry) || !ctx.dealerInDb) redirect("/dashboard")
  return { dealer: ctx.dealer, owner: ctx.role === "owner", userId: ctx.user.id }
}
