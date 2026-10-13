import { eq } from "drizzle-orm"

import { carMedia, cars, leads, priceEvents, rcTransfers } from "../db/schema/index.ts"
import { scopedDb } from "../db/scoped.ts"
import { getStorage } from "../storage/index.ts"

export type DeleteCarResult = { ok: true } | { ok: false; error: "not_found" | "has_history" }

/**
 * Permanently delete one of the dealer's cars with its photos, videos, RC lookups and view counts.
 *
 * A car that was ever published has price history, and price_events is append-only by design (a database
 * trigger blocks deleting it): the record of what cars sold for is kept. Cars with enquiries or an RC
 * transfer are kept for the same reason. Those can be archived instead, so this refuses them.
 */
export async function deleteCar(dealerId: string, carId: string): Promise<DeleteCarResult> {
  const db = scopedDb(dealerId)
  const [car] = await db.cars.select(eq(cars.id, carId), { limit: 1 })
  if (!car) return { ok: false, error: "not_found" }

  const [history, enquiries, transfers] = await Promise.all([
    db.priceEvents.count(eq(priceEvents.carId, carId)),
    db.leads.count(eq(leads.carId, carId)),
    db.rcTransfers.count(eq(rcTransfers.carId, carId)),
  ])
  if (history + enquiries + transfers > 0) return { ok: false, error: "has_history" }

  const media = await db.carMedia.select(eq(carMedia.carId, carId))
  // The car row goes first: its media, RC lookups and views go with it (cascade).
  await db.cars.delete(eq(cars.id, carId))

  // Then the files. A failure here only leaves an unreferenced object behind, never a broken car.
  const storage = getStorage()
  await Promise.allSettled(media.map((m) => storage.remove(m.r2Key)))
  return { ok: true }
}
