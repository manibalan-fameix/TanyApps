import { eq } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { dealerUsers, users } from "../db/schema"

type UserRow = typeof users.$inferSelect

/** People on one dealer's team. Joins `users` (a global table), so it lives here with the other raw-client reads. */
export async function listTeamMembers(dealerId: string) {
  return unscopedDb
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: dealerUsers.role })
    .from(dealerUsers)
    .innerJoin(users, eq(users.id, dealerUsers.userId))
    .where(eq(dealerUsers.dealerId, dealerId))
}

/** The existing users that already own this email and this number (either may be undefined). */
export async function findUsersByContact(email: string, phone: string): Promise<{ byEmail?: UserRow; byPhone?: UserRow }> {
  const [byEmail] = await unscopedDb.select().from(users).where(eq(users.email, email)).limit(1)
  const [byPhone] = await unscopedDb.select().from(users).where(eq(users.phone, phone)).limit(1)
  return { byEmail, byPhone }
}

export async function createUser(input: { name: string; email: string; phone: string }): Promise<string> {
  const [row] = await unscopedDb.insert(users).values(input).returning({ id: users.id })
  return row.id
}

/** Fills in what is missing on a user without overwriting details the person already has. */
export async function fillMissingUserDetails(existing: UserRow, input: { name: string; email: string; phone: string }): Promise<void> {
  await unscopedDb
    .update(users)
    .set({ name: existing.name ?? input.name, email: existing.email ?? input.email, phone: existing.phone ?? input.phone })
    .where(eq(users.id, existing.id))
}

/** The dealer a user belongs to, if any. A user belongs to one dealer, so this is deliberately not scoped. */
export async function findMembership(userId: string) {
  const [row] = await unscopedDb.select().from(dealerUsers).where(eq(dealerUsers.userId, userId)).limit(1)
  return row
}

export async function setUserPasswordHash(userId: string, passwordHash: string): Promise<void> {
  await unscopedDb.update(users).set({ passwordHash }).where(eq(users.id, userId))
}
