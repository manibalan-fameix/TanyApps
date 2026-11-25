import { getStorage } from "../storage"

const MAX_LOGO_BYTES = 300_000
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

/** Stores a client-resized PNG logo and returns its public URL. Anything that is not a small, real PNG is rejected. */
export async function storeLogo(dataUrl: string, slug: string): Promise<string | null> {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) return null
  const bytes = Buffer.from(match[1], "base64")
  if (bytes.length > MAX_LOGO_BYTES || !PNG_MAGIC.every((b, i) => bytes[i] === b)) return null
  const key = `logos/${slug}-${crypto.randomUUID()}.png`
  const storage = getStorage()
  await storage.put(key, bytes, "image/png")
  return storage.publicUrl(key)
}
