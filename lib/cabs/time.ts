// Times in TanyCabs are decided in Indian Standard Time (UTC+5:30, no daylight saving), whatever time zone the server runs
// in (Cloudflare Workers run in UTC). A trip's "day", "night" and "pickup time" mean what the customer's clock says.

const IST_OFFSET_MS = 330 * 60_000
const DAY_MS = 86_400_000

/** Milliseconds since the start of the IST calendar day that `t` falls on, as a whole number of days since 1970. */
export const istDayNumber = (t: Date): number => Math.floor((t.getTime() + IST_OFFSET_MS) / DAY_MS)

/** Minutes after midnight IST, 0 to 1439. */
export const istMinuteOfDay = (t: Date): number => {
  const ms = (((t.getTime() + IST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS
  return Math.floor(ms / 60_000)
}

/** "2026-10-21" in IST. */
export const istDateString = (t: Date): string => new Date(t.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)

/** Calendar days a trip touches, counting both the first and the last: 10 Oct 22:00 to 11 Oct 06:00 is 2 days. Never below 1. */
export function calendarDays(start: Date, end: Date): number {
  return Math.max(1, istDayNumber(end) - istDayNumber(start) + 1)
}

/** "22:00" to minutes after midnight, or null when it is not a valid 24-hour time. */
export function parseClock(value: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? "")
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Whether a time of day is inside a window that may wrap past midnight (22:00 to 06:00). The start is in, the end is out. */
export function inWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return false
  return start < end ? minute >= start && minute < end : minute >= start || minute < end
}
