import { eq } from "drizzle-orm"

import { decrypt } from "../crypto"
import { identityHash } from "../crypto/blind-index"
import { customerIdentities, customers } from "../db/schema"
import type { ScopedDb } from "../db/scoped"
import { signToken, verifyToken } from "../core/login/sign"
import { isUniqueViolation } from "./pg"

/**
 * A Google, Facebook or email sign-in tied to a customer of ONE business. The customer is still identified by a verified phone;
 * this only remembers "this sign-in has already proved that phone here", so the phone step happens once per business. Every row
 * carries the business's dealer_id (the scoped db adds it), so the same Google account at another business is unrelated.
 */
export type SocialProvider = "google.com" | "facebook.com" | "password"
export const isSocialProvider = (p: string): p is SocialProvider => p === "google.com" || p === "facebook.com" || p === "password"

/** The phone of the customer this sign-in belongs to at this business, or null when it has never been tied to one. */
export async function phoneForIdentity(db: ScopedDb, uid: string): Promise<string | null> {
  const [link] = await db.customerIdentities.select(eq(customerIdentities.subjectHash, identityHash(uid)), { limit: 1 })
  if (!link) return null
  const [customer] = await db.customers.select(eq(customers.id, link.customerId), { limit: 1 })
  return customer ? decrypt(customer.phoneEnc) : null
}

export async function linkIdentity(db: ScopedDb, customerId: string, provider: SocialProvider, uid: string): Promise<void> {
  try {
    await db.customerIdentities.insert({ customerId, provider, subjectHash: identityHash(uid) })
  } catch (e) {
    if (!isUniqueViolation(e)) throw e // already linked (a double tap): nothing to do
  }
}

/** Ten minutes to finish the phone step, tied to one business, one login attempt and one sign-in. */
const LINK_TTL_SECONDS = 600
export type LoginLink = { uid: string; provider: SocialProvider; did: string; aud: string; st: string; exp: number }

export const issueLink = (c: Omit<LoginLink, "exp">, now = Date.now()) => signToken("login-link", { ...c, exp: Math.floor(now / 1000) + LINK_TTL_SECONDS })
export const openLink = (token: string | null | undefined, now = Date.now()) => verifyToken<LoginLink>("login-link", token, now)
