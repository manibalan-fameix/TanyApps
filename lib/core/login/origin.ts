/** A state-changing request must come from the very site it is sent to. `Origin` is set by browsers on every cross-site POST. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin")
  const host = req.headers.get("host")
  if (!origin || !host) return false
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}
