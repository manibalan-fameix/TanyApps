import { createLocalStorage } from "./local.ts"
import { createR2Storage } from "./r2.ts"
import type { StorageAdapter } from "./types.ts"

export type { StorageAdapter } from "./types.ts"

let instance: StorageAdapter | null = null

/**
 * R2 when all R2_* keys are set. In development only, falls back to local disk so the add-car
 * flow works before keys exist. In production missing keys are an error, never a silent fallback.
 */
export function getStorage(env: Record<string, string | undefined> = process.env): StorageAdapter {
  if (instance && env === process.env) return instance
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = env
  let adapter: StorageAdapter
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_URL) {
    adapter = createR2Storage({
      accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY,
      bucket: R2_BUCKET, publicUrl: R2_PUBLIC_URL,
    })
  } else if (env.NODE_ENV === "development") {
    adapter = createLocalStorage()
  } else {
    throw new Error("Storage is not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL")
  }
  if (env === process.env) instance = adapter
  return adapter
}

let privateInstance: StorageAdapter | null = null

/**
 * Private storage for personal paperwork (licences, RCs, insurance). Nothing here is ever served from a public address: files
 * are read back through an authenticated route. In production it needs its own bucket, R2_PRIVATE_BUCKET, which must NOT be
 * exposed through a public domain; there is no fallback to the public media bucket, because that would publish licences.
 * Development without R2 keys uses local disk.
 */
export function getPrivateStorage(env: Record<string, string | undefined> = process.env): StorageAdapter {
  if (privateInstance && env === process.env) return privateInstance
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PRIVATE_BUCKET } = env
  let adapter: StorageAdapter
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PRIVATE_BUCKET) {
    // `publicUrl` is required by the adapter but never used for private files.
    adapter = createR2Storage({ accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_PRIVATE_BUCKET, publicUrl: "https://private.invalid" })
  } else if (env.NODE_ENV === "development") {
    adapter = createLocalStorage()
  } else {
    throw new Error("Private document storage is not configured: set R2_PRIVATE_BUCKET (a bucket with no public domain)")
  }
  if (env === process.env) privateInstance = adapter
  return adapter
}

/** True when document uploads can work here, so screens can say so instead of failing at upload time. */
export function privateStorageAvailable(env: Record<string, string | undefined> = process.env): boolean {
  try {
    getPrivateStorage(env)
    return true
  } catch {
    return false
  }
}
