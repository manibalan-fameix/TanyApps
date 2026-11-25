import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"

/**
 * Two formats live side by side:
 *  - v1: one key for everything (the legacy format). Only read, or written by callers that have no business context.
 *  - v2: a key derived per business (HKDF of ENCRYPTION_KEY and the business id), and the business id is also bound in as
 *    authenticated data. A v2 value cannot be read with another business's id, so a row copied or mixed up between businesses,
 *    or a code path that forgets which business it is serving, fails closed instead of returning someone else's data.
 */
const V1 = "v1"
const V2 = "v2"

function getMasterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error("ENCRYPTION_KEY is not set")
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64 encoded")
  return key
}

const derived = new Map<string, Buffer>()
/**
 * The one place a business's key comes from. To move to Cloud KMS later, only this function changes.
 * The derived key is cached per process; the master key is never logged or exposed.
 */
function getDealerKey(dealerId: string): Buffer {
  if (!dealerId) throw new Error("a business id is required to use a per-business key")
  const hit = derived.get(dealerId)
  if (hit) return hit
  const key = Buffer.from(hkdfSync("sha256", getMasterKey(), Buffer.from("tany/dealer-data/v2"), Buffer.from(dealerId), 32))
  derived.set(dealerId, key)
  return key
}

/**
 * AES-256-GCM. Without a business id: v1:<iv>:<tag>:<ciphertext>. With one: v2:<iv>:<tag>:<ciphertext> under that business's key.
 * Everything that holds a business's customers' data should pass the business id.
 */
export function encrypt(plaintext: string, dealerId?: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", dealerId ? getDealerKey(dealerId) : getMasterKey(), iv)
  if (dealerId) cipher.setAAD(Buffer.from(dealerId))
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return [dealerId ? V2 : V1, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":")
}

/** v1 values decrypt with or without a business id; v2 values need the id of the business they belong to. */
export function decrypt(payload: string, dealerId?: string): string {
  const [version, iv, tag, data] = payload.split(":")
  if ((version !== V1 && version !== V2) || !iv || !tag || !data) throw new Error("Unrecognised ciphertext format")
  if (version === V2 && !dealerId) throw new Error("This value is encrypted per business; a business id is required")
  const decipher = createDecipheriv("aes-256-gcm", version === V2 ? getDealerKey(dealerId!) : getMasterKey(), Buffer.from(iv, "base64"))
  if (version === V2) decipher.setAAD(Buffer.from(dealerId!))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
}

/** True when the value is still in the legacy single-key format and should be re-encrypted under its business's key. */
export const needsRekey = (payload: string | null | undefined): payload is string => !!payload && payload.startsWith(`${V1}:`)

export const encryptJson = (value: unknown, dealerId?: string) => encrypt(JSON.stringify(value), dealerId)
export const decryptJson = <T>(payload: string, dealerId?: string): T => JSON.parse(decrypt(payload, dealerId)) as T

/**
 * Decrypt for display. If the key changed or the value is corrupt, return null instead of
 * throwing, so one unreadable row cannot take a whole page down. Never logs the value.
 */
export function tryDecrypt(payload: string | null | undefined, dealerId?: string): string | null {
  if (!payload) return null
  try {
    return decrypt(payload, dealerId)
  } catch {
    console.error("could not decrypt a stored value (wrong ENCRYPTION_KEY, wrong business, or corrupted data)")
    return null
  }
}
