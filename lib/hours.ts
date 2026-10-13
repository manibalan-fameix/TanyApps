export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"

/** Per-day open/close in 24h "HH:mm"; a missing day means closed. */
export type BusinessHours = Partial<Record<DayKey, { open: string; close: string }>>

const DAY_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
const DAY_SHORT: Record<DayKey, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" }

function clock(t: string): string {
  const [h, m] = t.split(":").map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`
}

/**
 * One line a guest can read: "Mon to Sat, 10 am to 7 pm". Days with different times are listed separately,
 * and an empty schedule gives null so the page can leave the line out.
 */
export function summariseHours(hours: BusinessHours | null | undefined): string | null {
  const open = DAY_ORDER.filter((d) => hours?.[d])
  if (open.length === 0) return null
  const groups: { days: DayKey[]; text: string }[] = []
  for (const d of open) {
    const text = `${clock(hours![d]!.open)} to ${clock(hours![d]!.close)}`
    const last = groups[groups.length - 1]
    if (last && last.text === text && DAY_ORDER.indexOf(last.days[last.days.length - 1]) === DAY_ORDER.indexOf(d) - 1) last.days.push(d)
    else groups.push({ days: [d], text })
  }
  return groups
    .map((g) => {
      const days = g.days.length === 1 ? DAY_SHORT[g.days[0]] : g.days.length === 7 ? "Every day" : `${DAY_SHORT[g.days[0]]} to ${DAY_SHORT[g.days[g.days.length - 1]]}`
      return `${days}, ${g.text}`
    })
    .join(" · ")
}
