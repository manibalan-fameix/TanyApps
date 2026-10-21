"use server"

import { revalidatePath } from "next/cache"

import { getDealerContext } from "@/lib/auth/context"
import { hoursSchema } from "@/lib/dealers/onboard"
import { setDealerHours, setDealerTheme } from "@/lib/tenant/settings"
import { validateTheme } from "@/lib/theme/tokens"

export type SaveResult = { ok: true; note?: string } | { ok: false; error: string }

/** Settings are owner-only, and never written for the in-memory demo dealer. */
async function ownerDealerId(): Promise<{ id: string } | { error: string }> {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") return { error: "Please sign in again." }
  if (ctx.role !== "owner") return { error: "Only the owner can change settings." }
  if (!ctx.dealerInDb) return { error: "Settings are not available in the local demo account." }
  return { id: ctx.dealer.id }
}

export async function saveHours(input: unknown): Promise<SaveResult> {
  const who = await ownerDealerId()
  if ("error" in who) return { ok: false, error: who.error }
  const parsed = hoursSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your hours." }
  await setDealerHours(who.id, parsed.data)
  revalidatePath("/settings/hours")
  return { ok: true }
}

export async function saveTheme(input: unknown): Promise<SaveResult> {
  const who = await ownerDealerId()
  if ("error" in who) return { ok: false, error: who.error }
  const result = validateTheme(input)
  if (!result.ok) return { ok: false, error: result.errors[0] ?? "Check your colours." }
  await setDealerTheme(who.id, result.theme)
  revalidatePath("/settings/theme")
  revalidatePath("/", "layout")
  return { ok: true, note: result.adjustments[0] }
}
