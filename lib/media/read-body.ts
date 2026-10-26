/**
 * Reads a request body into memory, giving up as soon as it passes `max` bytes. `arrayBuffer()` alone buffers whatever arrives,
 * and a chunked upload carries no Content-Length to refuse early, so the cap has to be applied while reading.
 * Returns null when the body is larger than `max`.
 */
export async function readBodyUpTo(request: Request, max: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.byteLength
  }
  return out
}
