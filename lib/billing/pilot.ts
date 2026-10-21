import { SELLABLE_PLAN_KEYS, type SellablePlanKey } from "../plans"

/**
 * A pilot lets a named business use a plan for free until a date, so a first operator can run on Pro at no charge while the product
 * proves itself. Until there is a screen for it, the Tany team sets pilots in the environment:
 *
 *   PILOT_DEALERS="anna-travels:pro:2027-03-31,other-fleet:growth:2027-01-15"
 *
 * Each entry is `slug:plan:last-day` (the plan is in force through the whole of the last day, India time). A malformed entry is
 * ignored rather than guessed at. When a pilot ends, the business falls back to its own trial and subscription.
 */
export type Pilot = { slug: string; plan: SellablePlanKey; until: Date }

const ENTRY = /^([a-z0-9][a-z0-9-]*):([a-z]+):(\d{4}-\d{2}-\d{2})$/

/** The end of a calendar day in India, as an instant. */
const endOfDayIst = (date: string): Date | null => {
  const d = new Date(`${date}T23:59:59.999+05:30`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function parsePilots(raw: string | undefined): { pilots: Pilot[]; ignored: string[] } {
  const pilots: Pilot[] = []
  const ignored: string[] = []
  for (const part of (raw ?? "").split(",")) {
    const text = part.trim().toLowerCase()
    if (!text) continue
    const m = ENTRY.exec(text)
    const plan = m && (SELLABLE_PLAN_KEYS as readonly string[]).includes(m[2]) ? (m[2] as SellablePlanKey) : null
    const until = m ? endOfDayIst(m[3]) : null
    if (!m || !plan || !until || !isRealDate(m[3])) ignored.push(part.trim())
    else pilots.push({ slug: m[1], plan, until })
  }
  return { pilots, ignored }
}

/** A real calendar date: JavaScript quietly turns 2027-02-30 into 2 March. */
function isRealDate(s: string): boolean {
  const t = Date.parse(`${s}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s
}

/** The pilot in force for this business now, if any. */
export function activePilot(slug: string | null | undefined, now: Date = new Date(), env: Record<string, string | undefined> = process.env): Pilot | null {
  if (!slug) return null
  const found = parsePilots(env.PILOT_DEALERS).pilots.find((p) => p.slug === slug.toLowerCase())
  return found && now.getTime() <= found.until.getTime() ? found : null
}
