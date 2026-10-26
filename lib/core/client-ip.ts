type HeaderReader = Pick<Headers, "get">

/**
 * The caller's IP for rate limiting. On Cloudflare `cf-connecting-ip` is set by the edge (and overwritten if a client sends it), so it
 * is the only trusted signal. In a production build nothing else is read: `x-real-ip` and `x-forwarded-for` are client-controllable,
 * and a missing edge header answers "unknown" (one shared bucket) rather than trusting them. They are a fallback for local
 * development only, where there is no proxy.
 */
export function clientIp(h: HeaderReader, production = process.env.NODE_ENV === "production"): string {
  const edge = h.get("cf-connecting-ip")?.trim()
  if (edge) return edge
  if (production) return "unknown"
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
}
