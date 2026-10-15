// Finds the important things in a spoken sentence so they can be shown in a subtle colour: tasks, task names, teammates, dates,
// figures and status words. Works on the same whitespace-separated words the karaoke highlight uses.

export type Kind = "task" | "name" | "person" | "date" | "figure" | "bad" | "warn" | "good"

const WEEKDAYS = new Set(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
const MONTHS = new Set(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"])
const RELATIVE = new Set(["today", "tomorrow", "yesterday", "tonight"])
const NUMBER_WORDS = new Set(["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred"])
const STOP = new Set(["a", "an", "and", "the", "to", "of", "for", "in", "on", "at", "is", "are", "with", "by", "from", "as", "it", "its", "new", "set", "up"])
const BAD = new Set(["overdue", "blocked", "urgent"])
const GOOD = new Set(["completed", "complete", "done", "finished"])

const norm = (w: string) => w.toLowerCase().replace(/'s$/, "").replace(/[^\p{L}\p{N}%]/gu, "")
const isNumber = (n: string) => /^\d+(st|nd|rd|th)?$/.test(n) || NUMBER_WORDS.has(n) || /^\d+%$/.test(n)

/** One entry per word of `sentence` (split on whitespace), or null for ordinary words. */
export function annotate(sentence: string, ctx: { team: string[]; titles: string[] }): (Kind | null)[] {
  const raw = sentence.split(/\s+/).filter(Boolean)
  const n = raw.map(norm)
  const out: (Kind | null)[] = raw.map(() => null)
  const set = (i: number, kind: Kind) => { if (i >= 0 && i < out.length && out[i] === null) out[i] = kind }

  // 1. Task numbers: "task 39", "tasks 2, 7 and 21".
  for (let i = 0; i < n.length; i++) {
    if (n[i] !== "task" && n[i] !== "tasks") continue
    if (i > 0 && isNumber(n[i - 1])) continue // "25 tasks, 78 points": the number counts the tasks, it is not a task number
    let j = i + 1
    let marked = false
    while (j < n.length && (/^\d+$/.test(n[j]) || n[j] === "and" || n[j] === "")) {
      if (/^\d+$/.test(n[j])) { set(j, "task"); marked = true }
      // stop after a number that is not followed by a comma or "and"
      if (/^\d+$/.test(n[j]) && !/,$/.test(raw[j]) && n[j + 1] !== "and") { j++; break }
      j++
    }
    if (marked) set(i, "task")
  }

  // 2. Dates: weekdays, "15 October", "October 15", today, tomorrow.
  for (let i = 0; i < n.length; i++) {
    if (WEEKDAYS.has(n[i]) || RELATIVE.has(n[i])) set(i, "date")
    else if (MONTHS.has(n[i])) {
      set(i, "date")
      if (i > 0 && /^\d{1,2}(st|nd|rd|th)?$/.test(n[i - 1])) set(i - 1, "date")
      else if (/^\d{1,2}(st|nd|rd|th)?$/.test(n[i + 1] ?? "")) set(i + 1, "date")
    }
  }

  // 3. Teammates.
  const people = new Set(ctx.team.map((t) => t.toLowerCase()))
  for (let i = 0; i < n.length; i++) if (people.has(n[i])) set(i, "person")

  // 4. Task names: a run of two or more words that also appears, in the same order, in a task's title.
  const titles = ctx.titles.map((t) => t.split(/\s+/).map(norm).filter(Boolean))
  for (let i = 0; i < n.length; i++) {
    if (out[i] !== null || !n[i]) continue
    let best = 0
    for (const title of titles) {
      for (let k = 0; k < title.length; k++) {
        let len = 0
        while (i + len < n.length && k + len < title.length && n[i + len] === title[k + len] && out[i + len] === null) len++
        if (len > best && len >= 2 && n.slice(i, i + len).some((w) => w.length >= 4 && !STOP.has(w))) best = len
      }
    }
    if (best) { for (let l = 0; l < best; l++) set(i + l, "name"); i += best - 1 }
  }

  // 5. Status words.
  for (let i = 0; i < n.length; i++) {
    if (n[i] === "off" && n[i + 1] === "track") { set(i, "bad"); set(i + 1, "bad") }
    else if (n[i] === "at" && n[i + 1] === "risk") { set(i, "warn"); set(i + 1, "warn") }
    else if (n[i] === "on" && n[i + 1] === "track") { set(i, "good"); set(i + 1, "good") }
    else if (BAD.has(n[i])) set(i, "bad")
    else if (GOOD.has(n[i])) set(i, "good")
  }

  // 6. Figures: any other number, with the unit that follows it ("40 percent", "78 points").
  for (let i = 0; i < n.length; i++) {
    if (out[i] !== null || !isNumber(n[i])) continue
    if (n[i] === "one" && n[i + 1] !== "of" && !/^(task|point|day|overdue|blocked|urgent)/.test(n[i + 1] ?? "")) continue // "one" as a pronoun
    set(i, "figure")
    if (/^(percent|points?|tasks?|days?)$/.test(n[i + 1] ?? "")) set(i + 1, "figure")
  }
  return out
}
