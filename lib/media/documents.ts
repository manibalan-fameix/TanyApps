// Uploaded paperwork (RC, insurance, licence): PDFs and photos of them. These are private files, so they are checked harder than
// public photos: the type is read from the file's first bytes, not trusted from the browser, and the size is capped.

export const DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const
export type DocType = (typeof DOC_TYPES)[number]
export const MAX_DOC_BYTES = 8 * 1024 * 1024

export const DOC_EXT: Record<DocType, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }
export const DOC_TYPE_BY_EXT: Record<string, DocType> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png", webp: "image/webp" }

export const isDocType = (v: unknown): v is DocType => typeof v === "string" && (DOC_TYPES as readonly string[]).includes(v)

/** What the bytes say the file is, or null for anything else. */
export function sniffDocType(b: Uint8Array): DocType | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x)
  if (b.length >= 5 && at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf" // %PDF-
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg"
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png"
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp" // RIFF....WEBP
  return null
}

export const PRIVATE_KINDS = ["vehicle-doc", "driver-doc"] as const
export type PrivateKind = (typeof PRIVATE_KINDS)[number]

/** Where a business's private file lives. 128 random bits in the name, under the business's own prefix. */
export const privateKey = (dealerId: string, kind: PrivateKind, id: string, type: DocType) => `dealers/${dealerId}/private/${kind}/${id}.${DOC_EXT[type]}`

const KEY = /^dealers\/([0-9a-f-]{36})\/private\/(vehicle-doc|driver-doc)\/([0-9a-f-]{36})\.(pdf|jpg|png|webp)$/

/** Takes a stored key apart, or null if it is not exactly the shape privateKey() makes. */
export function parsePrivateKey(key: string): { dealerId: string; kind: PrivateKind; type: DocType } | null {
  const m = KEY.exec(key)
  return m ? { dealerId: m[1], kind: m[2] as PrivateKind, type: DOC_TYPE_BY_EXT[m[4]] } : null
}

/** A key a business may save on a record: its own, in the right folder. Empty (no file) is allowed. */
export function isOwnPrivateKey(dealerId: string, kind: PrivateKind, key: string | null | undefined): boolean {
  if (!key) return true
  const p = parsePrivateKey(key)
  return p !== null && p.dealerId === dealerId && p.kind === kind
}
