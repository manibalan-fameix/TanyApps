import { getRootDomain } from "@/lib/env"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { classifyHost, devLanSlug } from "@/lib/tenant/host"
import { resolveCustomDomain } from "@/lib/tenant/lookup"
import type { IndustryKey } from "@/lib/verticals"

/** Businesses whose customers sign in with a phone OTP: cab operators, and the shops that offer monthly groceries. */
export const LOGIN_INDUSTRIES = ["cabs", "restaurants", "retail"] as const satisfies readonly IndustryKey[]

export type LoginHost = { host: string; slug: string; dealerId: string }

/**
 * Is `hostHeader` a site the central login may send people back to? Only a live subdomain or a VERIFIED custom domain of a
 * business that runs `industry`. Anything else (an attacker's domain, the admin host, a suspended business) is refused, so
 * the login page can never be used as an open redirect.
 */
export async function resolveLoginHost(hostHeader: string | null | undefined, industry: IndustryKey | readonly IndustryKey[]): Promise<LoginHost | null> {
  const root = getRootDomain()
  const host = (hostHeader ?? "").trim().toLowerCase()
  if (!root || !host || host.length > 253) return null
  const target = classifyHost(host, root)
  let slug: string | null = null
  if (target.kind === "subdomain") slug = target.slug
  else if (target.kind === "custom") {
    // Development only: "<slug>.<lan-ip>.nip.io" is how a phone on the same Wi-Fi opens a business's site (proxy.ts does the same).
    slug = (process.env.NODE_ENV === "development" ? devLanSlug(host) : null) ?? (await resolveCustomDomain(target.hostname))
  }
  if (!slug) return null
  const dealer = await getDealerBySlug(slug)
  if (!dealer || dealer.suspended || !(typeof industry === "string" ? dealer.industry === industry : industry.includes(dealer.industry))) return null
  // Keep the port: a ticket is addressed to exactly the host the browser will come back to.
  return { host, slug, dealerId: dealer.id }
}
