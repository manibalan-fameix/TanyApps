type Dataset = { writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void }

/**
 * Counts an operational event ("this fallback ran", "the rate limiter was unreachable"). Writes one structured log line
 * (Workers observability is on, so it is searchable) and, when the METRICS Analytics Engine binding exists, one data
 * point. Never throws and never waits: a counter must not break the request it describes.
 */
export function countMetric(name: string, tags: Record<string, string> = {}): void {
  try {
    console.warn(JSON.stringify({ metric: name, count: 1, ...tags }))
  } catch {
    // unserialisable tag: still try the dataset below
  }
  void writeDataPoint(name, tags)
}

async function writeDataPoint(name: string, tags: Record<string, string>): Promise<void> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    const dataset = (getCloudflareContext().env as { METRICS?: Dataset }).METRICS
    dataset?.writeDataPoint({ indexes: [name], blobs: Object.entries(tags).map(([k, v]) => `${k}=${v}`), doubles: [1] })
  } catch {
    // no binding here (local development, tests)
  }
}
