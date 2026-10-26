type HeaderReader = { get(name: string): string | null }

/** Cloudflare's own request id (16 hex characters, a dash, the data-centre code). Safe to store and to search in the edge logs. */
const CF_RAY = /^[0-9a-f]{16}-[A-Za-z]{3,4}$/
const CALLER_ID = /^[\w.-]{8,64}$/

/**
 * A correlation id for one request: Cloudflare's `cf-ray` when present (it ties our records to the edge logs), else a well-formed
 * caller-supplied `x-request-id`, else a fresh random id. Anything malformed is ignored, so a client cannot put arbitrary text in a log.
 */
export function requestIdFrom(h: HeaderReader): string {
  const ray = h.get("cf-ray")?.trim()
  if (ray && CF_RAY.test(ray)) return ray
  const given = h.get("x-request-id")?.trim()
  if (given && CALLER_ID.test(given)) return given
  return crypto.randomUUID()
}

/** The current request's id when called inside a request (a page, action or route); null in a job, a script or a test. */
export async function currentRequestId(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers")
    return requestIdFrom(await headers())
  } catch {
    return null
  }
}
