/** Header carrying the resolved dealer slug to route handlers. Set only by proxy.ts, never trusted from clients. */
export const TENANT_HEADER = "x-tenant-slug"

/** Subdomains that can never be a dealer slug. */
export const RESERVED_SLUGS = new Set([
  "app", "www", "api", "admin", "auth", "static", "assets", "cdn", "media", "mail", "smtp",
  "support", "help", "status", "blog", "docs", "dashboard", "login", "signup", "billing",
  "root", "test", "staging", "dev", "demo-admin",
])

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug)
}

export type HostTarget =
  | { kind: "marketing" }
  | { kind: "admin" }
  | { kind: "subdomain"; slug: string }
  | { kind: "custom"; hostname: string }
  | { kind: "invalid" }

/** Lowercase, strip port and a trailing dot. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")
}

export const ADMIN_SUBDOMAIN = "app"

/**
 * Decide which surface a request host belongs to.
 * `rootDomain` may include a port (e.g. "localhost:3000"); ports are ignored.
 */
export function classifyHost(hostHeader: string | null | undefined, rootDomain: string): HostTarget {
  const host = normalizeHost(hostHeader)
  const root = normalizeHost(rootDomain)
  if (!host || !root) return { kind: "invalid" }

  if (host === root || host === `www.${root}`) return { kind: "marketing" }

  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1))
    if (sub === ADMIN_SUBDOMAIN) return { kind: "admin" }
    // Only one label deep: "a.b.root" is not a valid tenant.
    if (sub.includes(".") || !isValidSlug(sub)) return { kind: "invalid" }
    return { kind: "subdomain", slug: sub }
  }

  // Anything else is a candidate custom domain; the DB decides.
  return { kind: "custom", hostname: host }
}

/**
 * A loopback or private-network IPv4 address (127.x, 10.x, 192.168.x, 172.16-31.x). Used only by the dev server so a phone on the same
 * Wi-Fi can open http://<mac-ip>:3000; proxy.ts never applies it outside development.
 */
export function isLocalNetworkIp(hostHeader: string | null | undefined): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalizeHost(hostHeader))
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}

/**
 * Dev only: "<slug>.<lan-ip>.nip.io" (e.g. marina-spice.192.168.1.17.nip.io) resolves to that LAN IP through public DNS, so a phone on the
 * same Wi-Fi can open a dealer site that "<slug>.localhost" cannot reach. Returns the slug, or null. proxy.ts applies it in development only.
 */
export function devLanSlug(hostHeader: string | null | undefined): string | null {
  const m = /^([^.]+)\.(\d{1,3}(?:\.\d{1,3}){3})\.nip\.io$/.exec(normalizeHost(hostHeader))
  if (!m || !isLocalNetworkIp(m[2]) || !isValidSlug(m[1])) return null
  return m[1]
}
