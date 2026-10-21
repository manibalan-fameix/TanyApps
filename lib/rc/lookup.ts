import { and, desc, eq, gt } from "drizzle-orm"

import { decrypt, decryptJson, encryptJson } from "../crypto"
import { cars, rcLookups } from "../db/schema"
import { scopedDb } from "../db/scoped"
import { rateLimit } from "../core/rate-limit"
import { isValidReg } from "../reg"
import { getRcProvider, providerByName, type RcProvider } from "./provider"
import { RcError, type RcRecord } from "./types"

const CACHE_DAYS = 30
const PER_DEALER_PER_HOUR = 40
const PER_IP_PER_HOUR = 25
const HOUR_MS = 3_600_000

export type RcLookupResult = { record: RcRecord; cached: boolean }

/**
 * RC lookup for one of the dealer's cars: 30-day cache, then rate limits, then the provider.
 * The raw response is stored encrypted; the car row is updated from the normalised record.
 */
export async function lookupRcForCar(
  dealerId: string,
  carId: string,
  opts: { ip?: string; provider?: RcProvider } = {},
): Promise<RcLookupResult> {
  const provider = opts.provider ?? getRcProvider()
  const db = scopedDb(dealerId)

  const [car] = await db.cars.select(eq(cars.id, carId), { limit: 1 })
  if (!car?.regNumber) throw new RcError("invalid_reg", "Car has no registration number")
  const reg = decrypt(car.regNumber)
  if (!isValidReg(reg)) throw new RcError("invalid_reg", "Registration number looks wrong")

  // 1. Cache: never re-call the provider for this car within 30 days.
  const since = new Date(Date.now() - CACHE_DAYS * 24 * 3_600_000)
  const [cached] = await db.rcLookups.select(
    and(eq(rcLookups.carId, carId), eq(rcLookups.provider, provider.name), gt(rcLookups.fetchedAt, since)),
    { orderBy: [desc(rcLookups.fetchedAt)], limit: 1 },
  )
  if (cached) {
    const record = provider.normalize(decryptJson(cached.rawResponse), reg)
    await applyToCar(dealerId, carId, record, provider, cached.fetchedAt)
    return { record, cached: true }
  }

  // 2. Rate limits (only for calls that would reach the provider).
  const recent = await db.rcLookups.count(gt(rcLookups.fetchedAt, new Date(Date.now() - HOUR_MS)))
  if (recent >= PER_DEALER_PER_HOUR) throw new RcError("rate_limited", "Too many RC lookups this hour")
  if (opts.ip && !(await rateLimit(`rc:ip:${opts.ip}`, PER_IP_PER_HOUR, HOUR_MS))) {
    throw new RcError("rate_limited", "Too many RC lookups from this network")
  }

  // 3. Provider call. Errors propagate as RcError; nothing is cached on failure.
  const raw = await provider.fetch(reg)
  const record = provider.normalize(raw, reg)
  await db.rcLookups.insert({ carId, provider: provider.name, rawResponse: encryptJson(raw) })
  await applyToCar(dealerId, carId, record, provider, new Date())
  return { record, cached: false }
}

async function applyToCar(dealerId: string, carId: string, r: RcRecord, provider: RcProvider, at: Date) {
  await scopedDb(dealerId).cars.update(
    {
      year: r.manufacturingYear ?? undefined,
      fuel: r.fuel ?? undefined,
      ownerCount: r.ownerCount ?? undefined,
      colour: r.colour ?? undefined,
      insuranceValidTill: r.insuranceValidTill ?? undefined,
      hypothecationCleared: r.hypothecated === null ? undefined : !r.hypothecated,
      // The "Verified from RTO records" badge is only earned by a real provider, never the mock.
      rcVerifiedAt: provider.verified ? at : undefined,
    },
    eq(cars.id, carId),
  )
}

/** The normalised RC record from this car's latest cached lookup, if any. No provider call. */
export async function getCachedRcRecord(dealerId: string, carId: string): Promise<RcRecord | null> {
  const db = scopedDb(dealerId)
  const [car] = await db.cars.select(eq(cars.id, carId), { limit: 1 })
  const [row] = await db.rcLookups.select(eq(rcLookups.carId, carId), { orderBy: [desc(rcLookups.fetchedAt)], limit: 1 })
  if (!car?.regNumber || !row) return null
  const provider = providerByName(row.provider)
  return provider ? provider.normalize(decryptJson(row.rawResponse), decrypt(car.regNumber)) : null
}
