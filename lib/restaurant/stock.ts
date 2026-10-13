export const LOW_STOCK_AT = 5

export type StockState = "untracked" | "in_stock" | "low" | "out"

export const STOCK_LABEL: Record<StockState, string> = {
  untracked: "Not tracked",
  in_stock: "In stock",
  low: "Low stock",
  out: "Out of stock",
}

/** What the owner sees for a dish. Untracked dishes are only ever on or off, via their Available switch. */
export function stockState(quantity: number | null, isAvailable: boolean): StockState {
  if (quantity === null) return isAvailable ? "untracked" : "out"
  if (quantity <= 0) return "out"
  return quantity <= LOW_STOCK_AT ? "low" : "in_stock"
}

/** Apply a manual restock (+) or deduction (-). A deduction can never take the count below zero. */
export function adjustQuantity(current: number, delta: number): { ok: true; quantity: number } | { ok: false; error: string } {
  if (!Number.isInteger(delta) || delta === 0) return { ok: false, error: "Enter a whole number other than zero." }
  if (Math.abs(delta) > 100_000) return { ok: false, error: "That is too large." }
  const next = current + delta
  if (next < 0) return { ok: false, error: `Only ${current} in stock, so you cannot remove ${-delta}.` }
  return { ok: true, quantity: next }
}

/** Total units asked for per dish across cart lines (the same dish in two portions counts together). */
export function unitsByItem(lines: { itemId: string; qty: number }[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of lines) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.qty)
  return m
}
