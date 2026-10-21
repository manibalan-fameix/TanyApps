/**
 * Turns a website or social profile link pasted into "Find my Tany" into a few words about the business.
 * Pages are fetched from the server with tight limits; on Workers `global_fetch_strictly_public` also
 * keeps requests off private networks. Page text is untrusted and only ever passed on as data.
 */

const SOCIAL_HOSTS = ["instagram.com", "facebook.com", "fb.com", "fb.me", "linkedin.com", "twitter.com", "x.com", "youtube.com", "justdial.com", "wa.me", "linktr.ee"]
const TLD = /\.(com|in|co|net|org|io|app|store|shop|online|biz|info|me|xyz|co\.in|org\.in|net\.in)(?=[/\s?#:]|$)/i

/** First link in the text: with a scheme, or a bare domain such as `www.shop.in` or `instagram.com/handle`. */
export function extractLink(text: string): string | null {
  const withScheme = text.match(/https?:\/\/[^\s<>"']+/i)
  if (withScheme) return withScheme[0].replace(/[.,;)]+$/, "")
  for (const word of text.split(/\s+/)) {
    const w = word.replace(/^[("']+|[.,;)"']+$/g, "")
    if (!w || w.includes("@")) continue
    if (/^www\./i.test(w) || SOCIAL_HOSTS.some((h) => w.toLowerCase().startsWith(h) || w.toLowerCase().startsWith(`www.${h}`)) || (TLD.test(w) && /^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(w)))
      return w
  }
  return null
}

/** Parses a pasted link; null unless it is a plain http(s) URL to a public-looking host. */
export function parsePublicUrl(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (url.username || url.password) return null
  if (url.port && url.port !== "80" && url.port !== "443") return null
  return isPublicHost(url.hostname) ? url : null
}

export function isPublicHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (!h.includes(".") && !h.includes(":")) return false // localhost, intranet names
  if (/\.(local|localhost|internal|lan|home|corp|test|invalid)$/.test(h)) return false
  if (h.includes(":")) return false // IPv6 literals
  const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])]
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 100 && b >= 64 && b <= 127) return false
  }
  return true
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim()

function meta(html: string, ...names: string[]): string {
  for (const name of names) {
    const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i"))?.[0]
    const content = tag?.match(/content=(?:"([^"]*)"|'([^']*)')/i)
    const value = content?.[1] ?? content?.[2]
    if (value) return decode(value).slice(0, 300)
  }
  return ""
}

/** What a page says about itself. Empty fields when it cannot be read. */
export function summarisePage(html: string): { title: string; description: string; keywords: string } {
  const head = html.slice(0, 150_000)
  const title = meta(head, "og:title", "twitter:title") || decode(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 200)
  return {
    title,
    description: meta(head, "og:description", "description", "twitter:description"),
    keywords: meta(head, "keywords"),
  }
}

async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return ""
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < max) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    size += value.length
  }
  void reader.cancel().catch(() => {})
  const bytes = new Uint8Array(size)
  let at = 0
  for (const c of chunks) {
    bytes.set(c, at)
    at += c.length
  }
  return new TextDecoder().decode(bytes)
}

/** Fetches a public page (up to 3 redirects, each re-checked) and returns its HTML, null when unreadable, or "gone" when the page does not exist. */
async function fetchHtml(start: URL, fetchFn: typeof fetch): Promise<{ html: string | null | "gone"; url: URL }> {
  let url = start
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetchFn(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; TanyBot/1.0)", accept: "text/html,application/xhtml+xml" },
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      const next = loc ? parsePublicUrl(new URL(loc, url).toString()) : null
      if (!next) return { html: null, url }
      url = next
      continue
    }
    if (res.status === 404 || res.status === 410) return { html: "gone", url }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return { html: null, url }
    return { html: await readCapped(res, 200_000), url }
  }
  return { html: null, url }
}

/** A social site's front page (no profile in the path): it says nothing about any business. */
function isSocialHome(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  return SOCIAL_HOSTS.includes(host) && url.pathname.replace(/\//g, "") === ""
}

/** Words from the link itself: the host and path, with separators turned into spaces. */
export function wordsFromUrl(url: URL): string {
  return decodeURIComponent(`${url.hostname.replace(/^www\./, "")} ${url.pathname}`)
    .replace(/[/_.\-+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
}

export type LinkBrief = { brief: string; broken: boolean }

/**
 * Like describeLink, but also says when the link is dead: not a usable address, an unknown host
 * (fetch fails outright) or a missing page. A page that merely blocks bots is not broken.
 */
export async function inspectLink(text: string, fetchFn: typeof fetch = fetch): Promise<LinkBrief | null> {
  const raw = extractLink(text)
  if (!raw) return null
  const url = parsePublicUrl(raw)
  if (!url) return { brief: "", broken: true }
  const lines = [`Link words: ${wordsFromUrl(url)}`]
  let broken = isSocialHome(url)
  try {
    const { html, url: final } = await fetchHtml(url, fetchFn)
    // A typo such as instagram.co redirects to the real site's front page.
    if (isSocialHome(final)) broken = true
    if (html === "gone") broken = true
    else if (html) {
      const { title, description, keywords } = summarisePage(html)
      // Instagram answers 200 for profiles that do not exist, with a bare "Instagram" title and no profile tags.
      if (/(^|\.)instagram\.com$/.test(final.hostname) && final.pathname.replace(/\//g, "") && !description && /^instagram$/i.test(title)) broken = true
      if (title) lines.push(`Page title: ${title}`)
      if (description) lines.push(`Page description: ${description}`)
      if (keywords) lines.push(`Page keywords: ${keywords}`)
    }
  } catch {
    // Unreachable or slow site: the link's own words still count, but it may be a typo.
    broken = true
  }
  return { brief: lines.join("\n"), broken }
}

/**
 * A short plain-text brief about the linked business, or null when the text holds no usable link.
 * Always includes the link's own words, so a login-walled Instagram or Facebook page still helps.
 */
export async function describeLink(text: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  const info = await inspectLink(text, fetchFn)
  return info && info.brief ? info.brief : null
}
