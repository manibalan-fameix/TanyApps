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

export type OrderStockItem = { id: string; stockQuantity: number | null; isAvailable: boolean }

/**
 * Why an order cannot be confirmed from inventory, in words for staff. An empty list means every line is covered.
 * Stock is already taken when an order is placed, so a tracked dish is covered by what was set aside for this order
 * (`reserved`, units per dish), not by what is left: taking the last unit leaves 0 in stock and the dish unavailable.
 */
export function orderStockProblems(
  lines: { itemId: string; name: string; qty: number }[],
  items: OrderStockItem[],
  reserved: Map<string, number>,
): string[] {
  if (lines.length === 0) return ["This order has no items."]
  const byId = new Map(items.map((i) => [i.id, i]))
  const problems: string[] = []
  for (const [itemId, qty] of unitsByItem(lines)) {
    const name = lines.find((l) => l.itemId === itemId)!.name
    const item = byId.get(itemId)
    if (!item) problems.push(`${name} is no longer on the menu.`)
    else if (item.stockQuantity === null) {
      if (!item.isAvailable) problems.push(`${name} is marked sold out.`)
    } else if ((reserved.get(itemId) ?? 0) < qty) problems.push(`Stock was not set aside for all ${qty} of ${name}.`)
    else if (item.stockQuantity < 0) problems.push(`${name} is short in stock.`)
    else if (!item.isAvailable && item.stockQuantity > 0) problems.push(`${name} is marked sold out.`)
  }
  return problems
}
