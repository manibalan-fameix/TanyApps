export type CustomerSummary = { phone: string; name: string; orders: number; spent: number; lastOrderAt: Date }

/** Guests are not accounts: they are the distinct mobile numbers on orders. Cancelled orders do not count as spend. */
export function summariseCustomers(
  rows: { customerPhone: string; customerName: string; total: number; status: string; createdAt: Date }[],
): CustomerSummary[] {
  const byPhone = new Map<string, CustomerSummary>()
  for (const r of rows) {
    // An online order nobody has paid for yet is not a real order.
    if (r.status === "pending_payment") continue
    const c = byPhone.get(r.customerPhone)
    if (!c) {
      byPhone.set(r.customerPhone, {
        phone: r.customerPhone,
        name: r.customerName,
        orders: 1,
        spent: r.status === "cancelled" ? 0 : r.total,
        lastOrderAt: r.createdAt,
      })
      continue
    }
    c.orders += 1
    if (r.status !== "cancelled") c.spent += r.total
    if (r.createdAt > c.lastOrderAt) {
      c.lastOrderAt = r.createdAt
      c.name = r.customerName
    }
  }
  return [...byPhone.values()].sort((a, b) => b.spent - a.spent || b.lastOrderAt.getTime() - a.lastOrderAt.getTime())
}
