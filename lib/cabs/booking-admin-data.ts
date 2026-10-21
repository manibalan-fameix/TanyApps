import { and, asc, desc, eq, gte, ilike, inArray, lt, or } from "drizzle-orm"

import { decrypt, tryDecrypt } from "../crypto"
import { normalizePhone, phoneHash } from "../crypto/blind-index"
import { customers, trips } from "../db/schema"
import type { ScopedDb } from "../db/scoped"
import { istDayNumber } from "./time"
import { ACTIVE_STATUSES } from "./trip-status"
import { type TripView, toTripView } from "./trip-data"

export type InboxTab = "new" | "pending" | "today" | "upcoming" | "all"
export const INBOX_TABS: readonly InboxTab[] = ["new", "pending", "today", "upcoming", "all"]
export const isInboxTab = (v: unknown): v is InboxTab => INBOX_TABS.includes(v as InboxTab)

/** What each inbox tab means. New: waiting for the operator's answer. Pending: accepted, still to be given a vehicle and driver (or an advance). Today and Upcoming: pickups by India calendar day. */
export const INBOX_LABEL: Record<InboxTab, string> = { new: "New", pending: "Pending", today: "Today", upcoming: "Upcoming", all: "All" }

export type InboxRow = TripView & { customerName: string; customerPhone: string }

/** The start of today in India, as an instant. */
export const istDayStart = (now: Date): Date => new Date(istDayNumber(now) * 86_400_000 - 330 * 60_000)

function where(tab: InboxTab, now: Date) {
  const start = istDayStart(now)
  const end = new Date(start.getTime() + 86_400_000)
  switch (tab) {
    case "new":
      return eq(trips.status, "requested")
    case "pending":
      return eq(trips.status, "confirmed")
    case "today":
      return and(gte(trips.startAt, start), lt(trips.startAt, end), inArray(trips.status, [...ACTIVE_STATUSES]))
    case "upcoming":
      return and(gte(trips.startAt, end), inArray(trips.status, ["requested", "confirmed", "assigned"]))
    case "all":
      return undefined
  }
}

export async function loadInbox(db: ScopedDb, tab: InboxTab, now: Date): Promise<{ rows: InboxRow[]; counts: Record<InboxTab, number> }> {
  const [list, classes, counts] = await Promise.all([
    db.trips.select(where(tab, now), { orderBy: tab === "all" ? [desc(trips.createdAt)] : [asc(trips.startAt)], limit: 200 }),
    db.vehicleClasses.select(),
    Promise.all(INBOX_TABS.map(async (t) => [t, await db.trips.count(where(t, now))] as const)),
  ])
  const names = new Map(classes.map((c) => [c.id, c.name]))
  const people = await db.customers.select(list.length ? inArray(customers.id, [...new Set(list.map((t) => t.customerId))]) : eq(customers.id, "00000000-0000-0000-0000-000000000000"))
  const byId = new Map(people.map((c) => [c.id, c]))
  const rows = list.map((t) => {
    const c = byId.get(t.customerId)
    return { ...toTripView(t, names.get(t.vehicleClassId) ?? ""), customerName: c?.name ?? "", customerPhone: c ? (tryDecrypt(c.phoneEnc) ?? "") : "" }
  })
  return { rows, counts: Object.fromEntries(counts) as Record<InboxTab, number> }
}

export type CustomerRow = { id: string; name: string; phone: string; verified: boolean; language: string; trips: number; lastTripAt: string | null; joinedAt: string }

/** Customers of this business, newest first. A search that looks like a phone number is an exact match on the keyed hash; anything else matches names. */
export async function loadCustomers(db: ScopedDb, q: string): Promise<CustomerRow[]> {
  const term = q.trim()
  const phone = term ? normalizePhone(term) : null
  const filter = !term ? undefined : phone ? eq(customers.phoneHash, phoneHash(phone)) : or(ilike(customers.name, `%${term.replace(/[%_\\]/g, "\\$&")}%`))
  const rows = await db.customers.select(filter, { orderBy: [desc(customers.createdAt)], limit: 200 })
  if (rows.length === 0) return []
  const all = await db.trips.select(inArray(trips.customerId, rows.map((r) => r.id)))
  const stats = new Map<string, { n: number; last: Date | null }>()
  for (const t of all) {
    const s = stats.get(t.customerId) ?? { n: 0, last: null }
    s.n++
    if (!s.last || t.startAt > s.last) s.last = t.startAt
    stats.set(t.customerId, s)
  }
  return rows.map((c) => ({ id: c.id, name: c.name ?? "", phone: decrypt(c.phoneEnc), verified: c.verifiedAt !== null, language: c.language, trips: stats.get(c.id)?.n ?? 0, lastTripAt: stats.get(c.id)?.last?.toISOString() ?? null, joinedAt: c.createdAt.toISOString() }))
}

export async function loadCustomerDetail(db: ScopedDb, id: string) {
  const [c] = await db.customers.select(eq(customers.id, id), { limit: 1 })
  if (!c) return null
  const [list, classes] = await Promise.all([db.trips.select(eq(trips.customerId, id), { orderBy: [desc(trips.createdAt)], limit: 100 }), db.vehicleClasses.select()])
  const names = new Map(classes.map((k) => [k.id, k.name]))
  return {
    customer: { id: c.id, name: c.name ?? "", phone: decrypt(c.phoneEnc), email: (c.emailEnc && tryDecrypt(c.emailEnc)) || "", verified: c.verifiedAt !== null, language: c.language, joinedAt: c.createdAt.toISOString(), lastLoginAt: c.lastLoginAt?.toISOString() ?? null },
    trips: list.map((t) => toTripView(t, names.get(t.vehicleClassId) ?? "")),
  }
}
