import { asc, eq } from "drizzle-orm"
import { cookies } from "next/headers"
import { cache } from "react"

import { unscopedDb } from "../db/client"
import { dealerUsers, dealers } from "../db/schema"
import { ACTIVE_BUSINESS_COOKIE, type BusinessSummary } from "./active-business"
import { auth } from "./index"
import { DEV_BYPASS_COOKIE, DEV_DEALER, DEV_USER, isDevBypassEnabled } from "./dev-bypass"
import { LOCAL_LOGIN_COOKIE, emailFromLocalLoginCookie, getLocalDealerContext, isLocalPasswordLoginEnabled } from "./local-login"
import { effectivePlanKey } from "../billing/state"
import { getPlan } from "../plans"
import type { IndustryKey } from "../verticals/keys"

export type DealerContext =
  | { status: "anonymous" }
  | { status: "no-dealer"; user: { id: string; name?: string | null; email?: string | null } }
  | {
      status: "ok"
      user: { id: string; name?: string | null; email?: string | null }
      dealer: typeof dealers.$inferSelect
      role: "owner" | "staff"
      plan: ReturnType<typeof getPlan>
      /** Dev-only demo session (no Google sign-in). */
      devBypass?: boolean
      /** False only for the in-memory demo dealer: it has no database row, so never write against its id. */
      dealerInDb: boolean
      /** Every business the user belongs to, oldest first. Absent for the dev demo and local-login sessions. */
      businesses?: BusinessSummary[]
      /** True when the user has several businesses and has not picked one in this session. */
      needsProductChoice?: boolean
    }

/**
 * Resolves the signed-in user to their dealer. When an industry is supplied,
 * the lookup is scoped to that product so one Tany account can own one dealer
 * per product. Everything downstream must use
 * `scopedDb(ctx.dealer.id)`; the dealer id never comes from the request.
 * Without an industry, the business picked this session (see `ACTIVE_BUSINESS_COOKIE`) wins, else the oldest one.
 */
export const getDealerContext = cache(async (industry?: IndustryKey): Promise<DealerContext> => {
  const cookieStore = await cookies()
  if (isLocalPasswordLoginEnabled()) {
    const email = emailFromLocalLoginCookie(cookieStore.get(LOCAL_LOGIN_COOKIE)?.value)
    if (email) {
      const ctx = await getLocalDealerContext(email)
      if (ctx) {
        return {
          status: "ok",
          user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email },
          dealer: ctx.dealer,
          role: ctx.role,
          plan: ctx.plan,
          dealerInDb: true,
        }
      }
    }
  }

  if (isDevBypassEnabled() && cookieStore.get(DEV_BYPASS_COOKIE)) {
    // Use the real seeded dealer when a database is available, so the whole flow can write rows.
    try {
      const rows = await unscopedDb.select().from(dealers).where(eq(dealers.slug, DEV_DEALER.slug)).limit(1)
      const row = rows?.[0]
      if (row) return { status: "ok", user: DEV_USER, dealer: row, role: "owner", plan: getPlan(effectivePlanKey(row)), devBypass: true, dealerInDb: true }
    } catch {
      // No database configured or reachable: fall through to the in-memory demo dealer.
    }
    return { status: "ok", user: DEV_USER, dealer: DEV_DEALER, role: "owner", plan: getPlan(DEV_DEALER.plan), devBypass: true, dealerInDb: false }
  }
  const session = await auth()
  const id = session?.user?.id
  if (!session?.user || !id) return { status: "anonymous" }
  const user = { id, name: session.user.name, email: session.user.email }

  // Every business this user belongs to. A phone number can sign in to several products, so more than one is normal.
  const memberships = await unscopedDb
    .select({ dealer: dealers, role: dealerUsers.role })
    .from(dealerUsers)
    .innerJoin(dealers, eq(dealers.id, dealerUsers.dealerId))
    .where(eq(dealerUsers.userId, user.id))
    .orderBy(asc(dealers.createdAt))

  const businesses: BusinessSummary[] = memberships.map((m) => ({ id: m.dealer.id, name: m.dealer.displayName, industry: m.dealer.industry, logoUrl: m.dealer.logoUrl }))
  const chosenId = cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value
  const chosen = industry ? undefined : memberships.find((m) => m.dealer.id === chosenId)
  const row = industry ? memberships.find((m) => m.dealer.industry === industry) : (chosen ?? memberships[0])

  if (!row) return { status: "no-dealer", user }
  return {
    status: "ok",
    user,
    dealer: row.dealer,
    role: row.role,
    plan: getPlan(effectivePlanKey(row.dealer)),
    dealerInDb: true,
    businesses,
    // Several products and none picked yet this session: the admin sends them to the chooser before the dashboard.
    needsProductChoice: !industry && !chosen && memberships.length > 1,
  }
})
