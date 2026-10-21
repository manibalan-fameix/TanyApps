import { and, eq, ne } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { dealerUsers, dealers, userProductPhones, users } from "../db/schema"
import type { IndustryKey } from "../verticals/keys"

export async function getUserPhone(userId: string, industry?: IndustryKey): Promise<string | null> {
  if (industry) {
    const [productPhone] = await unscopedDb
      .select({ phone: userProductPhones.phone })
      .from(userProductPhones)
      .where(and(eq(userProductPhones.userId, userId), eq(userProductPhones.industry, industry)))
      .limit(1)
    if (productPhone?.phone) return productPhone.phone
  }
  const [row] = await unscopedDb.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1)
  return row?.phone ?? null
}

/**
 * Saves an OTP-verified number for this product. A number already used by a
 * different product is allowed; the same product remains one-account-only.
 */
export async function claimVerifiedPhone(
  userId: string,
  phone: string,
  industry: IndustryKey,
): Promise<{ ok: true; associatedProduct?: string } | { ok: false }> {
  const [owner] = await unscopedDb.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1)
  if (owner && owner.id !== userId) {
    const [sameProduct] = await unscopedDb
      .select({ id: dealerUsers.userId })
      .from(dealerUsers)
      .innerJoin(dealers, eq(dealers.id, dealerUsers.dealerId))
      .where(and(eq(dealerUsers.userId, owner.id), eq(dealers.industry, industry)))
      .limit(1)
    if (sameProduct) return { ok: false }

    const [otherProduct] = await unscopedDb
      .select({ industry: dealers.industry })
      .from(dealerUsers)
      .innerJoin(dealers, eq(dealers.id, dealerUsers.dealerId))
      .where(and(eq(dealerUsers.userId, owner.id), ne(dealers.industry, industry)))
      .limit(1)
    await unscopedDb
      .insert(userProductPhones)
      .values({ userId, industry, phone })
      .onConflictDoUpdate({
        target: [userProductPhones.userId, userProductPhones.industry],
        set: { phone, verifiedAt: new Date() },
      })
    return {
      ok: true,
      associatedProduct: otherProduct ? productName(otherProduct.industry) : undefined,
    }
  }

  const current = await getUserPhone(userId)
  if (!current) await unscopedDb.update(users).set({ phone }).where(eq(users.id, userId))
  await unscopedDb
    .insert(userProductPhones)
    .values({ userId, industry, phone })
    .onConflictDoUpdate({
      target: [userProductPhones.userId, userProductPhones.industry],
      set: { phone, verifiedAt: new Date() },
    })
  return { ok: true }
}

const productName = (value: string) => `Tany${value === "motors" ? "Motos" : value === "restaurants" ? "Eats" : "Cabs"}`

/** Returns the other Tany product already owned by this same verified user, if any. */
export async function getOtherProductForUser(userId: string, industry: IndustryKey): Promise<string | null> {
  const [row] = await unscopedDb
    .select({ industry: dealers.industry })
    .from(dealerUsers)
    .innerJoin(dealers, eq(dealers.id, dealerUsers.dealerId))
    .where(and(eq(dealerUsers.userId, userId), ne(dealers.industry, industry)))
    .limit(1)
  if (!row) return null
  return productName(row.industry)
}

/** The verified phone and email on a user row, for prefilling onboarding. */
export async function getUserContact(userId: string): Promise<{ phone: string | null; email: string | null }> {
  const [row] = await unscopedDb.select({ phone: users.phone, email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
  return { phone: row?.phone ?? null, email: row?.email ?? null }
}
