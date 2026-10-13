import { eq } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { dealerUsers, users } from "../db/schema"
import type { AuthUser } from "./firebase-user"
import { verifyPassword } from "./password"

/** Email + password sign-in for teammates whose owner set a password. Only people still on a team can sign in. */
export async function authenticateTeammate(email: string, password: string): Promise<AuthUser | null> {
  const [user] = await unscopedDb.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1)
  const ok = await verifyPassword(password, user?.passwordHash ?? null)
  if (!user || !ok) return null
  const [membership] = await unscopedDb.select({ id: dealerUsers.userId }).from(dealerUsers).where(eq(dealerUsers.userId, user.id)).limit(1)
  if (!membership) return null
  return { id: user.id, name: user.name, email: user.email, image: user.image }
}
