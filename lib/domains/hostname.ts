// Pure rules for a business's own web address. No database or network, so they can be tested directly.

/** A claim that never got verified can be taken by another business after this long, so nobody can sit on a name. */
export const UNVERIFIED_CLAIM_TTL_MS = 72 * 3_600_000

/** Names Tany itself or Cloudflare serves, plus reserved top-level names that can never get a public certificate. */
const BLOCKED_SUFFIXES = ["tany.in", "tanystaging.in", "workers.dev", "pages.dev", "localhost", "local", "internal", "test", "example", "invalid", "nip.io"]

// Second-level labels under a two-letter country code that behave like a top-level name: "shop.co.in" is a bare domain.
const COUNTRY_SECOND_LEVEL = new Set(["co", "com", "net", "org", "firm", "gen", "ind", "ac", "edu", "res", "gov"])

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/** True for "myshop.com" or "myshop.co.in": the name bought from a registrar, with nothing in front of it. */
export function isBareDomain(hostname: string): boolean {
  const l = hostname.split(".")
  return l.length === 2 || (l.length === 3 && l[2].length === 2 && COUNTRY_SECOND_LEVEL.has(l[1]))
}

export type ParsedHostname = { ok: true; hostname: string } | { ok: false; error: string }

/** What the owner typed (maybe a whole link, maybe without www) as the hostname to connect, or why it cannot be used. */
export function parseCustomHostname(input: string, rootDomain?: string): ParsedHostname {
  const raw = input.trim()
  const invalid: ParsedHostname = { ok: false, error: "Enter a web address such as www.yourshop.com." }
  if (!raw || raw.length > 300 || /\s/.test(raw)) return invalid
  let hostname: string
  try {
    // URL turns non-English names into their DNS (punycode) form and lowercases them.
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (url.username || url.password || url.port) return invalid
    hostname = url.hostname.replace(/\.$/, "")
  } catch {
    return invalid
  }
  const labels = hostname.split(".")
  if (hostname.length > 253 || labels.length < 2 || !labels.every((l) => LABEL_RE.test(l))) return invalid
  if (/^\d+$/.test(labels[labels.length - 1])) return invalid // an IP address

  const root = (rootDomain ?? "").toLowerCase().replace(/:\d+$/, "")
  const blocked = root ? [...BLOCKED_SUFFIXES, root] : BLOCKED_SUFFIXES
  if (blocked.some((s) => hostname === s || hostname.endsWith(`.${s}`))) return { ok: false, error: "That address cannot be used. Enter a domain you bought yourself." }

  // Most DNS providers cannot point a bare domain at another service (a CNAME is not allowed there), so connect www in front of it.
  return { ok: true, hostname: isBareDomain(hostname) ? `www.${hostname}` : hostname }
}

/** "www.myshop.co.in" as a provider's form wants it: the name part ("www") and the domain it is under ("myshop.co.in"). */
export function splitHostname(hostname: string): { name: string; domain: string } {
  const labels = hostname.split(".")
  let take = 2
  if (!isBareDomain(hostname) && labels.length > 3 && isBareDomain(labels.slice(-3).join("."))) take = 3
  return { name: labels.slice(0, -take).join("."), domain: labels.slice(-take).join(".") }
}

/**
 * The CNAME value for one claim. Its first part is that claim's secret token, so this one record both points the name here and
 * proves who added it: a CNAME left behind by an earlier owner carries their token, never a newcomer's.
 */
export const cnameValue = (token: string, target: string) => `${token}.${target}`

// A second proof, only for providers that hide the CNAME from lookups (for example a proxy in front of the record).
export const verificationRecordName = (hostname: string) => `_tany-verify.${hostname}`
export const verificationRecordValue = (token: string) => `tany-verify=${token}`

export type DomainStage =
  /** Waiting for the owner to add the DNS records. */
  | "pending_dns"
  /** Ownership proved; Cloudflare is checking the CNAME and issuing the certificate. */
  | "securing"
  /** Working, but the owner has not confirmed it as the main address. */
  | "ready"
  /** Working and the main address. */
  | "live"
  /** Was the main address and stopped working: visitors are on the default address until it recovers. */
  | "interrupted"

export function domainStage(row: { verifiedAt: Date | null; cfHostnameId: string | null; primaryAt: Date | null }): DomainStage {
  if (row.verifiedAt) return row.primaryAt ? "live" : "ready"
  if (row.primaryAt) return "interrupted"
  return row.cfHostnameId ? "securing" : "pending_dns"
}

export type SetupGuide = { host: string; domain: string; name: string; value: string; forward: boolean }

/** The whole job in plain text, for the owner to send to whoever looks after their domain. */
export function setupInstructions(guide: SetupGuide): string {
  return [
    `Please connect ${guide.host} to our Tany shop.`,
    "",
    `In the DNS settings of ${guide.domain}, add this record. If a record named "${guide.name}" already exists, edit it instead.`,
    "Type: CNAME",
    `Name: ${guide.name}`,
    `Value: ${guide.value}`,
    ...(guide.forward ? ["", `Also forward ${guide.domain} to https://${guide.host}`] : []),
    "",
    "Please do not change any other records, such as email records.",
  ].join("\n")
}

export type RemoteHostname = { status: string; sslStatus: string }

/**
 * Whether the domain should be serving, from what Cloudflare reports. Switching on needs the name and its certificate both active.
 * Once on, only the name's own status can switch it off: the certificate status leaves "active" during routine renewals.
 */
export function shouldServe(remote: RemoteHostname | null, serving: boolean): boolean {
  if (!remote) return false
  if (serving) return remote.status === "active" || remote.status === "active_redeploying"
  return remote.status === "active" && remote.sslStatus === "active"
}
