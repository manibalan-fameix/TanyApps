"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveExceptionAudited } from "@/lib/core/payment-exceptions"
import { superAdminActor } from "@/lib/super/guard"

/** A Tany team member closes a payment exception, with what they did about it. Recorded with their email and the time. */
export async function resolvePaymentException(id: string, resolution: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await superAdminActor() // every action re-checks; a page cannot forget the guard
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Not found." }
  const note = resolution.trim()
  if (note.length < 5) return { ok: false, error: "Say what you did, in a few words." }
  const done = await resolveExceptionAudited(id, actor, note)
  revalidatePath("/super/payments")
  return done ? { ok: true } : { ok: false, error: "Already resolved." }
}
