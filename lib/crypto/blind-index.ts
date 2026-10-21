import { createHmac } from "node:crypto"

/**
 * A keyed hash that lets us find or match an encrypted value (a phone number, a registration number) without decrypting
 * everything. The same input always gives the same output, so it can be indexed and compared; without BLIND_INDEX_KEY it
 * cannot be reversed or brute-forced from a database dump, which a plain SHA-256 of a 10-digit phone number could be.
 *
 * The `purpose` is mixed in so a phone hash can never be confused with, or looked up as, a vehicle-number hash.
 * Normalise the value first (an E.164 phone, an upper-case registration number with no spaces); different spellings of the
 * same thing would otherwise hash differently.
 */
export type BlindIndexPurpose = "phone" | "email" | "vehicle_reg" | "licence"

function getKey(): Buffer {
  const raw = process.env.BLIND_INDEX_KEY
  if (!raw) throw new Error("BLIND_INDEX_KEY is not set")
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) throw new Error("BLIND_INDEX_KEY must be 32 bytes, base64 encoded")
  return key
}

export function blindIndex(purpose: BlindIndexPurpose, value: string): string {
  return createHmac("sha256", getKey()).update(`${purpose}:${value}`).digest("hex")
}

/** An Indian mobile number as E.164 (+91XXXXXXXXXX), or null when it is not one. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "")
  const m = /^(?:\+91|91|0)?([6-9][0-9]{9})$/.exec(digits)
  return m ? `+91${m[1]}` : null
}

export const phoneHash = (e164: string) => blindIndex("phone", e164)
