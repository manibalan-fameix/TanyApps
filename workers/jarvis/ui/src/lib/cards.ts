// Which task cards to show, from what Jarvis says it wants on screen (the @@SHOW line) and the board data.
import type { BoardData, CardItem } from "./jarvis"

export type View =
  | { kind: "none" }
  | { kind: "focus"; ids: number[] }
  | { kind: "person"; person: string }
  | { kind: "sprint" }
  | { kind: "attention" }

export interface Group { label: string; note?: string; items: CardItem[] }

const PRIORITY: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 }

/** Reads the model's JSON defensively: anything unexpected means "no cards". */
export function parseShow(raw: unknown): View {
  if (!raw || typeof raw !== "object") return { kind: "none" }
  const r = raw as { view?: unknown; ids?: unknown; person?: unknown }
  switch (r.view) {
    case "focus": {
      const ids = Array.isArray(r.ids) ? r.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 6) : []
      return ids.length ? { kind: "focus", ids } : { kind: "none" }
    }
    case "person": return typeof r.person === "string" && r.person.trim() ? { kind: "person", person: r.person.trim() } : { kind: "none" }
    case "sprint": return { kind: "sprint" }
    case "attention": return { kind: "attention" }
    default: return { kind: "none" }
  }
}

/**
 * What the screen should show for a question, judged from the words alone. The model usually picks well but sometimes shows a
 * single task for "how is the sprint going?", so this corrects only that weak case (no view, or one card).
 */
export function intentView(heard: string, team: string[]): View | null {
  const t = heard.toLowerCase()
  if (/\btasks?\s*#?\d+/.test(t)) return null
  const person = team.find((n) => new RegExp(`\\b${n.toLowerCase()}(?:'s)?\\b`).test(t))
  if (person && !/\bsprint\b/.test(t)) return { kind: "person", person }
  if (/\b(overdue|blocked|late|risks?|behind|attention|urgent)\b/.test(t)) return { kind: "attention" }
  if (/\b(sprint|progress|on track|status)\b/.test(t)) return { kind: "sprint" }
  return null
}

/** Task numbers mentioned in a sentence ("task 14", "tasks 2, 7 and 21"). */
export function mentioned(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/\btasks?\s+((?:\d+(?:\s*(?:,|and|&)\s*)?)+)/gi)) for (const n of m[1].matchAll(/\d+/g)) out.push(Number(n[0]))
  return [...new Set(out)]
}

const day = (iso: string) => new Date(`${iso}T00:00:00`)
export function daysUntil(iso: string | null, now = new Date()): number | null {
  if (!iso) return null
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((day(iso).getTime() - t.getTime()) / 86_400_000)
}

const byUrgency = (sprint: string) => (a: CardItem, b: CardItem) =>
  Number(b.sprint === sprint) - Number(a.sprint === sprint) || (PRIORITY[a.priority] ?? 4) - (PRIORITY[b.priority] ?? 4) || a.n - b.n

/** The groups of cards for a view. Empty when there is nothing to show. */
export function groupsFor(view: View, board: BoardData | null): Group[] {
  if (!board || view.kind === "none") return []
  const items = board.items
  const sprint = board.sprint.name
  const open = items.filter((i) => i.open)
  switch (view.kind) {
    case "focus": {
      const found = view.ids.map((id) => items.find((i) => i.n === id)).filter((i): i is CardItem => Boolean(i))
      return found.length ? [{ label: "", items: found }] : []
    }
    case "person": {
      const name = board.team.find((t) => t.toLowerCase() === view.person.toLowerCase()) ?? view.person
      const mine = open.filter((i) => i.team.some((t) => t.toLowerCase() === name.toLowerCase())).sort(byUrgency(sprint))
      return mine.length ? [{ label: `${name}'s open tasks`, note: mine.length > 8 ? `showing 8 of ${mine.length}` : undefined, items: mine.slice(0, 8) }] : []
    }
    case "sprint": {
      const inSprint = open.filter((i) => i.sprint === sprint)
      return board.team
        .map((person) => {
          const mine = inSprint.filter((i) => i.team.includes(person)).sort(byUrgency(sprint))
          return { label: person, note: mine.length > 3 ? `+${mine.length - 3} more` : undefined, items: mine.slice(0, 3) }
        })
        .filter((g) => g.items.length)
    }
    case "attention": {
      const late = open.filter((i) => (daysUntil(i.due) ?? 1) < 0).sort(byUrgency(sprint))
      const blocked = open.filter((i) => i.blocked)
      const soon = open.filter((i) => { const d = daysUntil(i.due); return d !== null && d >= 0 && d <= 3 }).sort(byUrgency(sprint))
      const seen = new Set<number>()
      const fresh = (list: CardItem[]) => list.filter((i) => !seen.has(i.n) && seen.add(i.n)).slice(0, 4)
      return [
        { label: "Overdue", items: fresh(late) },
        { label: "Blocked", items: fresh(blocked) },
        { label: "Due in the next 3 days", items: fresh(soon) },
      ].filter((g) => g.items.length)
    }
  }
}

export interface Alert { n: number; kind: "overdue" | "blocked" | "done"; text: string }

/**
 * Things worth interrupting for, found by comparing the board now with the board a minute ago: a task that has just slipped
 * past its due date, just been blocked, or just been finished. The wording is fixed (no AI), so it is instant and free.
 */
export function detectAlerts(before: CardItem[], after: CardItem[], callMe = "sir", now = new Date()): Alert[] {
  const was = new Map(before.map((i) => [i.n, i]))
  const who = (i: CardItem) => (i.team[0] ? ` Well done, ${i.team[0]}.` : "")
  const out: Alert[] = []
  for (const i of after) {
    const prev = was.get(i.n)
    if (!prev) continue
    if (prev.open && !i.open) out.push({ n: i.n, kind: "done", text: `${callMe}, task ${i.n} has just been completed.${who(i)}` })
    else if (i.open && i.blocked && !prev.blocked) out.push({ n: i.n, kind: "blocked", text: `Pardon the interruption, ${callMe}. Task ${i.n} has just been marked as blocked.` })
    else if (i.open && (daysUntil(i.due, now) ?? 1) < 0 && !((daysUntil(prev.due, now) ?? 1) < 0 && prev.open)) {
      out.push({ n: i.n, kind: "overdue", text: `Pardon the interruption, ${callMe}. Task ${i.n} has slipped past its due date.` })
    }
  }
  const rank = { blocked: 0, overdue: 1, done: 2 }
  return out.sort((a, b) => rank[a.kind] - rank[b.kind])
}

/** One line for the corner of the screen. */
export function statusLine(board: BoardData | null): string {
  if (!board) return ""
  const open = board.items.filter((i) => i.open)
  const blocked = open.filter((i) => i.blocked).length
  const late = open.filter((i) => (daysUntil(i.due) ?? 1) < 0).length
  return [`${board.sprint.name} · ${board.sprint.daysLeft} day${board.sprint.daysLeft === 1 ? "" : "s"} left`, `${open.length} open`, blocked ? `${blocked} blocked` : "", late ? `${late} overdue` : ""].filter(Boolean).join("  ·  ").toUpperCase()
}
