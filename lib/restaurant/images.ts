import type { StorageAdapter } from "../storage/types.ts"

export const IMAGE_KINDS = ["menu", "banner", "cab-class"] as const
export type ImageKind = (typeof IMAGE_KINDS)[number]

/** Where a restaurant's uploads live. Always under the restaurant's own prefix, like car photos. */
export const imageKey = (dealerId: string, kind: ImageKind, id: string) => `dealers/${dealerId}/${kind}/${id}.jpg`

/**
 * An image value saved on a dish or banner must be empty or a file this restaurant uploaded.
 * Arbitrary links are refused, so nobody can point a menu at another site or at another restaurant's files.
 */
export function isOwnImage(storage: Pick<StorageAdapter, "publicUrl">, dealerId: string, value: string): boolean {
  if (value === "") return true
  const prefix = storage.publicUrl(`dealers/${dealerId}/`)
  return value.startsWith(prefix) && !value.includes("..") && /\.jpg$/.test(value)
}
