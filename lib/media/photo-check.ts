import { sniffDocType } from "./documents"

/** Why a photo was refused, so a client (and a person reading logs) can tell "we do not take that format" from "that file is damaged". */
export type PhotoRejection = "heic_unsupported" | "type_mismatch" | "unrecognised"

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "heif"])

/** An ISO-BMFF `ftyp` box with a HEIF/HEIC brand: what iPhones and some Androids produce. */
export function isHeif(b: Uint8Array): boolean {
  if (b.length < 12) return false
  const text = (from: number) => String.fromCharCode(b[from], b[from + 1], b[from + 2], b[from + 3])
  return text(4) === "ftyp" && HEIF_BRANDS.has(text(8))
}

/**
 * Compares the file's own first bytes with the declared type. Null means the photo is what it says it is.
 *  - heic_unsupported: a valid HEIF/HEIC file. Not corrupt, just not a format we store (the app converts to JPEG in the browser first).
 *  - type_mismatch:    a JPEG/PNG/WebP, but not the one the request claimed.
 *  - unrecognised:     not a supported image at all (damaged, truncated, or some other file such as HTML).
 */
export function checkPhotoBytes(bytes: Uint8Array, declared: string): PhotoRejection | null {
  const actual = sniffDocType(bytes)
  if (actual === declared) return null
  if (isHeif(bytes)) return "heic_unsupported"
  return actual && actual !== "application/pdf" ? "type_mismatch" : "unrecognised"
}
