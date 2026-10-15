// Voice assistant for the Tany project board: serves a small page (microphone + speaker in the browser) and /api/ask.
// The browser does the listening and speaking; this Worker reads the board from GitHub and asks Gemini for the answer.
import { createTask, createdToday } from "./github.mjs"
import { validateDraft, doneLine } from "../../scripts/jarvis/tasks.mjs"
import { post as slackPost } from "../../scripts/jarvis/slack.mjs"
import { PERSONAS, cleanCallMe, recoverDraft, writeDetails, withoutActions, cardFromBody, askGemini, cfg, currentSprint, loadBoard, overdue, speakable, sprintReport, streamGemini, streamHear, hearEvents, showEvents, pingGemini, briefingFacts } from "../../scripts/jarvis/lib.mjs"
import cards from "../../scripts/jarvis/task-cards.json" with { type: "json" }
import { speakStream } from "./tts.mjs"

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

// Per-isolate guards: a board cache that answers instantly and refreshes itself in the background, and a small rate limit.
// The passphrase is the real protection.
const FRESH_MS = 60_000
let cache = { at: 0, items: null, loading: null }
function refresh(env) {
  if (!cache.loading) {
    cache.loading = loadBoard(env.JARVIS_TOKEN)
      .then((items) => { cache = { at: Date.now(), items: items.map(withCard), loading: null } })
      .catch((e) => { cache.loading = null; throw e })
  }
  return cache.loading
}
/** Returns the board straight away when one is cached (refreshing in the background when it is older than a minute). */
async function board(env, ctx) {
  if (cache.items) {
    if (Date.now() - cache.at > FRESH_MS) { const p = refresh(env).catch(() => {}); ctx?.waitUntil?.(p) }
    return cache.items
  }
  await refresh(env)
  return cache.items
}
let lastPing = 0
/** Adds the short title, one-line summary and three steps written for each task (scripts/jarvis/make-cards.mjs). */
function withCard(item) {
  const c = cards[item.number] ?? item.bodyCard // tasks made by Jarvis carry their own card
  return c ? { ...item, short: c.title, summary: c.summary, steps: c.steps } : item
}

/** What the page needs to draw a card. */
const forPage = (i) => ({
  n: i.number, title: i.short || i.title, full: i.title, summary: i.summary || "", steps: i.steps || [], open: i.open, blocked: i.blocked,
  project: i.project, team: i.team, sprint: i.sprint, priority: i.priority, points: i.points, epic: i.epic,
  due: i.due ? i.due.toISOString().slice(0, 10) : null, updated: i.updatedAt.toISOString(),
})
/** Personality settings sent by the page, checked so they can only be one of the known values. */
const personaOf = (v) => (PERSONAS.includes(v) ? v : "classic")

/** The draft the page sends back with each request, so the model can change it or confirm it. Anything odd means no draft. */
function readDraft(header) {
  if (!header || header.length > 4000) return null
  try {
    const v = validateDraft(JSON.parse(decodeURIComponent(header)), new Date())
    return v.ok ? v.draft : null
  } catch { return null }
}

/** Drafts from the model are checked and tidied here, so the page only ever sees a draft the server would accept. */
async function* checkedDrafts(events, enabled, recover) {
  let heard = "", said = "", sawDraft = false, sawAction = false
  for await (const e of events) {
    if (e.draft !== undefined) {
      if (!enabled) continue
      sawDraft = true
      const v = validateDraft(e.draft, new Date())
      yield v.ok ? { draft: v.draft } : { draftError: v.error }
    } else if (e.action !== undefined) {
      if (enabled && (e.action?.type === "confirm" || e.action?.type === "cancel")) { sawAction = true; yield { action: { type: e.action.type } } }
    } else {
      if (e.heard) heard = e.heard
      if (e.delta) said += e.delta
      // A model that tucks the draft inside the screen line is not a draft: drop it so recovery below can rebuild a proper one.
      if (e.show && typeof e.show === "object" && "draft" in e.show) { const { draft: _gone, ...rest } = e.show; yield { show: { view: "none" } }; void rest; continue }
      yield e
    }
  }
  // The model asked "Shall I create it?" but forgot the draft line: ask once more so the card still appears.
  if (enabled && recover && !sawDraft && !sawAction && heard && /\b(?:draft|prepared|confirm|finali[sz]e|create|add)\w*\b/i.test(said) && /\btask\b/i.test(said)) {
    const v = validateDraft(await recover(heard, said), new Date())
    if (v.ok) yield { draft: v.draft }
    else console.error("draft recovery failed:", String(v.error).slice(0, 120))
  }
}

const hits = new Map()
function limited(ip) {
  const now = Date.now(), recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
  recent.push(now); hits.set(ip, recent)
  if (hits.size > 500) hits.clear()
  return recent.length > 40
}

/** Server-sent events: one JSON object per event, then {"done": true}. `events` is an async iterable of objects. */
function sse(events) {
  const enc = new TextEncoder()
  const send = (c, o) => c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`))
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of events) send(controller, event)
        send(controller, { done: true })
      } catch (e) {
        console.error(String(e?.message ?? e).slice(0, 200))
        send(controller, { error: "I could not get an answer just now." })
      }
      controller.close()
    },
  })
  return new Response(stream, { headers: { ...SECURITY, "content-type": "text/event-stream; charset=utf-8", "x-accel-buffering": "no" } })
}

async function* deltas(text, items, lang, env, who) {
  for await (const delta of streamGemini(text, items, new Date(), { key: env.GEMINI_API_KEY, model: env.JARVIS_MODEL || undefined, voice: true, lang, ...who })) yield { delta }
}

function streamAnswer(text, items, lang, env, who) {
  return sse(withoutActions(showEvents(deltas(text, items, lang, env, who)))) // a typed or briefing request can never start a task
}

let createdInThisIsolate = 0

/** Makes the task. Only reached from the page, after the user has confirmed the draft. */
async function createRoute(body, env, ctx) {
  if (!env.JARVIS_WRITE_TOKEN) return json({ error: "Task creation is not switched on yet." }, 503)
  const v = validateDraft(body?.draft, new Date())
  if (!v.ok) return json({ error: v.error }, 400)
  try {
    const today = await createdToday(env.JARVIS_WRITE_TOKEN)
    if (Math.max(today, createdInThisIsolate) >= cfg.dailyCreateLimit) return json({ error: `That is ${cfg.dailyCreateLimit} tasks in a day, which is the limit. Please make it on GitHub, or try tomorrow.` }, 429)
    const details = await writeDetails(v.draft, { key: env.GEMINI_API_KEY, model: env.JARVIS_MODEL || undefined })
    const made = await createTask(env.JARVIS_WRITE_TOKEN, v.draft, { details, by: cleanCallMe(body?.by) === "sir" ? "Bala" : cleanCallMe(body?.by) })
    createdInThisIsolate++
    await refresh(env).catch(() => {}) // so the next look at the board already has it
    const card = { n: made.number, title: v.draft.title, full: v.draft.title, summary: v.draft.summary, steps: v.draft.steps, open: true, blocked: false, project: v.draft.project, team: v.draft.assignee ? [v.draft.assignee] : [], sprint: v.draft.sprint, priority: v.draft.priority, points: v.draft.points, epic: v.draft.epic, due: v.draft.due, updated: new Date().toISOString() }
    // A heads-up in Slack (best effort: it never changes the outcome of creating the task).
    if (env.SLACK_BOT_TOKEN && env.SLACK_CHANNEL) {
      const who = v.draft.assignee ?? "nobody yet"
      ctx.waitUntil(slackPost(env.SLACK_BOT_TOKEN, env.SLACK_CHANNEL, `New task by Jarvis: <${made.url}|#${made.number}> ${v.draft.title}\nFor ${who} · ${v.draft.priority} · ${v.draft.points} pts${v.draft.due ? ` · due ${v.draft.due}` : ""}`).catch(() => {}))
    }
    return json({ ok: true, number: made.number, url: made.url, assigned: made.assigned, onBoard: made.onBoard, card, line: doneLine(cleanCallMe(body?.by), made.number, v.draft, made.assigned) })
  } catch (e) {
    console.error(String(e?.message ?? e).slice(0, 240))
    return json({ error: "I could not create the task just now. Nothing was changed if this message appears." }, 502)
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    // The page itself (built from workers/jarvis/ui) is served from the assets binding; only /api/* reaches this code.
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request)
    if (!["/api/ask", "/api/speak", "/api/warm", "/api/hear", "/api/board", "/api/task/create"].includes(url.pathname)) return json({ error: "Not found." }, 404)
    if (request.method !== "POST") return json({ error: "Use POST." }, 405)

    if (!env.JARVIS_PASSPHRASE) return json({ error: "JARVIS_PASSPHRASE is not set on the server." }, 500)
    const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
    if (!same(given, env.JARVIS_PASSPHRASE)) return json({ error: "Unauthorised." }, 401)
    if (limited(request.headers.get("cf-connecting-ip") ?? "x")) return json({ error: "Too many questions. Wait a minute." }, 429)

    // The page calls this as soon as it opens, so the first question does not wait for the GitHub board to load.
    if (url.pathname === "/api/warm") {
      ctx?.waitUntil?.(board(env, ctx).catch(() => {}))
      if (env.GEMINI_API_KEY && Date.now() - lastPing > 4 * 60_000) {
        lastPing = Date.now()
        ctx?.waitUntil?.(pingGemini({ key: env.GEMINI_API_KEY, model: env.JARVIS_MODEL || undefined }))
      }
      return new Response(null, { status: 204, headers: SECURITY })
    }

    // Every task as a card, for the screen. Cached on the server, so this is quick.
    if (url.pathname === "/api/board") {
      try { const sp = currentSprint(); const items = await board(env, ctx); return json({ items: items.map(forPage), sprint: { name: sp.name, end: sp.end.toISOString().slice(0, 10), daysLeft: sp.daysLeft }, team: cfg.team, facts: briefingFacts(items), canCreate: Boolean(env.JARVIS_WRITE_TOKEN) }) } catch (e) { console.error(String(e?.message ?? e).slice(0, 200)); return json({ error: "I could not read the board right now." }, 502) }
    }

    // The microphone recording (a 16 kHz WAV) goes straight to Gemini, which hears the question and writes the answer.
    if (url.pathname === "/api/hear") {
      if (!env.GEMINI_API_KEY) return json({ error: "No Gemini key." }, 503)
      const audio = new Uint8Array(await request.arrayBuffer())
      if (!audio.length || audio.length > 3_000_000) return json({ error: "Send one short recording." }, 400)
      let history = []
      try { history = JSON.parse(decodeURIComponent(request.headers.get("x-history") ?? "[]")) } catch { /* no history */ }
      if (!Array.isArray(history)) history = []
      let bin = ""
      for (let i = 0; i < audio.length; i += 0x8000) bin += String.fromCharCode(...audio.subarray(i, i + 0x8000))
      try {
        const items = await board(env, ctx)
        const events = hearEvents(streamHear({ mime: "audio/wav", data: btoa(bin) }, items, new Date(), { key: env.GEMINI_API_KEY, model: env.JARVIS_MODEL || undefined, lang: request.headers.get("x-lang") === "ta" ? "ta" : "en", history, canCreate: Boolean(env.JARVIS_WRITE_TOKEN) && request.headers.get("x-create") === "1", createRequested: request.headers.get("x-create") === "1", draft: readDraft(request.headers.get("x-draft")), wake: request.headers.get("x-wake") === "1", awake: request.headers.get("x-awake") !== "0", persona: personaOf(request.headers.get("x-persona")), callMe: cleanCallMe(decodeURIComponent(request.headers.get("x-callme") ?? "")) }))
        return sse(checkedDrafts(showEvents(events), Boolean(env.JARVIS_WRITE_TOKEN) && request.headers.get("x-create") === "1", (heard, said) => recoverDraft(heard, said, new Date(), { key: env.GEMINI_API_KEY, model: env.JARVIS_MODEL || undefined })))
      } catch (e) {
        console.error(String(e?.message ?? e).slice(0, 200))
        return json({ error: "I could not read the board right now." }, 502)
      }
    }

    let body
    try { body = await request.json() } catch { return json({ error: "Send JSON." }, 400) }
    if (url.pathname === "/api/task/create") return createRoute(body, env, ctx)

    const text = String(body?.text ?? "").trim().slice(0, url.pathname === "/api/speak" ? 900 : 300)
    const lang = body?.lang === "ta" ? "ta" : "en"
    if (!text) return json({ error: "Ask something." }, 400)

    if (url.pathname === "/api/speak") {
      if (!env.GEMINI_API_KEY) return json({ error: "No voice key." }, 503)
      try {
        const pcm = await speakStream(text, { key: env.GEMINI_API_KEY, model: env.JARVIS_TTS_MODEL || undefined, voice: String(body?.voice ?? ""), persona: personaOf(body?.persona), mood: body?.mood === "welcome" ? "welcome" : "", spoken: env.JARVIS_TANY_SPOKEN || undefined, lang })
        return new Response(pcm, { headers: { ...SECURITY, "content-type": "application/octet-stream", "x-pcm-rate": "24000" } })
      } catch (e) {
        console.error(String(e).slice(0, 200))
        return json({ error: "Voice unavailable.", detail: String(e?.message ?? e).slice(0, 140) }, 502)
      }
    }

    try {
      const items = await board(env, ctx)
      if (body?.stream && env.GEMINI_API_KEY) return streamAnswer(text, items, lang, env, { persona: personaOf(body?.persona), callMe: cleanCallMe(body?.callMe) })
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
