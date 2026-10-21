/** Root domain without protocol, may include a port in dev (e.g. "localhost:3000"). */
export function getRootDomain(): string | undefined {
  return process.env.ROOT_DOMAIN?.trim() || undefined
}

export function protocolFor(root: string) {
  return root.startsWith("localhost") || root.includes(".localhost") ? "http" : "https"
}

export function tenantUrl(slug: string, path = "/"): string {
  const root = getRootDomain() ?? "localhost:3000"
  return `${protocolFor(root)}://${slug}.${root}${path}`
}

/**
 * Links meant for someone else's phone (rider and guest messages). They use SHARE_ROOT_DOMAIN when set, so an admin
 * running locally can still send the live Cloudflare address (e.g. SHARE_ROOT_DOMAIN=tany.in) instead of localhost.
 */
export function shareUrl(slug: string, path = "/"): string {
  const root = process.env.SHARE_ROOT_DOMAIN?.trim() || getRootDomain() || "localhost:3000"
  return `${protocolFor(root)}://${slug}.${root}${path}`
}

export function adminUrl(path = "/"): string {
  const root = getRootDomain() ?? "localhost:3000"
  return `${protocolFor(root)}://app.${root}${path}`
}

/**
 * The domain shown to owners as the end of their web address ("anna.tany.in"). It is ROOT_DOMAIN, except on a developer's machine
 * (localhost), where the real product domain is shown instead so screenshots and previews read correctly.
 */
export function publicRootDomain(): string {
  const root = getRootDomain()
  return !root || root.startsWith("localhost") || root.includes(".localhost") ? "tany.in" : root
}
