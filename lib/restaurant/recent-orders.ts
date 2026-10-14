const KEY = "tany-orders"
const MAX = 10

/** Order codes this browser placed, newest first. Kept on the device so a guest can come back to their order. */
export function readRecentOrders(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]")
    return Array.isArray(raw) ? raw.filter((c): c is string => typeof c === "string" && /^[A-Z0-9]{6}$/.test(c)).slice(0, MAX) : []
  } catch {
    return []
  }
}

export function rememberOrder(code: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([code, ...readRecentOrders().filter((c) => c !== code)].slice(0, MAX)))
  } catch {
    // Storage blocked: the order page link still works.
  }
}
