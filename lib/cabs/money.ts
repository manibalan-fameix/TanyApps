/**
 * Money on screens is rupees with up to two decimals ("14.50"); in the database and the fare engine it is whole paise. The
 * conversion is done on the text, never through a float, so 14.1 can never become 1409.9999999999998 paise.
 */
const RUPEES = /^(\d{1,8})(?:\.(\d{1,2}))?$/

/** "14.5" -> 1450. Null for anything that is not a plain non-negative amount (commas and a leading ₹ are tolerated). */
export function rupeesToPaise(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null
  const text = String(input).replace(/[₹,\s]/g, "")
  const m = RUPEES.exec(text)
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"))
}

/** 1450 -> "14.50"; 1400 -> "14". For filling a form field. */
export function paiseToRupeesText(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return ""
  const whole = Math.trunc(paise / 100)
  const frac = Math.abs(paise % 100)
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0")}`
}

/** 1450 -> "₹14.50"; 1400 -> "₹14"; 123456700 -> "₹12,34,567". Indian digit grouping. */
export function formatPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "—"
  const whole = Math.trunc(paise / 100)
  const frac = Math.abs(paise % 100)
  const grouped = whole.toLocaleString("en-IN")
  return frac === 0 ? `₹${grouped}` : `₹${grouped}.${String(frac).padStart(2, "0")}`
}
