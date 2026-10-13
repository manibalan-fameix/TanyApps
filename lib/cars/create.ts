import { encrypt } from "../crypto/index.ts"
import { cars } from "../db/schema/index.ts"
import { scopedDb } from "../db/scoped.ts"
import { isValidReg, normalizeReg, regPrefix } from "../reg.ts"
import { generateShortCode } from "../short-code.ts"

const isUniqueViolation = (e: unknown) => (e as { cause?: { code?: string } })?.cause?.code === "23505"

export class InvalidRegError extends Error {}

/**
 * A draft car, usually from a registration number (encrypted at rest). Pass no plate for a car
 * started from a video, where the plate may not have been shown. The short code is unique.
 */
export async function createDraftCar(dealerId: string, reg?: string): Promise<string> {
  if (reg !== undefined && !isValidReg(reg)) throw new InvalidRegError("Registration number looks wrong")
  const normalized = reg === undefined ? null : normalizeReg(reg)
  const db = scopedDb(dealerId)

  for (let attempt = 0; attempt < 6; attempt++) {
    const shortCode = generateShortCode(attempt < 3 ? 5 : 6)
    try {
      const [row] = await db.cars
        .insert({
          regNumber: normalized && encrypt(normalized),
          regPrefix: normalized && regPrefix(normalized),
          status: "draft",
          shortCode,
          slug: `draft-${shortCode}`,
        })
        .returning({ id: cars.id })
      return row.id
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
    }
  }
  throw new Error("Could not allocate a short code")
}
