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

const DAY_FROM_SHORT: Record<string, DayKey> = { Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat", Sun: "sun" }

/**
 * Whether the schedule says "open" at this moment, read on the restaurant's own clock (India has no daylight saving).
 * No schedule at all gives null: the owner never set hours, so the page says nothing either way. A close time at or before
 * the open time means the day runs past midnight.
 */
export function isOpenAt(hours: BusinessHours | null | undefined, at: Date = new Date(), timeZone = "Asia/Kolkata"): boolean | null {
  if (!hours || DAY_ORDER.every((d) => !hours[d])) return null
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  const today = DAY_FROM_SHORT[get("weekday")]
  const now = Number(get("hour")) * 60 + Number(get("minute"))
  const mins = (t: string) => {
    const [h, m] = t.split(":").map(Number)
    return h * 60 + m
  }
  const todays = hours[today]
  if (todays) {
    const open = mins(todays.open)
    const close = mins(todays.close)
    if (close > open ? now >= open && now < close : now >= open) return true
  }
  // Yesterday's late close can still be running into this morning.
  const yesterday = DAY_ORDER[(DAY_ORDER.indexOf(today) + 6) % 7]
  const y = hours[yesterday]
  if (y && mins(y.close) <= mins(y.open) && now < mins(y.close)) return true
  return false
}

/**
 * When the restaurant next opens, as a short phrase for a guest: "today 7 am", "tomorrow 7 am" or "Mon 7 am".
 * Null when no schedule is set or nothing opens in the coming week.
 */
export function nextOpeningLabel(hours: BusinessHours | null | undefined, at: Date = new Date(), timeZone = "Asia/Kolkata"): string | null {
  if (!hours || DAY_ORDER.every((d) => !hours[d])) return null
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  const today = DAY_ORDER.indexOf(DAY_FROM_SHORT[get("weekday")])
  const now = Number(get("hour")) * 60 + Number(get("minute"))
  const mins = (t: string) => {
    const [h, m] = t.split(":").map(Number)
    return h * 60 + m
  }
  for (let ahead = 0; ahead <= 7; ahead++) {
    const day = DAY_ORDER[(today + ahead) % 7]
    const slot = hours[day]
    if (!slot) continue
    if (ahead === 0 && mins(slot.open) <= now) continue
    const when = ahead === 0 ? "today" : ahead === 1 ? "tomorrow" : DAY_SHORT[day]
    return `${when} ${clock(slot.open)}`
  }
  return null
}
