/** One CSV cell. A leading = + - @ would run as a formula in Excel or Sheets, so those get a quote in front. */
function cell(v: unknown): string {
  if (v == null) return ""
  let s = typeof v === "object" ? JSON.stringify(v) : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(
  rows: Record<string, unknown>[],
  skip: string[] = ["businessId"]
): string {
  if (rows.length === 0) return "\n"
  const keys = Object.keys(rows[0]!).filter((k) => !skip.includes(k))
  return (
    [
      keys.join(","),
      ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
    ].join("\n") + "\n"
  )
}
