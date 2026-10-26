"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { z } from "zod"

import { getVisionClient } from "@/lib/ai/vision"
import { readPlate } from "@/lib/ai/plate"
import { getDealerContext } from "@/lib/auth/context"
import { toRcSummary, type RcSummary, type VariantSuggestion } from "@/lib/cars/dto"
import { createDraftCar, InvalidRegError } from "@/lib/cars/create"
import { deleteCar } from "@/lib/cars/delete"
import { confirmUpload, requestUpload, type MediaError } from "@/lib/cars/media"
import { getShareKit, publishCar, publishInput, type PublishError, type ShareKit } from "@/lib/cars/publish"
import { getCarState, type CarState } from "@/lib/cars/state"
import { marketplaceDetailsSchema, type MarketplaceDetails } from "@/lib/cars/marketplace"
import { cars } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { clientIp } from "@/lib/core/guards"
import { rateLimit } from "@/lib/core/rate-limit"
import { meterUsage } from "@/lib/core/usage"
import { getCachedRcRecord, lookupRcForCar } from "@/lib/rc/lookup"
import { RcError, type RcErrorCode } from "@/lib/rc/types"
import { getAllVariants, getVariantById } from "@/lib/variants/repo"
import { suggestVariants } from "@/lib/variants/match"

type Fail<C extends string = string> = { ok: false; error: C }
const fail = <C extends string>(error: C): Fail<C> => ({ ok: false, error })

/** The signed-in dealer. The dealer id always comes from the session, never from the request. */
async function dealer() {
  const ctx = await getDealerContext()
  return ctx.status === "ok" && ctx.dealerInDb ? ctx.dealer : null
}

async function callerIp() {
  const ip = clientIp(await headers())
  return ip === "unknown" ? undefined : ip
}

const uuid = z.string().uuid()

// ---------- 1. plate ----------

const plateInput = z.object({
  base64: z.string().min(100).max(2_000_000),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
})

export async function ocrPlateAction(input: z.infer<typeof plateInput>) {
  const d = await dealer()
  if (!d) return fail("unauthorised")
  const parsed = plateInput.safeParse(input)
  if (!parsed.success) return fail("invalid")
  if (!(await rateLimit(`ocr:${d.id}`, 40, 3_600_000))) return fail("rate_limited")
  if (!(await meterUsage({ dealerId: d.id, feature: "vision_ocr_request" })).allowed) return fail("rate_limited")
  const reading = await readPlate(getVisionClient(), parsed.data)
  return { ok: true as const, ...reading }
}

// ---------- 2. start a car + RC ----------

const regInput = z.object({ reg: z.string().min(4).max(20) })

export type StartCarResult =
  | { ok: true; carId: string; rc: RcSummary | null; rcError: RcErrorCode | null }
  | Fail<"unauthorised" | "invalid_reg" | "invalid">

export async function startCarAction(input: z.infer<typeof regInput>): Promise<StartCarResult> {
  const d = await dealer()
  if (!d) return fail("unauthorised")
  const parsed = regInput.safeParse(input)
  if (!parsed.success) return fail("invalid")

  let carId: string
  try {
    carId = await createDraftCar(d.id, parsed.data.reg)
  } catch (e) {
    if (e instanceof InvalidRegError) return fail("invalid_reg")
    throw e
  }
  // An RC problem never blocks the dealer: they can fill the facts in by hand.
  try {
    const { record } = await lookupRcForCar(d.id, carId, { ip: await callerIp() })
    return { ok: true, carId, rc: toRcSummary(record), rcError: null }
  } catch (e) {
    return { ok: true, carId, rc: null, rcError: e instanceof RcError ? e.code : "provider_error" }
  }
}

export async function retryRcAction(carId: string) {
  const d = await dealer()
  if (!d || !uuid.safeParse(carId).success) return fail("unauthorised")
  try {
    const { record } = await lookupRcForCar(d.id, carId, { ip: await callerIp() })
    return { ok: true as const, rc: toRcSummary(record), rcError: null }
  } catch (e) {
    return { ok: true as const, rc: null, rcError: e instanceof RcError ? e.code : ("provider_error" as RcErrorCode) }
  }
}

// ---------- 3. variant ----------

const matchInput = z.object({ carId: z.string().uuid(), text: z.string().max(200) })

export async function matchVariantsAction(input: z.infer<typeof matchInput>) {
  const d = await dealer()
  if (!d) return fail("unauthorised")
  const parsed = matchInput.safeParse(input)
  if (!parsed.success) return fail("invalid")
  const state = await getCarState(d.id, parsed.data.carId)
  if (!state) return fail("not_found")

  const rc = await getCachedRcRecord(d.id, parsed.data.carId)
  const all = await getAllVariants()
  const found = await suggestVariants(
    all,
    { maker: rc?.makerRaw, model: rc?.modelRaw, text: parsed.data.text, fuel: rc?.fuel ?? state.fuel, year: rc?.manufacturingYear ?? state.year },
    { vision: getVisionClient(), limit: 3 },
  )
  const suggestions: VariantSuggestion[] = found.map((s) => ({
    id: s.variant.id,
    label: `${s.variant.make} ${s.variant.model} ${s.variant.variant}`,
    fuel: s.variant.fuel,
    transmission: s.variant.transmission,
    years: `${s.variant.yearFrom}–${s.variant.yearTo ?? "now"}`,
    engineCc: s.variant.engineCc,
    source: s.source,
  }))
  return { ok: true as const, suggestions }
}

const selectInput = z.object({ carId: z.string().uuid(), variantId: z.string().uuid() })

export async function selectVariantAction(input: z.infer<typeof selectInput>) {
  const d = await dealer()
  if (!d) return fail("unauthorised")
  const parsed = selectInput.safeParse(input)
  if (!parsed.success) return fail("invalid")
  const v = await getVariantById(parsed.data.variantId)
  if (!v) return fail("not_found")
  const state = await getCarState(d.id, parsed.data.carId)
  if (!state) return fail("not_found")
  await scopedDb(d.id).cars.update(
    // The RC's fuel is authoritative; the catalogue fills gaps. Transmission is not on the RC.
    { variantId: v.id, transmission: v.transmission, fuel: state.fuel ?? v.fuel },
    eq(cars.id, parsed.data.carId),
  )
  return { ok: true as const, car: await getCarState(d.id, parsed.data.carId) }
}

const detailsInput = z.object({
  carId: z.string().uuid(),
  year: z.number().int().min(1990).max(new Date().getFullYear() + 1).optional(),
  ownerCount: z.number().int().min(1).max(10).optional(),
  colour: z.string().trim().max(40).optional(),
})

/** Manual facts for when the RC lookup found nothing or is wrong. */
export async function saveDetailsAction(input: z.infer<typeof detailsInput>) {
  const d = await dealer()
  if (!d) return fail("unauthorised")
  const parsed = detailsInput.safeParse(input)
  if (!parsed.success) return fail("invalid")
  const { carId, ...rest } = parsed.data
  if (!(await getCarState(d.id, carId))) return fail("not_found")
  await scopedDb(d.id).cars.update(rest, eq(cars.id, carId))
  return { ok: true as const, car: await getCarState(d.id, carId) }
}

// ---------- 4. uploads ----------

const uploadInput = z.object({
  carId: z.string().uuid(),
  uploadId: z.string().uuid(),
  kind: z.enum(["photo", "video"]),
  angle: z.string().max(40).optional(),
  contentType: z.string().max(60),
  size: z.number().int().positive(),
})

export async function requestUploadAction(input: z.infer<typeof uploadInput>) {
  const d = await dealer()
  if (!d) return fail<MediaError | "unauthorised">("unauthorised")
  const parsed = uploadInput.safeParse(input)
  if (!parsed.success) return fail<MediaError | "unauthorised">("invalid")
  return requestUpload(d.id, parsed.data)
}

const confirmInput = z.object({
  carId: z.string().uuid(),
  mediaId: z.string().uuid(),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  durationSec: z.number().min(0).max(3600).optional(),
})

export async function confirmUploadAction(input: z.infer<typeof confirmInput>) {
  const d = await dealer()
  if (!d) return fail<MediaError | "unauthorised">("unauthorised")
  const parsed = confirmInput.safeParse(input)
  if (!parsed.success) return fail<MediaError | "unauthorised">("invalid")
  return confirmUpload(d.id, parsed.data)
}

export async function getCarStateAction(carId: string): Promise<{ ok: true; car: CarState } | Fail> {
  const d = await dealer()
  if (!d || !uuid.safeParse(carId).success) return fail("unauthorised")
  const car = await getCarState(d.id, carId)
  return car ? { ok: true, car } : fail("not_found")
}

// ---------- 5. marketplace details ----------

const marketplaceInput = z.object({
  carId: z.string().uuid(),
  details: marketplaceDetailsSchema,
})

export async function saveMarketplaceDetailsAction(input: { carId: string; details: MarketplaceDetails }) {
  const d = await dealer()
  if (!d) return fail("unauthorised")
  const parsed = marketplaceInput.safeParse(input)
  if (!parsed.success) {
    // Say which field is wrong, so the dealer can fix it instead of guessing.
    const issue = parsed.error.issues.find((i) => i.path[0] === "details") ?? parsed.error.issues[0]
    const field = String(issue.path.at(-1) ?? "details")
      .replace(/([A-Z])/g, " $1")
      .toLowerCase()
    return { ok: false as const, error: "invalid" as const, detail: `Check "${field}": ${issue.message.toLowerCase()}.` }
  }
  if (!(await getCarState(d.id, parsed.data.carId))) return fail("not_found")
  await scopedDb(d.id).cars.update({ marketplaceDetails: parsed.data.details }, eq(cars.id, parsed.data.carId))
  return { ok: true as const, car: await getCarState(d.id, parsed.data.carId) }
}

// ---------- 6. publish ----------

export async function publishCarAction(input: { carId: string; price: number; km: number }) {
  const d = await dealer()
  if (!d) return fail<PublishError | "unauthorised">("unauthorised")
  if (!uuid.safeParse(input.carId).success) return fail<PublishError | "unauthorised">("invalid")
  const parsed = publishInput.safeParse({ price: input.price, km: input.km })
  if (!parsed.success) return fail<PublishError | "unauthorised">("invalid")
  const r = await publishCar(d.id, input.carId, parsed.data)
  return r
}

export async function getShareKitAction(carId: string): Promise<{ ok: true; kit: ShareKit } | Fail> {
  const d = await dealer()
  if (!d || !uuid.safeParse(carId).success) return fail("unauthorised")
  const kit = await getShareKit(d.id, carId)
  return kit ? { ok: true, kit } : fail("not_found")
}

// ---------- 6. manage a listed car ----------

const manageInput = z.object({
  carId: z.string().uuid(),
  status: z.enum(["live", "on_hold", "sold", "archived"]),
  askingPrice: z.number().int().min(1).max(1_000_000_000).nullable(),
  kmDriven: z.number().int().min(0).max(2_000_000).nullable(),
  ownerCount: z.number().int().min(1).max(10).nullable(),
  colour: z.string().trim().max(40).nullable(),
  insuranceValidTill: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  soldPrice: z.number().int().min(1).max(1_000_000_000).nullable(),
})

/** Edit a published car's status and facts. Drafts go through the add-car wizard instead. */
export async function updateCarAction(input: z.infer<typeof manageInput>) {
  const d = await dealer()
  if (!d) return fail("unauthorised")
  const parsed = manageInput.safeParse(input)
  if (!parsed.success) return fail("invalid")
  const { carId, status, soldPrice, ...facts } = parsed.data

  const db = scopedDb(d.id)
  const [before] = await db.cars.select(eq(cars.id, carId), { limit: 1 })
  if (!before) return fail("not_found")
  if (before.status === "draft") return fail("draft")
  // A car that was never published has no listing to go live with.
  if (status === "live" && !before.listedAt) return fail("not_published")

  const nowSold = status === "sold"
  await db.cars.update(
    {
      ...facts,
      status,
      soldAt: nowSold ? (before.soldAt ?? new Date()) : null,
      soldPrice: nowSold ? (soldPrice ?? facts.askingPrice ?? before.askingPrice) : null,
    },
    eq(cars.id, carId),
  )
  if (nowSold && before.status !== "sold") {
    await db.priceEvents.insert({ carId, event: "sold", price: soldPrice ?? facts.askingPrice ?? before.askingPrice ?? 0 })
  } else if (facts.askingPrice && facts.askingPrice !== before.askingPrice) {
    await db.priceEvents.insert({ carId, event: "price_changed", price: facts.askingPrice })
  }
  revalidatePath("/cars")
  revalidatePath(`/cars/${carId}`)
  return { ok: true as const }
}

// ---------- 7. delete or archive from the cars list ----------

/** Permanently delete a car and its files. Refuses a car with price history or enquiries: archive those instead. */
export async function deleteCarAction(carId: string) {
  const d = await dealer()
  if (!d || !uuid.safeParse(carId).success) return fail("unauthorised")
  if (!(await rateLimit(`delete-car:${d.id}`, 60, 3_600_000))) return fail("rate_limited")
  const res = await deleteCar(d.id, carId)
  if (!res.ok) return fail(res.error)
  revalidatePath("/cars")
  revalidatePath("/dashboard")
  return { ok: true as const }
}

/** Take a published car off the dealer's page without losing anything. */
export async function archiveCarAction(carId: string) {
  const d = await dealer()
  if (!d || !uuid.safeParse(carId).success) return fail("unauthorised")
  const db = scopedDb(d.id)
  const [car] = await db.cars.select(eq(cars.id, carId), { limit: 1 })
  if (!car) return fail("not_found")
  if (car.status === "draft") return fail("draft")
  await db.cars.update({ status: "archived", soldAt: null, soldPrice: null }, eq(cars.id, carId))
  revalidatePath("/cars")
  revalidatePath(`/cars/${carId}`)
  return { ok: true as const }
}
