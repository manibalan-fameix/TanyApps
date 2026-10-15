// Creating a task from a spoken request: checking the draft, building the issue text, and mapping it to the GitHub Project.
// Pure functions (no network), so the rules can be tested. The Worker does the calls (workers/jarvis/github.mjs).
import { cardFromBody, cfg } from "./lib.mjs"

export { cardFromBody }

export const PRIORITIES = ["Urgent", "High", "Normal", "Low"]
export const POINTS = [1, 2, 3, 5, 8]
export const PROJECTS = ["TanyCars", "TanyEats", "TanyApps"]
export const SPRINTS = [...Object.keys(cfg.sprints), "Backlog"]
const EPIC = /^E(1[0-2]|[1-9])$/

const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n)

/**
 * Checks a draft the model produced. Nothing from it is trusted: every field is forced into a known value or the draft is
 * refused. `today` is a Date (UTC midnight). Returns { ok: true, draft } or { ok: false, error }.
 */
export function validateDraft(input, today = new Date()) {
  if (!input || typeof input !== "object") return { ok: false, error: "There is no draft to create." }
  const title = clip(input.title, 90)
  if (title.length < 3) return { ok: false, error: "The task needs a title." }
  const summary = clip(input.summary, 220)
  const steps = (Array.isArray(input.steps) ? input.steps : []).map((s) => clip(s, 110)).filter(Boolean).slice(0, 3)
  if (steps.length < 1) return { ok: false, error: "The task needs at least one step." }
  const assignee = input.assignee == null || input.assignee === "" ? null : cfg.team.find((n) => n.toLowerCase() === String(input.assignee).trim().toLowerCase())
  if (input.assignee && !assignee) return { ok: false, error: `${clip(input.assignee, 30)} is not on the team.` }
  const priority = PRIORITIES.includes(input.priority) ? input.priority : "Normal"
  const points = POINTS.includes(Number(input.points)) ? Number(input.points) : 3
  const project = PROJECTS.includes(input.project) ? input.project : "TanyCars"
  const epicId = /^E\d{1,2}\b/.exec(String(input.epic).trim())?.[0]
  const epic = epicId && EPIC.test(epicId) ? epicId : (project === "TanyEats" ? "E10" : "E2")
  const sprint = SPRINTS.includes(input.sprint) ? input.sprint : "Backlog"
  let due = null
  if (input.due) {
    const d = new Date(`${String(input.due).slice(0, 10)}T00:00:00Z`)
    if (!Number.isNaN(d.getTime()) && d.getTime() >= today.getTime() - 86_400_000 && d.getTime() <= today.getTime() + 400 * 86_400_000) due = d.toISOString().slice(0, 10)
  }
  return { ok: true, draft: { title, summary, steps, assignee, priority, points, project, epic, sprint, due } }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** "2026-10-23" as "23 Oct", the form the Due line in every task uses. */
export const dueText = (iso) => (iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}` : null)

/** The machine-readable card, kept in the issue so the card on screen works for tasks that are not in task-cards.json. */
export function cardMarker(draft) {
  return `<!-- jarvis-card ${JSON.stringify({ title: draft.title, summary: draft.summary, steps: draft.steps }).replace(/-->/g, "--\\u003e")} -->`
}

/**
 * The issue text, laid out like the rest of the board (project and owner line, then the details line the Jarvis reader parses,
 * then the description). `details` is the longer write-up from the model, or null to fall back to a plain one.
 */
export function issueBody(draft, { details = null, by = "Bala", when = new Date() } = {}) {
  const epicName = cfg.epics[draft.epic] ?? ""
  const lines = [
    `**Project:** ${draft.project} · **Owner:** Bala`,
    `**Epic:** ${draft.epic} ${epicName} · **Assignee:** ${draft.assignee ?? "Unassigned"} · **Points:** ${draft.points} · **Priority:** ${draft.priority} · **Sprint:** ${draft.sprint}${draft.due ? ` · **Due:** ${dueText(draft.due)}` : ""}`,
    "",
    details?.trim() || [
      "## What to do",
      draft.summary,
      "",
      "## Steps",
      ...draft.steps.map((s, i) => `${i + 1}. ${s}`),
      "",
      "## Done when",
      "The steps above are finished and the owner has checked the result.",
    ].join("\n"),
    "",
    `_Created by Jarvis from a voice request by ${by} on ${when.toISOString().slice(0, 10)}._`,
    cardMarker(draft),
  ]
  return lines.join("\n")
}

/** Labels for the issue: the project, the epic, and a mark that Jarvis made it. */
export const labelsFor = (draft) => [draft.project, draft.epic, "created-by-jarvis"]

/** The text for the Team column of the Project: who is doing it. */
export const teamText = (draft) => draft.assignee ?? ""

/** One line for Jarvis to say when the task exists. */
export function doneLine(callMe, number, draft, assigned) {
  const who = draft.assignee ? (assigned ? ` It is with ${draft.assignee}.` : ` It is on the board for ${draft.assignee}, though GitHub could not assign them yet.`) : " It is on the board, unassigned."
  return `Done, ${callMe}. Task ${number} has been created.${who}`
}
