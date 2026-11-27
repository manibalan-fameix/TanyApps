import type { RemoteHostname } from "../domains/hostname"

/**
 * Cloudflare for SaaS: certificates and routing for domains that businesses own themselves. (lib/cloudflare/domains.ts is the
 * other thing: our own <slug>.ROOT_DOMAIN addresses.) Setup steps are in docs/custom-domains.md.
 *
 * Needs CUSTOM_DOMAIN_TARGET (the name owners point their CNAME at), CLOUDFLARE_ZONE_ID and CUSTOM_DOMAIN_API_TOKEN
 * (Zone > SSL and Certificates: Edit, this zone only). With any of them missing the feature is switched off.
 * The token has its own name so it can stay this narrow: CLOUDFLARE_API_TOKEN is used for other things.
 */
function config() {
  const target = process.env.CUSTOM_DOMAIN_TARGET?.trim().toLowerCase()
  const token = process.env.CUSTOM_DOMAIN_API_TOKEN?.trim()
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim()
  return target && token && zoneId ? { target, token, zoneId } : null
}

export const customDomainsConfigured = () => config() !== null
export const cnameTarget = () => config()?.target ?? ""

export class CustomHostnameError extends Error {}

type ApiHostname = { id: string; hostname: string; status: string; ssl?: { status?: string } }
type ApiBody<T> = { success?: boolean; result?: T; errors?: { code?: number; message?: string }[] }

async function api<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<{ status: number; body: ApiBody<T> | null }> {
  const cfg = config()
  if (!cfg) throw new CustomHostnameError("custom domains are not configured")
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfg.zoneId}/custom_hostnames${path}`, {
    method,
    headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  })
  return { status: res.status, body: (await res.json().catch(() => null)) as ApiBody<T> | null }
}

const failure = (status: number, body: ApiBody<unknown> | null) => new CustomHostnameError(`Cloudflare ${status}: ${body?.errors?.[0]?.message ?? "request failed"}`)
const toRemote = (h: ApiHostname): RemoteHostname => ({ status: h.status, sslStatus: h.ssl?.status ?? "" })

/** Registers the hostname and returns its id. Safe to repeat: a name already registered in our zone returns the existing id. */
export async function createCustomHostname(hostname: string): Promise<string> {
  // HTTP validation: the certificate is issued by itself once the owner's CNAME points here.
  const made = await api<ApiHostname>("POST", "", { hostname, ssl: { method: "http", type: "dv" } })
  if (made.body?.success && made.body.result) return made.body.result.id
  const found = await api<ApiHostname[]>("GET", `?hostname=${encodeURIComponent(hostname)}`)
  const existing = found.body?.result?.find((h) => h.hostname === hostname)
  if (existing) return existing.id
  throw failure(made.status, made.body)
}

/** Null when Cloudflare no longer has it. Throws on any other failure, so an outage is never read as "gone". */
export async function getCustomHostname(id: string): Promise<RemoteHostname | null> {
  const res = await api<ApiHostname>("GET", `/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  if (!res.body?.success || !res.body.result) throw failure(res.status, res.body)
  return toRemote(res.body.result)
}

export async function deleteCustomHostname(id: string): Promise<void> {
  const res = await api<unknown>("DELETE", `/${encodeURIComponent(id)}`)
  if (res.status !== 404 && !(res.status >= 200 && res.status < 300)) throw failure(res.status, res.body)
}

/** Public DNS answers over HTTPS, which works the same in Workers and Node. An empty list means no such record (yet). */
export async function lookupDns(name: string, type: "TXT" | "CNAME"): Promise<string[]> {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new CustomHostnameError(`DNS lookup failed: ${res.status}`)
  const body = (await res.json()) as { Answer?: { type: number; data: string }[] }
  const wanted = type === "TXT" ? 16 : 5
  return (body.Answer ?? [])
    .filter((a) => a.type === wanted)
    // A long TXT value arrives as several quoted pieces.
    .map((a) => (type === "TXT" ? a.data.replace(/"\s+"/g, "").replace(/^"|"$/g, "") : a.data.replace(/\.$/, "").toLowerCase()))
}
