import { eq } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { users } from "../db/schema"

export async function getUserPhone(userId: string): Promise<string | null> {
  const [row] = await unscopedDb.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1)
  return row?.phone ?? null
}

/** Saves an OTP-verified E.164 number on the user. False when another user already has it. */
export async function claimVerifiedPhone(userId: string, phone: string): Promise<boolean> {
  const [owner] = await unscopedDb.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1)
  if (owner && owner.id !== userId) return false
  await unscopedDb.update(users).set({ phone }).where(eq(users.id, userId))
  return true
}

/** The verified phone and email on a user row, for prefilling onboarding. */
export async function getUserContact(userId: string): Promise<{ phone: string | null; email: string | null }> {
  const [row] = await unscopedDb.select({ phone: users.phone, email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
  return { phone: row?.phone ?? null, email: row?.email ?? null }
}
