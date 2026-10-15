// Writes scripts/jarvis/task-cards.json: a short title, a one-line summary and three plain steps for every task,
// made by Gemini from the long issue descriptions. Run again after tasks change:
//   GEMINI_API_KEY=... node scripts/jarvis/make-cards.mjs          (all tasks)
//   GEMINI_API_KEY=... node scripts/jarvis/make-cards.mjs 14 21    (only these issue numbers)
// Review the file before committing: it is what Jarvis shows on the cards and reads out.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { geminiTarget, cfg } from "./lib.mjs"

const key = process.env.GEMINI_API_KEY
if (!key) throw new Error("Set GEMINI_API_KEY.")
const model = process.env.JARVIS_CARD_MODEL || "gemini-3.6-flash"
const out = new URL("./task-cards.json", import.meta.url)
const repo = `${cfg.owner}/${cfg.repo}`

const only = process.argv.slice(2).map(Number).filter(Boolean)
const issues = JSON.parse(execFileSync("gh", ["issue", "list", "--repo", repo, "--state", "all", "--limit", "300", "--json", "number,title,body,labels"], { encoding: "utf8", maxBuffer: 50_000_000 }))
  .filter((i) => /^\[[A-Z]+\d+\]/.test(i.title))
  .filter((i) => !only.length || only.includes(i.number))
  .sort((a, b) => a.number - b.number)

const cards = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {}

const schema = {
  type: "object",
  properties: {
    title: { type: "string", description: "At most 7 words. Plain English, no jargon, says what the work is." },
    summary: { type: "string", description: "One sentence of at most 20 words: what gets done and why it matters." },
    steps: { type: "array", items: { type: "string" }, description: "Exactly 3 steps, each at most 10 words, in the order the work happens." },
  },
  required: ["title", "summary", "steps"],
}

async function card(issue) {
  const { url, headers } = geminiTarget(key, model)
  const prompt = [
    "Write a card for this task for a small startup team. Some readers are new to the work, so use plain words and explain any jargon.",
    "Describe work that still has to be done: use the imperative or future tense, and never say or imply it is already done or live. Do not repeat the task code. Do not invent facts that are not in the task.",
    `TASK TITLE: ${issue.title.replace(/^\[[A-Z]+\d+\]\s*(\[\d+\]\s*)?/, "")}`,
    `TASK DESCRIPTION:\n${(issue.body ?? "").slice(0, 6000)}`,
  ].join("\n\n")
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(40_000),
    })
    if (!res.ok) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue }
    try {
      const text = (await res.json()).candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
      const c = JSON.parse(text)
      if (c.title && c.summary && Array.isArray(c.steps)) return { title: c.title.trim(), summary: c.summary.trim(), steps: c.steps.slice(0, 3).map((s) => String(s).trim()) }
    } catch { /* try again */ }
  }
  throw new Error(`no card for #${issue.number}`)
}

let next = 0
async function worker() {
  while (next < issues.length) {
    const issue = issues[next++]
    try { cards[issue.number] = await card(issue); console.log(`#${issue.number} ${cards[issue.number].title}`) }
    catch (e) { console.error(String(e.message)) }
  }
}
await Promise.all([worker(), worker(), worker(), worker()])
const sorted = Object.fromEntries(Object.entries(cards).sort((a, b) => Number(a[0]) - Number(b[0])))
writeFileSync(out, JSON.stringify(sorted, null, 2) + "\n")
console.log(`wrote ${Object.keys(sorted).length} cards`)
