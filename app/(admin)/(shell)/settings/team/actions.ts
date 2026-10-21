"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getDealerContext } from "@/lib/auth/context"
import { createUser, fillMissingUserDetails, findMembership, findUsersByContact, setUserPasswordHash } from "@/lib/tenant/team"
import { dealerUsers } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { hashPassword } from "@/lib/auth/password"
import { allow } from "@/lib/rate-limit"

type Result = { ok: true } | { ok: false; error: string }

/** Team changes are owner-only, and never run for the in-memory demo dealer. */
async function owner() {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") return { ctx: null, error: "Please sign in again." }
  if (ctx.role !== "owner") return { ctx: null, error: "Only the owner can manage the team." }
  if (!ctx.dealerInDb) return { ctx: null, error: "Not available in the local demo account." }
  return { ctx, error: null }
}

// Ownership is never shared: the only role that can be given is staff.
const teammateSchema = z.object({
  role: z.literal("staff", "Ownership cannot be shared."),
  name: z.string().trim().min(2, "Enter their name.").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  password: z.string().min(8, "Use a password with at least 8 characters.").max(128),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^(\+91|91|0)?[6-9][0-9]{9}$/, "Enter a valid 10-digit mobile number."))
    .transform((v) => `+91${v.slice(-10)}`),
})

/**
 * Gives a teammate staff access. They sign in with this email or mobile number (Firebase links the
 * verified one to this user row), and land in this dealership. One person belongs to one dealership.
 */
export async function addTeammate(input: unknown): Promise<Result> {
  const who = await owner()
  if (!who.ctx) return { ok: false, error: who.error }
  const { ctx } = who
  if (!allow(`team:${ctx.user.id}`, 20, 10 * 60_000)) return { ok: false, error: "Too many attempts. Try again in a few minutes." }
  const parsed = teammateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  const { name, email, phone, password } = parsed.data

  const { byEmail, byPhone } = await findUsersByContact(email, phone)
  if (byEmail && byPhone && byEmail.id !== byPhone.id) return { ok: false, error: "That email and mobile number belong to different people." }
  const existing = byEmail ?? byPhone
  const userId = existing?.id ?? (await createUser({ name, email, phone }))
  if (existing) await fillMissingUserDetails(existing, { name, email, phone })

  const membership = await findMembership(userId)
  if (membership) {
    return {
      ok: false,
      error: membership.dealerId === ctx.dealer.id ? "That person is already on your team." : "That person already belongs to another dealership.",
    }
  }
  await setUserPasswordHash(userId, await hashPassword(password))
  await scopedDb(ctx.dealer.id).dealerUsers.insert({ userId, role: "staff" })
  revalidatePath("/settings/team")
  return { ok: true }
}

export async function removeTeammate(userId: string): Promise<Result> {
  const who = await owner()
  if (!who.ctx) return { ok: false, error: who.error }
  const { ctx } = who
  if (userId === ctx.user.id) return { ok: false, error: "You cannot remove yourself." }
  const [target] = await scopedDb(ctx.dealer.id).dealerUsers.select(eq(dealerUsers.userId, userId))
  if (!target) return { ok: false, error: "That person is not on your team." }
  if (target.role === "owner") return { ok: false, error: "An owner cannot be removed." }
  await scopedDb(ctx.dealer.id).dealerUsers.delete(and(eq(dealerUsers.userId, userId), eq(dealerUsers.role, "staff"))!)
  revalidatePath("/settings/team")
  return { ok: true }
}

/** Owner sets a new password for a staff member. The old one stops working at once. */
export async function resetTeammatePassword(userId: string, password: unknown): Promise<Result> {
  const who = await owner()
  if (!who.ctx) return { ok: false, error: who.error }
  const { ctx } = who
  const parsed = teammateSchema.shape.password.safeParse(password)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the password." }
  const [target] = await scopedDb(ctx.dealer.id).dealerUsers.select(eq(dealerUsers.userId, userId))
  if (!target || target.role !== "staff") return { ok: false, error: "That person is not on your team." }
  await setUserPasswordHash(userId, await hashPassword(parsed.data))
  return { ok: true }
}
