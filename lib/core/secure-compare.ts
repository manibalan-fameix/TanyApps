/**
 * Compares two secrets without leaking, through timing, how much of one matched the other. Both sides are hashed first so
 * the comparison always walks 32 bytes, whatever the lengths of the inputs.
 */
export async function secretsMatch(a: string | null | undefined, b: string | null | undefined): Promise<boolean> {
  if (!a || !b) return false
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))])
  const x = new Uint8Array(ha)
  const y = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}
