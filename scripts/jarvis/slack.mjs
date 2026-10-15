// Slack side of Jarvis: post to a channel, DM teammates. Needs a bot token (xoxb-) with chat:write, chat:write.public, im:write, users:read.
import { byPerson, cfg, currentSprint, fmtDate, overdue, dueSoon, today, daysBetween } from "./lib.mjs"

async function call(token, method, body) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!data.ok) throw new Error(`Slack ${method}: ${data.error ?? res.status}`)
  return data
}

/** Slack uses its own markup: *bold*, links as <url|text>. Turns the GitHub-flavoured digest into that. */
export function toSlack(md) {
  return String(md)
    .replace(/^#{1,6}\s+(.*)$/gm, (_, t) => `*${t.replace(/\*\*/g, "")}*`)
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "<$2|$1>")
    .replace(/^- /gm, "• ")
}

export const post = (token, channel, text) => call(token, "chat.postMessage", { channel, text: toSlack(text), unfurl_links: false })

/** Slack member id for each teammate: from config.slack, else matched on the first word of their Slack name. */
export async function memberIds(token, team = cfg.team) {
  const ids = { ...(cfg.slack ?? {}) }
  if (team.every((p) => ids[p])) return ids
  const res = await fetch("https://slack.com/api/users.list?limit=200", { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack users.list: ${data.error}`)
  const people = data.members.filter((m) => !m.deleted && !m.is_bot && m.id !== "USLACKBOT")
  for (const p of team) {
    if (ids[p]) continue
    const first = p.toLowerCase()
    const hit = people.find((m) => [m.profile?.display_name, m.profile?.real_name, m.name].some((n) => String(n ?? "").toLowerCase().split(/[\s._-]+/)[0] === first))
    if (hit) ids[p] = hit.id
  }
  return ids
}

/** One person's morning message: what is overdue, due soon, blocked, and the next few tasks. Null when there is nothing to say. */
export function nudge(items, person, now = new Date()) {
  const mine = byPerson(items, person, now)
  if (!mine.length) return null
  const t = today(now)
  const sprint = currentSprint(now).name
  const line = (i) => `• <${i.url}|#${i.number}> ${i.title}${i.due ? ` (due ${fmtDate(i.due)})` : ""}`
  const od = mine.filter((i) => i.due && i.due < t), soon = mine.filter((i) => i.due && i.due >= t && daysBetween(t, i.due) <= 2), blocked = mine.filter((i) => i.blocked)
  const next = mine.filter((i) => i.sprint === sprint && !od.includes(i) && !soon.includes(i) && !blocked.includes(i)).slice(0, 3)
  const parts = [`Good morning ${person}! You have ${mine.length} open task${mine.length === 1 ? "" : "s"}.`]
  if (od.length) parts.push(`*Overdue*\n${od.map(line).join("\n")}`)
  if (blocked.length) parts.push(`*Blocked*\n${blocked.map(line).join("\n")}`)
  if (soon.length) parts.push(`*Due in the next 2 days*\n${soon.map(line).join("\n")}`)
  if (next.length) parts.push(`*Up next*\n${next.map(line).join("\n")}`)
  return parts.join("\n\n")
}

/** Sends the channel digest and a DM to everyone with something open. Returns a short report. */
export async function sendDaily(token, channel, digestText, items, now = new Date(), { dms = true } = {}) {
  const report = []
  await post(token, channel, digestText)
  report.push(`channel ${channel}`)
  if (!dms) return report
  const ids = await memberIds(token)
  for (const p of cfg.team) {
    const text = nudge(items, p, now)
    if (!text) continue
    if (!ids[p]) { report.push(`${p}: no Slack account found`); continue }
    try { await call(token, "chat.postMessage", { channel: ids[p], text, unfurl_links: false }); report.push(`${p}: sent`) } catch (e) { report.push(`${p}: ${e.message}`) }
  }
  return report
}

export { overdue, dueSoon }

/** A message Jarvis drafted: who it goes to and plain text. Mentions that would ping everyone are refused. */
export function validateMessage(input, team = cfg.team) {
  const to = input?.to === "channel" ? "channel" : team.find((p) => p.toLowerCase() === String(input?.to ?? "").trim().toLowerCase())
  if (!to) return { ok: false, error: "I did not catch who the message is for." }
  const text = String(input?.text ?? "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").replace(/[ \t]+/g, " ").trim()
  if (!text) return { ok: false, error: "The message was empty." }
  if (text.length > 400) return { ok: false, error: "That message is too long for Slack. Please make it shorter." }
  if (/<[!@#]|@(?:channel|here|everyone)\b/i.test(text)) return { ok: false, error: "I do not send messages that notify everyone." }
  return { ok: true, message: { to, text } }
}

/** Sends a confirmed message: to the team channel, or as a DM. Always says it came from Jarvis. */
export async function sendMessage(token, channel, message, by = "Bala", userToken = "") {
  // With a user token (xoxp-) the message is sent as the person themselves, so it arrives as a normal DM; the bot token sends it as Jarvis.
  const sender = userToken || token
  const text = userToken ? message.text : `${message.text}\n_Sent by Jarvis for ${by}_`
  if (message.to === "channel") { await call(sender, "chat.postMessage", { channel, text: toSlack(text), unfurl_links: false }); return { to: "the team channel" } }
  const ids = await memberIds(token)
  if (!ids[message.to]) throw new Error(`${message.to} is not on Slack yet`)
  await call(sender, "chat.postMessage", { channel: ids[message.to], text: toSlack(text), unfurl_links: false })
  return { to: message.to }
}
