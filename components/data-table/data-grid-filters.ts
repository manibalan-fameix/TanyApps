// The matching rules behind a list's search box and column filters. Kept free of React so they can be tested on their own.

export type FilterValue = { values?: string[]; min?: string; max?: string; from?: string; to?: string }

const pad = (n: number) => String(n).padStart(2, "0")
/** The local calendar day of a date, as the date inputs write it (yyyy-mm-dd). */
export const dayOf = (value: unknown): string => {
  const d = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function matchesFilter(value: unknown, filter: FilterValue): boolean {
  if (filter.values) return filter.values.length === 0 || filter.values.includes(String(value ?? ""))
  const min = filter.min?.trim() ?? ""
  const max = filter.max?.trim() ?? ""
  if (min !== "" || max !== "") {
    if (value === null || value === undefined || value === "") return false
    const n = Number(value)
    return (min === "" || n >= Number(min)) && (max === "" || n <= Number(max))
  }
  if (filter.from || filter.to) {
    const day = value ? dayOf(value) : ""
    return day !== "" && (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to)
  }
  return true
}

/** True when every word typed appears somewhere in the row's text, in any order. */
export function matchesSearch(parts: unknown[], search: string): boolean {
  const text = parts.filter((p) => typeof p === "string" || typeof p === "number").join(" ").toLowerCase()
  return search.toLowerCase().split(/\s+/).filter(Boolean).every((word) => text.includes(word))
}

/** Empty values come first when ascending; numbers compare as numbers and text naturally ("Item 2" before "Item 10"). */
export function compareValues(a: unknown, b: unknown): number {
  const blankA = a === null || a === undefined || a === ""
  const blankB = b === null || b === undefined || b === ""
  if (blankA || blankB) return Number(blankB) - Number(blankA)
  if (typeof a === "number" && typeof b === "number") return a - b
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b)
  return String(a).localeCompare(String(b), "en-IN", { numeric: true, sensitivity: "base" })
}
