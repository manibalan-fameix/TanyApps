import { getRootDomain } from "../env"

export type MapResult = { ok: true } | { ok: false; skipped?: boolean; reason: string }

const WORKER_NAME = "showmoto"

/**
 * Attaches `<slug>.<ROOT_DOMAIN>` to the Worker as a Workers Custom Domain, so it appears under
 * Workers > Settings > Domains & Routes. Cloudflare creates the DNS record and certificate.
 * The call is an idempotent PUT, so running it again for the same slug is safe.
 *
 * Needs CLOUDFLARE_API_TOKEN (Workers Scripts: Edit, Zone > DNS: Edit), CLOUDFLARE_ACCOUNT_ID and
 * CLOUDFLARE_ZONE_ID. Skipped on localhost or when those are not set.
 */
export async function mapDealerSubdomain(slug: string): Promise<MapResult> {
  const root = getRootDomain()
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim()
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.R2_ACCOUNT_ID)?.trim()
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim()
  if (!root || root.startsWith("localhost") || root.includes(".localhost")) return { ok: false, skipped: true, reason: "local root domain" }
  if (!token || !accountId || !zoneId) return { ok: false, skipped: true, reason: "Cloudflare API is not configured" }

  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/domains`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ hostname: `${slug}.${root}`, service: WORKER_NAME, zone_id: zoneId, environment: "production" }),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) return { ok: true }
    const body = (await res.json().catch(() => null)) as { errors?: { message?: string }[] } | null
    return { ok: false, reason: `Cloudflare ${res.status}: ${body?.errors?.[0]?.message ?? "request failed"}` }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "request failed" }
  }
}
