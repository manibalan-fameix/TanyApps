import { createHmac, timingSafeEqual } from "crypto"

import { eq } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { dealerUsers, dealers, users } from "../db/schema"
import { effectivePlanKey } from "../billing/state"
import { getPlan } from "../plans"

export const LOCAL_LOGIN_COOKIE = "local-login"

const LOCAL_DEALER_SLUG = "sri-murugan"
const DEFAULT_LOCAL_PASSWORD = "admin123"

const getSecret = () => process.env.AUTH_SECRET || process.env.ENCRYPTION_KEY || "development-local-login"

const sign = (email: string) => createHmac("sha256", getSecret()).update(email).digest("base64url")

export const isLocalPasswordLoginEnabled = () => process.env.NODE_ENV === "development"

export const localLoginPassword = () => process.env.LOCAL_ADMIN_PASSWORD || DEFAULT_LOCAL_PASSWORD

export const defaultLocalLoginEmail = () => process.env.SEED_OWNER_EMAIL?.toLowerCase() || "dev@localhost"

export function localLoginCookieValue(email: string) {
  const normalized = email.toLowerCase()
  return `${encodeURIComponent(normalized)}.${sign(normalized)}`
}

export function emailFromLocalLoginCookie(value?: string) {
  if (!value) return null

  const dot = value.lastIndexOf(".")
  if (dot < 1) return null

  const email = decodeURIComponent(value.slice(0, dot)).toLowerCase()
  const signature = value.slice(dot + 1)
  const expected = sign(email)

  try {
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null
    }
  } catch {
    return null
  }

  return email
}

export async function ensureLocalDealerUser(email: string) {
  const normalized = email.toLowerCase()
  const [dealer] = await unscopedDb.select().from(dealers).where(eq(dealers.slug, LOCAL_DEALER_SLUG)).limit(1)
  if (!dealer) throw new Error("Run pnpm db:seed before using local email login.")

  const [user] = await unscopedDb
    .insert(users)
    .values({ email: normalized })
    .onConflictDoUpdate({ target: users.email, set: { email: normalized } })
    .returning()

  await unscopedDb
    .insert(dealerUsers)
    .values({ dealerId: dealer.id, userId: user.id, role: "owner" })
    .onConflictDoNothing()

  return { user, dealer, role: "owner" as const, plan: getPlan(effectivePlanKey(dealer)) }
}

export async function getLocalDealerContext(email: string) {
  const [row] = await unscopedDb
    .select({ user: users, dealer: dealers, role: dealerUsers.role })
    .from(users)
    .innerJoin(dealerUsers, eq(dealerUsers.userId, users.id))
    .innerJoin(dealers, eq(dealers.id, dealerUsers.dealerId))
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  if (!row) return null
  return { user: row.user, dealer: row.dealer, role: row.role, plan: getPlan(effectivePlanKey(row.dealer)) }
}
