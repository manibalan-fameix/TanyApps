// Creates a task on GitHub: the issue, its labels and assignee, and its place and fields on the Project board.
// Uses the write token (JARVIS_WRITE_TOKEN). Nothing here decides what is allowed: the caller has already checked the draft.
import { cfg } from "../../scripts/jarvis/lib.mjs"
import { issueBody, labelsFor, teamText } from "../../scripts/jarvis/tasks.mjs"

const API = "https://api.github.com"
const repo = `${cfg.owner}/${cfg.repo}`

async function rest(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "tany-jarvis", "x-github-api-version": "2022-11-28" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const json = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, json }
}

async function gql(token, query, variables = {}) {
  const res = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "tany-jarvis" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || json?.errors) throw new Error(`GitHub API error: ${JSON.stringify(json?.errors ?? res.status).slice(0, 240)}`)
  return json.data
}

let projectCache = null

/** The board's id and its fields (with the ids of each choice), looked up once per isolate. */
export async function projectInfo(token) {
  if (projectCache) return projectCache
  const data = await gql(token, `query($login:String!,$n:Int!){ user(login:$login){ projectV2(number:$n){ id fields(first:40){ nodes{
    ... on ProjectV2Field{ id name }
    ... on ProjectV2SingleSelectField{ id name options{ id name } } } } } } }`, { login: cfg.owner, n: cfg.projectNumber })
  const p = data.user.projectV2
  const fields = {}
  for (const f of p.fields.nodes) if (f?.name) fields[f.name] = { id: f.id, options: Object.fromEntries((f.options ?? []).map((o) => [o.name, o.id])) }
  projectCache = { id: p.id, fields }
  return projectCache
}

/** The id of the option whose name is `name`, or starts with `name ` (the epic options read "E3 Public site"). */
const optionId = (field, name) => field.options[name] ?? Object.entries(field.options).find(([n]) => n.startsWith(`${name} `))?.[1]

/** How many tasks Jarvis has made in the last 24 hours (for the daily limit). */
export async function createdToday(token, now = new Date()) {
  const since = new Date(now.getTime() - 86_400_000).toISOString()
  const r = await rest(token, "GET", `/repos/${repo}/issues?labels=created-by-jarvis&state=all&since=${encodeURIComponent(since)}&per_page=100`)
  return r.ok && Array.isArray(r.json) ? r.json.length : 0
}

/**
 * Makes the issue and puts it on the board. `draft` is already validated. Returns { number, url, assigned, onBoard }.
 * An assignee GitHub refuses (for example someone who has not accepted the invite) does not stop the task: it is created
 * unassigned and the Team column still names them.
 */
export async function createTask(token, draft, { details = null, by = "Bala", now = new Date() } = {}) {
  await rest(token, "POST", `/repos/${repo}/labels`, { name: "created-by-jarvis", color: "5319e7", description: "Created by Jarvis from a voice request" }) // exists after the first time: ignored
  const login = draft.assignee ? cfg.github?.[draft.assignee] : null
  const base = { title: draft.title, body: issueBody(draft, { details, by, when: now }), labels: labelsFor(draft) }
  let assigned = false
  let issue = login ? await rest(token, "POST", `/repos/${repo}/issues`, { ...base, assignees: [login] }) : null
  if (issue?.ok) assigned = true
  else issue = await rest(token, "POST", `/repos/${repo}/issues`, base)
  if (!issue.ok) throw new Error(`GitHub could not create the task (${issue.status}).`)
  const out = { number: issue.json.number, url: issue.json.html_url, assigned, onBoard: false }

  try {
    const info = await projectInfo(token)
    const add = await gql(token, "mutation($p:ID!,$c:ID!){ addProjectV2ItemById(input:{projectId:$p,contentId:$c}){ item{ id } } }", { p: info.id, c: issue.json.node_id })
    const item = add.addProjectV2ItemById.item.id
    const set = []
    const defs = ["$p:ID!", "$i:ID!"]
    const vars = { p: info.id, i: item }
    const put = (name, kind, value) => {
      const f = info.fields[name]
      if (!f || value === null || value === undefined || value === "") return
      const n = set.length
      let input, type
      if (kind === "select") {
        const o = optionId(f, value)
        if (!o) return
        input = "singleSelectOptionId"; type = "String!"; vars[`v${n}`] = o
      } else {
        input = kind === "number" ? "number" : "text"; type = kind === "number" ? "Float!" : "String!"; vars[`v${n}`] = value
      }
      vars[`f${n}`] = f.id
      defs.push(`$f${n}:ID!`, `$v${n}:${type}`)
      set.push(`a${n}: updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f${n},value:{${input}:$v${n}}}){ clientMutationId }`)
    }
    put("Points", "number", draft.points)
    put("Priority", "select", draft.priority)
    put("Epic", "select", draft.epic)
    put("Sprint", "select", draft.sprint)
    put("Owner", "select", "Bala")
    put("Team", "text", teamText(draft))
    put("Summary", "text", draft.summary)
    if (set.length) await gql(token, `mutation(${defs.join(",")}){ ${set.join(" ")} }`, vars)
    out.onBoard = true
  } catch (e) {
    console.error(String(e?.message ?? e).slice(0, 200))
  }
  return out
}
