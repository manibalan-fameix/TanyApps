/**
 * The sliding window behind every rate limit. Pure (no clock, no storage), so the Durable Object in workers/tracker and the
 * in-memory development fallback run exactly the same logic, and tests can exercise it without Cloudflare.
 *
 * `hits` are the timestamps of earlier allowed actions. Hits older than the window are dropped; the action is allowed while
 * fewer than `limit` remain. A denied action is not recorded, so being blocked never extends the block.
 */
export function slideWindow(hits: readonly number[], now: number, limit: number, windowMs: number): { allowed: boolean; hits: number[] } {
  const recent = hits.filter((t) => now - t < windowMs)
  if (recent.length >= limit) return { allowed: false, hits: recent }
  return { allowed: true, hits: [...recent, now] }
}
