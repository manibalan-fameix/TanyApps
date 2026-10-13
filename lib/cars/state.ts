import { asc, eq } from "drizzle-orm"

import { CAR_ANGLES, type CarAngle } from "../angles.ts"
import { tryDecrypt } from "../crypto/index.ts"
import { carMedia, cars, variants } from "../db/schema/index.ts"
import { scopedDb } from "../db/scoped.ts"
import { unscopedDb } from "../db/client.ts"
import { getStorage } from "../storage/index.ts"
import { isLanded, publishReadiness, type Readiness } from "./readiness.ts"
import { formatReg } from "../reg.ts"
import { emptyMarketplaceDetails, marketplaceDetailsSchema, type MarketplaceDetails } from "./marketplace.ts"
import { readVoiceDraft, type ReadVoiceDraft } from "./from-voice.ts"

export type MediaState = {
  id: string
  kind: "photo" | "video"
  angle: CarAngle | null
  status: "pending" | "uploaded" | "processing" | "ready" | "failed"
  url: string
  analysis: { seen: string[]; missing: string[] } | null
}

export type CarState = {
  id: string
  status: "draft" | "live" | "on_hold" | "sold" | "archived"
  /** Plate, formatted. Dealer-only: the buyer page never receives this. */
  reg: string
  year: number | null
  fuel: string | null
  transmission: string | null
  colour: string | null
  ownerCount: number | null
  insuranceValidTill: string | null
  hypothecationCleared: boolean | null
  rcVerified: boolean
  variant: { id: string; label: string; make: string; model: string; variant: string } | null
  askingPrice: number | null
  kmDriven: number | null
  shortCode: string
  slug: string
  caption: string | null
  marketplaceDetails: MarketplaceDetails
  /** An unfinished "add by voice" session, so the dealer can resume it. Null for every other car. */
  voiceDraft: ReadVoiceDraft | null
  media: MediaState[]
}

/** Load one of the dealer's cars with its variant and media. Returns null if it is not theirs. */
export async function getCarState(dealerId: string, carId: string): Promise<CarState | null> {
  const db = scopedDb(dealerId)
  const [car] = await db.cars.select(eq(cars.id, carId), { limit: 1 })
  if (!car) return null
  const media = await db.carMedia.select(eq(carMedia.carId, carId), { orderBy: [asc(carMedia.sortOrder)] })

  let variant: CarState["variant"] = null
  if (car.variantId) {
    // variants is shared master data (not tenant-scoped).
    const [v] = await unscopedDb.select().from(variants).where(eq(variants.id, car.variantId)).limit(1)
    if (v) variant = { id: v.id, label: `${v.make} ${v.model} ${v.variant}`, make: v.make, model: v.model, variant: v.variant }
  }

  const storage = getStorage()
  return {
    id: car.id,
    status: car.status,
    reg: formatReg(tryDecrypt(car.regNumber) ?? ""),
    year: car.year,
    fuel: car.fuel,
    transmission: car.transmission,
    colour: car.colour,
    ownerCount: car.ownerCount,
    insuranceValidTill: car.insuranceValidTill,
    hypothecationCleared: car.hypothecationCleared,
    rcVerified: car.rcVerifiedAt !== null,
    variant,
    askingPrice: car.askingPrice,
    kmDriven: car.kmDriven,
    shortCode: car.shortCode,
    slug: car.slug,
    caption: car.caption,
    marketplaceDetails: marketplaceDetailsSchema.catch(emptyMarketplaceDetails()).parse(car.marketplaceDetails ?? {}),
    voiceDraft: readVoiceDraft(car.voiceDraft),
    media: media.map((m) => ({
      id: m.id,
      kind: m.kind,
      angle: m.angle,
      status: m.status,
      url: storage.publicUrl(m.r2Key),
      analysis: m.analysis ? { seen: m.analysis.seen, missing: m.analysis.missing } : null,
    })),
  }
}

export { CAR_ANGLES, isLanded, publishReadiness, type Readiness }
