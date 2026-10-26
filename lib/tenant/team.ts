import { and, eq, sql } from "drizzle-orm"

import { audit } from "../core/audit"
import { recordSecurityEvent } from "../core/security-audit"
import { unscopedDb, type Db } from "../db/client"
import { dealerUsers, users } from "../db/schema"
import { scopedDb } from "../db/scoped"

/** People on one dealer's team. Joins `users` (a global table), so it lives here with the other raw-client reads. */
export async function listTeamMembers(dealerId: string) {
  return unscopedDb
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: dealerUsers.role, legacyPassword: sql<boolean>`${users.passwordHash} is not null` })
    .from(dealerUsers)
    .innerJoin(users, eq(users.id, dealerUsers.userId))
    .where(eq(dealerUsers.dealerId, dealerId))
}

export type RemoveStaffResult = { ok: true } | { ok: false; error: "not_on_team" | "owner" | "self" }

/**
 * Removes a staff member from ONE business. Owners cannot be removed and nobody removes themselves. The removal, the business's own
 * audit entry and the platform security trail commit together or not at all. Touches nothing else about the person's account.
 */
export async function removeStaff(dealerId: string, actorId: string, userId: string): Promise<RemoveStaffResult> {
  if (userId === actorId) return { ok: false, error: "self" }
  return unscopedDb.transaction(async (tx) => {
    const db = scopedDb(dealerId, tx as unknown as Db)
    const [target] = await db.dealerUsers.select(eq(dealerUsers.userId, userId))
    if (!target) return { ok: false as const, error: "not_on_team" as const }
    if (target.role === "owner") return { ok: false as const, error: "owner" as const }
    await db.dealerUsers.delete(and(eq(dealerUsers.userId, userId), eq(dealerUsers.role, "staff"))!)
    await audit(db, { actorType: "user", actorId, action: "team.remove_staff", entity: "user", entityId: userId, diff: { role: "staff" } })
    await recordSecurityEvent({ actorType: "owner", actorId, businessId: dealerId, action: "team.remove_staff", targetType: "user", targetId: userId, outcome: "success", metadata: { role: "staff" } }, tx)
    return { ok: true as const }
  })
}
