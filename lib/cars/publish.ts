import { and, eq, like } from "drizzle-orm"
import { z } from "zod"

import { HERO_ANGLE, angleOrder } from "../angles.ts"
import { getVisionClient, type VisionClient } from "../ai/vision.ts"
import { unscopedDb, type Db } from "../db/client.ts"
import { cars, dealers } from "../db/schema/index.ts"
import { scopedDb } from "../db/scoped.ts"
import { tenantUrl } from "../env.ts"
import { billingState, effectivePlanKey } from "../billing/state.ts"
import { getPlan } from "../plans.ts"
import { generateCaption } from "../share/caption.ts"
import { carSlug, uniqueSlug } from "../slug.ts"
import { getCarState, isLanded, publishReadiness, type CarState } from "./state.ts"

export const publishInput = z.object({
  price: z.number().int().min(10_000, "price").max(50_000_000, "price"),
  km: z.number().int().min(0, "km").max(999_999, "km"),
})

export type PublishError = "not_found" | "not_ready" | "invalid" | "cap_reached" | "closed" | "suspended"
export type ShareKit = {
  /** Short link the dealer pastes into captions. Redirects (301) to the canonical page. */
  shortLink: string
  canonicalUrl: string
  caption: string
  captionSource: "ai" | "template" | "stored"
  /** Up to 10 photos, hero first: the Instagram carousel set. */
  photos: { angle: string; url: string }[]
}

const isUniqueViolation = (e: unknown) => (e as { cause?: { code?: string } })?.cause?.code === "23505"

/**
 * Take a draft (or held) car live. Runs in one transaction so the status change, the slug and the
 * append-only "listed" price event either all happen or none do.
 */
export async function publishCar(
  dealerId: string,
  carId: string,
  input: { price: number; km: number },
  opts: { vision?: VisionClient | null } = {},
): Promise<{ ok: true; kit: ShareKit } | { ok: false; error: PublishError; missing?: string[] }> {
  const parsed = publishInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid" }
  const { price, km } = parsed.data

  const before = await getCarState(dealerId, carId)
  if (!before) return { ok: false, error: "not_found" }
  if (before.status === "sold" || before.status === "archived") return { ok: false, error: "closed" }
  const readiness = publishReadiness(before)
  if (!readiness.ready) return { ok: false, error: "not_ready", missing: readiness.missing }

  const [dealer] = await unscopedDb.select().from(dealers).where(eq(dealers.id, dealerId)).limit(1)
  if (!dealer) return { ok: false, error: "not_found" }
  // A dealer whose trial ended unpaid can keep working on drafts but cannot put new cars live.
  if (!billingState(dealer).hasAccess) return { ok: false, error: "suspended" }

  const base = carSlug({
    year: before.year!,
    make: before.variant!.make,
    model: before.variant!.model,
    variant: before.variant!.variant,
    regPrefix: (await regPrefixOf(dealerId, carId)) ?? "",
  })

  let attempt = 0
  for (;;) {
    try {
      const outcome = await unscopedDb.transaction(async (tx) => {
        const db = scopedDb(dealerId, tx as unknown as Db)
        const alreadyLive = before.status === "live"
        if (!alreadyLive) {
          const live = await db.cars.count(eq(cars.status, "live"))
          if (live >= getPlan(effectivePlanKey(dealer)).maxLiveCars) return "cap_reached" as const
        }
        const existing = await db.cars.select(like(cars.slug, `${base}%`))
        const taken = new Set(existing.filter((c) => c.id !== carId).map((c) => c.slug))
        const slug = alreadyLive ? before.slug : uniqueSlug(base, taken)

        await db.cars.update(
          { status: "live", slug, askingPrice: price, kmDriven: km, listedAt: alreadyLive ? undefined : new Date() },
          eq(cars.id, carId),
        )
        // SEAM: payments on hold and lender offers attach to the listing here in v2.
        // Append-only history: log a listing once, and later only genuine price changes.
        if (!alreadyLive) await db.priceEvents.insert({ carId, event: "listed", price })
        else if (before.askingPrice !== price) await db.priceEvents.insert({ carId, event: "price_changed", price })
        return slug
      })
      if (outcome === "cap_reached") return { ok: false, error: "cap_reached" }
      return { ok: true, kit: await buildShareKit(dealerId, carId, { slug: outcome, dealer, price, km, vision: opts.vision }) }
    } catch (e) {
      // Two publishes racing for the same slug: retry once with a fresh view of taken slugs.
      if (isUniqueViolation(e) && attempt++ < 2) continue
      throw e
    }
  }
}

async function regPrefixOf(dealerId: string, carId: string) {
  const [c] = await scopedDb(dealerId).cars.select(eq(cars.id, carId), { limit: 1 })
  return c?.regPrefix ?? null
}

/** Short link, canonical URL, caption and carousel photo set for a live car. */
export async function buildShareKit(
  dealerId: string,
  carId: string,
  ctx: { slug: string; dealer: typeof dealers.$inferSelect; price: number; km: number; vision?: VisionClient | null },
): Promise<ShareKit> {
  const state = (await getCarState(dealerId, carId)) as CarState
  const [row] = await scopedDb(dealerId).cars.select(eq(cars.id, carId), { limit: 1 })
  const shortLink = tenantUrl(ctx.dealer.slug, `/${state.shortCode}`)
  const canonicalUrl = tenantUrl(ctx.dealer.slug, `/${ctx.slug}`)

  const { caption, source } = await generateCaption(ctx.vision === undefined ? getVisionClient() : ctx.vision, {
    dealerName: ctx.dealer.displayName,
    city: ctx.dealer.city,
    phone: ctx.dealer.phone,
    year: state.year!,
    make: state.variant!.make,
    model: state.variant!.model,
    variant: state.variant!.variant,
    fuel: state.fuel,
    transmission: state.transmission,
    kmDriven: ctx.km,
    ownerCount: state.ownerCount,
    price: ctx.price,
    rcVerified: state.rcVerified,
    link: shortLink,
  })
  if (row && row.caption !== caption) await scopedDb(dealerId).cars.update({ caption }, and(eq(cars.id, carId))!)

  const photos = state.media
    .filter((m) => m.kind === "photo" && m.angle && isLanded(m))
    .sort((a, b) => (a.angle === HERO_ANGLE ? -1 : b.angle === HERO_ANGLE ? 1 : angleOrder(a.angle!) - angleOrder(b.angle!)))
    .slice(0, 10)
    .map((m) => ({ angle: m.angle as string, url: m.url }))
  return { shortLink, canonicalUrl, caption, captionSource: source, photos }
}

/** The kit for an already-published car, using its stored caption (no new AI call). */
export async function getShareKit(dealerId: string, carId: string): Promise<ShareKit | null> {
  const state = await getCarState(dealerId, carId)
  if (!state || state.status !== "live") return null
  const [dealer] = await unscopedDb.select().from(dealers).where(eq(dealers.id, dealerId)).limit(1)
  if (!dealer) return null
  const photos = state.media
    .filter((m) => m.kind === "photo" && m.angle && isLanded(m))
    .sort((a, b) => (a.angle === HERO_ANGLE ? -1 : b.angle === HERO_ANGLE ? 1 : angleOrder(a.angle!) - angleOrder(b.angle!)))
    .slice(0, 10)
    .map((m) => ({ angle: m.angle as string, url: m.url }))
  return {
    shortLink: tenantUrl(dealer.slug, `/${state.shortCode}`),
    canonicalUrl: tenantUrl(dealer.slug, `/${state.slug}`),
    caption: state.caption ?? "",
    captionSource: "stored",
    photos,
  }
}

