// Voice assistant for the Tany project board: serves a small page (microphone + speaker in the browser) and /api/ask.
// The browser does the listening and speaking; this Worker reads the board from GitHub and asks Gemini for the answer.
import { askGemini, loadBoard, overdue, speakable, sprintReport } from "../../scripts/jarvis/lib.mjs"
import { speak as synth } from "./tts.mjs"

const SECURITY = {
  "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...SECURITY, "content-type": "application/json" } })

/** Constant-time comparison, so the passphrase cannot be guessed from response timing. */
function same(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

// Per-isolate guards: a short board cache (spares the GitHub API) and a small rate limit. The passphrase is the real protection.
let cache = { at: 0, items: null }
const hits = new Map()
function limited(ip) {
  const now = Date.now(), recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
  recent.push(now); hits.set(ip, recent)
  if (hits.size > 500) hits.clear()
  return recent.length > 40
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    // The page itself (built from workers/jarvis/ui) is served from the assets binding; only /api/* reaches this code.
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request)
    if (!["/api/ask", "/api/speak"].includes(url.pathname)) return json({ error: "Not found." }, 404)
    if (request.method !== "POST") return json({ error: "Use POST." }, 405)

    if (!env.JARVIS_PASSPHRASE) return json({ error: "JARVIS_PASSPHRASE is not set on the server." }, 500)
    const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
    if (!same(given, env.JARVIS_PASSPHRASE)) return json({ error: "Unauthorised." }, 401)
    if (limited(request.headers.get("cf-connecting-ip") ?? "x")) return json({ error: "Too many questions. Wait a minute." }, 429)

    let body
    try { body = await request.json() } catch { return json({ error: "Send JSON." }, 400) }
    const text = String(body?.text ?? "").trim().slice(0, url.pathname === "/api/speak" ? 900 : 300)
    const lang = body?.lang === "ta" ? "ta" : "en"
    if (!text) return json({ error: "Ask something." }, 400)

    if (url.pathname === "/api/speak") {
      if (!env.GEMINI_API_KEY) return json({ error: "No voice key." }, 503)
      try {
        const audio = await synth(text, { key: env.GEMINI_API_KEY, model: env.JARVIS_TTS_MODEL || undefined, voice: String(body?.voice ?? "") })
        return new Response(audio, { headers: { ...SECURITY, "content-type": "audio/wav" } })
      } catch (e) {
        console.error(String(e).slice(0, 200))
        return json({ error: "Voice unavailable.", detail: String(e?.message ?? e).slice(0, 140) }, 502)
      }
    }

    try {
      if (!cache.items || Date.now() - cache.at > 60_000) cache = { at: Date.now(), items: await loadBoard(env.JARVIS_TOKEN) }
      const items = cache.items
      let answer
      if (env.GEMINI_API_KEY) {
        answer = await askGemini(text, items, new Date(), { key: env.GEMINI_API_KEY, model: env.JARVIS_MODEL || undefined, voice: true, lang })
      } else {
        const od = overdue(items)
        answer = `${sprintReport(items)}\n${od.length ? `Overdue: ${od.map((i) => `#${i.number}`).join(", ")}.` : "Nothing is overdue."}`
      }
      return json({ answer: speakable(answer), speech: speakable(answer) })
    } catch (e) {
      console.error(String(e).slice(0, 300))
      return json({ error: "I could not read the board right now." }, 502)
    }
  },
}
