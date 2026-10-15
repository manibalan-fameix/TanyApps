// Replies to Slack messages Jarvis sent. Slack calls /api/slack/events when someone writes in a DM; only a reply from the person Jarvis
// messaged, in the conversation Jarvis started, within 3 days, is kept. Everything else is ignored and never stored.
const DAY = 86400
const MAX = 30

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")

/** Slack signs every request: v0=HMAC-SHA256(secret, "v0:<timestamp>:<body>"). Requests older than 5 minutes are refused. */
export async function verifySlack(secret, headers, raw, now = Date.now()) {
  const ts = headers.get("x-slack-request-timestamp") ?? "", sig = headers.get("x-slack-signature") ?? ""
  if (!secret || !ts || Math.abs(now / 1000 - Number(ts)) > 300) return false
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const expected = `v0=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${raw}`)))}`
  if (expected.length !== sig.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  return diff === 0
}

/** Remember a DM Jarvis just sent, so a reply to it can be recognised. */
export async function rememberSent(kv, { channel, userId, to, text, ts }) {
  if (!kv || !channel || !userId) return
  const about = /#(\d{1,4})\b/.exec(text)?.[1] ?? null
  await kv.put(`conv:${channel}`, JSON.stringify({ userId, to, ts, about, text: text.slice(0, 200) }), { expirationTtl: 3 * DAY })
}

/** One Slack event. Returns true when a reply was stored. */
export async function takeEvent(kv, event) {
  if (!kv || event?.type !== "message" || event.channel_type !== "im" || event.subtype || event.bot_id || !event.text) return false
  const conv = JSON.parse((await kv.get(`conv:${event.channel}`)) ?? "null")
  if (!conv || event.user !== conv.userId || Number(event.ts) <= Number(conv.ts)) return false
  const list = JSON.parse((await kv.get("replies")) ?? "[]")
  if (list.some((r) => r.id === event.ts)) return false
  list.push({ id: event.ts, from: conv.to, text: String(event.text).slice(0, 500), about: conv.about, asked: conv.text, at: new Date(Number(event.ts) * 1000).toISOString(), seen: false })
  await kv.put("replies", JSON.stringify(list.slice(-MAX)), { expirationTtl: 7 * DAY })
  return true
}

export async function listReplies(kv) {
  if (!kv) return []
  return JSON.parse((await kv.get("replies")) ?? "[]")
}

export async function markSeen(kv, ids) {
  if (!kv) return
  const list = await listReplies(kv)
  await kv.put("replies", JSON.stringify(list.map((r) => (ids.includes(r.id) ? { ...r, seen: true } : r))), { expirationTtl: 7 * DAY })
}
