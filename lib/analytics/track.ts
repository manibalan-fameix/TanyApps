import { type ListingEvent, toDataPoint } from "./events"

type Dataset = { writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void }

/**
 * Records one event in Cloudflare Workers Analytics Engine. Never throws and never waits: counting a visit
 * must not slow down or break the page. Does nothing when the binding is missing, such as local development.
 */
export async function recordEvent(event: ListingEvent): Promise<void> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    const dataset = (getCloudflareContext().env as { ANALYTICS?: Dataset }).ANALYTICS
    dataset?.writeDataPoint(toDataPoint(event))
  } catch {
    // no binding here
  }
}
