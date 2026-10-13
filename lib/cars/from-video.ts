import { eq } from "drizzle-orm"

import type { VideoListing } from "../ai/video-listing.ts"
import { encrypt } from "../crypto/index.ts"
import { cars } from "../db/schema/index.ts"
import { scopedDb } from "../db/scoped.ts"
import { normalizeReg, regPrefix } from "../reg.ts"
import { rankVariants, type VariantRow } from "../variants/match.ts"
import { createDraftCar } from "./create.ts"

/** The top match must beat the runner-up by this much to be picked for the dealer. Otherwise they choose. */
const CLEAR_WIN_GAP = 6

/** The text the variant matcher (and the wizard's search box) starts from. */
export const videoSearchText = (l: VideoListing) =>
  [l.year, l.make, l.model, l.variant, l.fuel, l.transmission].filter(Boolean).join(" ")

/** A variant only when the catalogue has one clear best match; a wrong pick is worse than asking. */
export function pickVariant(all: VariantRow[], l: VideoListing): VariantRow | null {
  if (!l.model) return null
  const ranked = rankVariants(all, { maker: l.make, text: videoSearchText(l), fuel: l.fuel, year: l.year })
  if (ranked.length === 0) return null
  return ranked.length === 1 || ranked[0].score - ranked[1].score >= CLEAR_WIN_GAP ? ranked[0].variant : null
}

/** Write what a listing says onto an existing draft car. Returns whether an exact model was chosen. */
export async function applyListingToCar(
  dealerId: string,
  carId: string,
  listing: VideoListing,
  variants: VariantRow[],
  extra: Partial<typeof cars.$inferInsert> = {},
): Promise<{ variantPicked: boolean }> {
  const variant = pickVariant(variants, listing)
  const plate = listing.plate ? normalizeReg(listing.plate) : null

  await scopedDb(dealerId).cars.update(
    {
      variantId: variant?.id ?? null,
      year: listing.year,
      fuel: listing.fuel ?? variant?.fuel ?? null,
      transmission: listing.transmission ?? variant?.transmission ?? null,
      colour: listing.colour,
      ownerCount: listing.ownerCount,
      kmDriven: listing.kmDriven,
      askingPrice: listing.askingPrice,
      marketplaceDetails: listing.marketplaceDetails,
      ...(plate ? { regNumber: encrypt(plate), regPrefix: regPrefix(plate) } : {}),
      ...extra,
    },
    eq(cars.id, carId),
  )
  return { variantPicked: variant !== null }
}

/**
 * A draft car prefilled from what the video showed. Nothing is published: the dealer still reviews
 * every step. Returns the car and whether a variant was chosen.
 */
export async function createCarFromVideo(
  dealerId: string,
  listing: VideoListing,
  variants: VariantRow[],
): Promise<{ carId: string; variantPicked: boolean }> {
  const carId = await createDraftCar(dealerId)
  const { variantPicked } = await applyListingToCar(dealerId, carId, listing, variants)
  return { carId, variantPicked }
}
