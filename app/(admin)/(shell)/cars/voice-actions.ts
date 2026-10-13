"use server"

import { eq } from "drizzle-orm"
import { z } from "zod"

import { getDealerContext } from "@/lib/auth/context"
import { createDraftCar } from "@/lib/cars/create"
import { applyListingToCar, videoSearchText } from "@/lib/cars/from-video"
import { cleanVoiceValues, readVoiceDraft, voiceToListing } from "@/lib/cars/from-voice"
import { cars } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { allow } from "@/lib/rate-limit"
import { getAllVariants } from "@/lib/variants/repo"

/** The signed-in dealer, only when their plan includes adding a car by voice (Growth and above). */
async function dealer() {
  const ctx = await getDealerContext()
  return ctx.status === "ok" && ctx.dealerInDb ? { ...ctx.dealer, voiceEntry: ctx.plan.voiceEntry } : null
}

const lang = z.enum(["en", "ta", "tg"])
const carIdInput = z.string().uuid().optional()

/** The dealer's own draft car, if that is what this id is. */
async function ownDraft(dealerId: string, carId: string) {
  const [car] = await scopedDb(dealerId).cars.select(eq(cars.id, carId), { limit: 1 })
  return car && car.status === "draft" ? car : null
}

/**
 * Keep what has been said so far. The first call starts a draft car (it then shows in the cars list, where
 * Continue brings the dealer back to the voice page); later calls update it. Once the dealer has moved on to
 * photos the saved session is left alone.
 */
export async function saveVoiceDraftAction(input: { carId?: string; values: Record<string, unknown>; lang: "en" | "ta" | "tg" }) {
  const d = await dealer()
  if (!d) return { ok: false as const, error: "unauthorised" as const }
  if (!d.voiceEntry) return { ok: false as const, error: "plan_required" as const }
  const parsedLang = lang.safeParse(input?.lang)
  const parsedId = carIdInput.safeParse(input?.carId)
  const values = cleanVoiceValues(input?.values)
  if (!parsedLang.success || !parsedId.success || Object.keys(values).length === 0) return { ok: false as const, error: "invalid" as const }
  if (!allow(`voice-draft:${d.id}`, 600, 3_600_000)) return { ok: false as const, error: "rate_limited" as const }

  let carId = parsedId.data
  if (carId) {
    const car = await ownDraft(d.id, carId)
    if (!car) return { ok: false as const, error: "not_found" as const }
    if (readVoiceDraft(car.voiceDraft)?.done) return { ok: true as const, carId }
  } else {
    carId = await createDraftCar(d.id)
  }
  await scopedDb(d.id).cars.update({ voiceDraft: { values, lang: parsedLang.data, done: false } }, eq(cars.id, carId))
  return { ok: true as const, carId }
}

/**
 * Turn the spoken template into the draft car and move on to photos. Uses the draft started while speaking
 * when there is one. Nothing is published: the dealer still reviews every step.
 */
export async function createCarFromVoiceAction(input: Record<string, unknown>, options: { carId?: string; lang?: "en" | "ta" | "tg" } = {}) {
  const d = await dealer()
  if (!d) return { ok: false as const, error: "unauthorised" as const }
  if (!d.voiceEntry) return { ok: false as const, error: "plan_required" as const }
  const values = cleanVoiceValues(input)
  const parsedId = carIdInput.safeParse(options?.carId)
  if (Object.keys(values).length === 0 || !parsedId.success) return { ok: false as const, error: "invalid" as const }
  if (!allow(`voice-listing:${d.id}`, 30, 3_600_000)) return { ok: false as const, error: "rate_limited" as const }

  let carId = parsedId.data
  if (carId) {
    if (!(await ownDraft(d.id, carId))) return { ok: false as const, error: "not_found" as const }
  } else {
    carId = await createDraftCar(d.id)
  }
  const listing = voiceToListing(values)
  await applyListingToCar(d.id, carId, listing, await getAllVariants(), {
    voiceDraft: { values, lang: lang.safeParse(options?.lang).data ?? "en", done: true },
  })
  return { ok: true as const, carId, hint: videoSearchText(listing) }
}
