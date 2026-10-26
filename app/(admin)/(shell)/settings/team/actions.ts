"use server"

import { revalidatePath } from "next/cache"

import { getDealerContext } from "@/lib/auth/context"
import { rateLimit } from "@/lib/core/rate-limit"
import { adminUrl } from "@/lib/env"
import { createInvite, revokeInvite } from "@/lib/tenant/invites"
import { removeStaff } from "@/lib/tenant/team"

type Result = { ok: true } | { ok: false; error: string }
export type InviteResult = { ok: true; link: string; expiresAt: string } | { ok: false; error: string }

/** Team changes are owner-only, and never run for the in-memory demo dealer. */
async function owner() {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") return { ctx: null, error: "Please sign in again." }
  if (ctx.role !== "owner") return { ctx: null, error: "Only the owner can manage the team." }
  if (!ctx.dealerInDb) return { ctx: null, error: "Not available in the local demo account." }
  return { ctx, error: null }
}

/**
 * Invites someone to join as staff. The owner chooses who and the role (staff); the person joins by signing in with their own
 * account, so the owner never creates an account or sets anyone's password. The answer is the same whether or not that email or number
 * already has an account anywhere, so the form cannot be used to find out who uses Tany.
 */
export async function inviteTeammate(contact: unknown): Promise<InviteResult> {
  const who = await owner()
  if (!who.ctx) return { ok: false, error: who.error }
  const { ctx } = who
  if (!(await rateLimit(`team:${ctx.user.id}`, 20, 10 * 60_000, { failClosed: true }))) return { ok: false, error: "Too many attempts. Try again in a few minutes." }
  const made = await createInvite(ctx.dealer.id, ctx.user.id, contact)
  if (!made.ok) return { ok: false, error: made.error === "too_many" ? "You have too many open invitations. Revoke some first." : "Enter a valid email address or 10-digit mobile number." }
  revalidatePath("/settings/team")
  return { ok: true, link: adminUrl(`/invite/${made.token}`), expiresAt: made.expiresAt.toISOString() }
}

export async function revokeInvitation(inviteId: string): Promise<Result> {
  const who = await owner()
  if (!who.ctx) return { ok: false, error: who.error }
  const done = await revokeInvite(who.ctx.dealer.id, who.ctx.user.id, inviteId)
  revalidatePath("/settings/team")
  return done ? { ok: true } : { ok: false, error: "That invitation is no longer open." }
}

export async function removeTeammate(userId: string): Promise<Result> {
  const who = await owner()
  if (!who.ctx) return { ok: false, error: who.error }
  const { ctx } = who
  const removed = await removeStaff(ctx.dealer.id, ctx.user.id, userId)
  if (!removed.ok) {
    return { ok: false, error: removed.error === "self" ? "You cannot remove yourself." : removed.error === "owner" ? "An owner cannot be removed." : "That person is not on your team." }
  }
  revalidatePath("/settings/team")
  return { ok: true }
}
