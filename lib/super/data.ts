import {
  and,
  avg,
  count,
  desc,
  eq,
  gte,
  inArray,
  max,
  ne,
  notInArray,
  sum,
} from "drizzle-orm"

import { unscopedDb as db } from "../db/client"
import {
  bookings,
  cars,
  dealerDomains,
  dealerUsers,
  dealers,
  leads,
  menuItems,
  orders,
  reviews,
  users,
  variants,
} from "../db/schema"
import { billingState, effectivePlanKey } from "../billing/state"
import { PLANS, YEARLY_PAID_MONTHS, getPlan, type PlanKey } from "../plans"
import { tryDecrypt } from "../crypto"
import { requireSuperAdmin } from "./guard"

const DAY = 86_400_000

/** Orders that count as business: not cancelled and not an online order still waiting for payment. */
export const REAL_ORDER = notInArray(orders.status, [
  "cancelled",
  "pending_payment",
])

/** Last four digits only. The super admin sees who a buyer is, not their full number. */
export const maskPhone = (p: string | null | undefined) =>
  p ? `••••${p.replace(/\D/g, "").slice(-4)}` : ""

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

/** Monthly revenue a paying dealer brings in, in rupees. Yearly plans pay 11 months for 12. */
export function monthlyRevenue(planKey: string, cycle: string): number {
  const price = PLANS[planKey as PlanKey]?.monthlyPrice ?? 0
  return cycle === "yearly"
    ? Math.round((price * YEARLY_PAID_MONTHS) / 12)
    : price
}

export type BusinessRow = {
  id: string
  name: string
  slug: string
  industry: string
  plan: string
  planLabel: string
  billingCycle: string
  /** free | trial | active | grace | suspended | legacy */
  phase: string
  mrr: number
  city: string
  phone: string
  owner: string
  createdAt: string
  trialEndsAt: string | null
  paidThrough: string | null
  subscriptionStatus: string
  razorpayStatus: string
  liveCars: number
  totalCars: number
  soldCars: number
  menuItems: number
  leads: number
  orders: number
  orderValue: number
  bookingValue: number
  rating: number | null
  reviews: number
  /** Latest lead, order, listing or booking. Null if the business has never had any. */
  lastActivityAt: string | null
  /** new: joined this week. healthy: active in 30 days. at_risk: payment trouble or cancelling. dormant: nothing in 30 days. */
  health: "new" | "healthy" | "at_risk" | "dormant"
}

/** One row per business with its plan, billing phase, activity and health. */
export async function loadBusinesses(): Promise<BusinessRow[]> {
  await requireSuperAdmin()
  const [
    dealerRows,
    carCounts,
    leadCounts,
    orderCounts,
    bookingSums,
    owners,
    menuCounts,
    ratings,
    lastLead,
    lastOrder,
    lastCar,
    lastBooking,
  ] = await Promise.all([
    db.select().from(dealers).orderBy(desc(dealers.createdAt)).limit(5000),
    db
      .select({ id: cars.dealerId, status: cars.status, n: count() })
      .from(cars)
      .groupBy(cars.dealerId, cars.status),
    db
      .select({ id: leads.dealerId, n: count() })
      .from(leads)
      .groupBy(leads.dealerId),
    db
      .select({ id: orders.dealerId, n: count(), value: sum(orders.total) })
      .from(orders)
      .where(REAL_ORDER)
      .groupBy(orders.dealerId),
    db
      .select({ id: bookings.dealerId, value: sum(bookings.amount) })
      .from(bookings)
      .where(eq(bookings.status, "paid"))
      .groupBy(bookings.dealerId),
    db
      .select({
        dealerId: dealerUsers.dealerId,
        email: users.email,
        name: users.name,
      })
      .from(dealerUsers)
      .innerJoin(users, eq(users.id, dealerUsers.userId))
      .where(eq(dealerUsers.role, "owner")),
    db
      .select({ id: menuItems.dealerId, n: count() })
      .from(menuItems)
      .groupBy(menuItems.dealerId),
    db
      .select({ id: reviews.dealerId, avg: avg(reviews.rating), n: count() })
      .from(reviews)
      .where(ne(reviews.status, "hidden"))
      .groupBy(reviews.dealerId),
    db
      .select({ id: leads.dealerId, at: max(leads.createdAt) })
      .from(leads)
      .groupBy(leads.dealerId),
    db
      .select({ id: orders.dealerId, at: max(orders.createdAt) })
      .from(orders)
      .groupBy(orders.dealerId),
    db
      .select({ id: cars.dealerId, at: max(cars.listedAt) })
      .from(cars)
      .groupBy(cars.dealerId),
    db
      .select({ id: bookings.dealerId, at: max(bookings.createdAt) })
      .from(bookings)
      .groupBy(bookings.dealerId),
  ])

  const live = new Map<string, number>()
  const total = new Map<string, number>()
  const sold = new Map<string, number>()
  for (const c of carCounts) {
    total.set(c.id, (total.get(c.id) ?? 0) + c.n)
    if (c.status === "live") live.set(c.id, c.n)
    if (c.status === "sold") sold.set(c.id, c.n)
  }
  const leadBy = new Map(leadCounts.map((l) => [l.id, l.n]))
  const orderBy = new Map(orderCounts.map((o) => [o.id, o]))
  const bookingBy = new Map(
    bookingSums.map((b) => [b.id, Number(b.value ?? 0)])
  )
  const menuBy = new Map(menuCounts.map((m) => [m.id, m.n]))
  const ratingBy = new Map(ratings.map((r) => [r.id, r]))
  const ownerBy = new Map<string, string>()
  for (const o of owners)
    if (!ownerBy.has(o.dealerId))
      ownerBy.set(o.dealerId, o.email ?? o.name ?? "")
  const lastBy = new Map<string, number>()
  for (const l of [...lastLead, ...lastOrder, ...lastCar, ...lastBooking]) {
    if (l.at)
      lastBy.set(
        l.id,
        Math.max(lastBy.get(l.id) ?? 0, new Date(l.at).getTime())
      )
  }

  const now = Date.now()
  return dealerRows.map((d) => {
    const planKey = effectivePlanKey(d)
    const state = billingState({ ...d, plan: planKey })
    const last = lastBy.get(d.id) ?? null
    const troubled =
      state.phase === "grace" ||
      state.phase === "suspended" ||
      state.cancelling ||
      state.paymentIssue
    const health: BusinessRow["health"] = troubled
      ? "at_risk"
      : now - d.createdAt.getTime() < 7 * DAY
        ? "new"
        : last && now - last < 30 * DAY
          ? "healthy"
          : "dormant"
    const rating = ratingBy.get(d.id)
    return {
      id: d.id,
      name: d.displayName,
      slug: d.slug,
      industry: d.industry,
      plan: planKey,
      planLabel: getPlan(planKey).label,
      billingCycle: d.billingCycle,
      phase: state.phase,
      mrr:
        state.phase === "active" || state.phase === "grace"
          ? monthlyRevenue(planKey, d.billingCycle)
          : 0,
      city: d.city,
      phone: d.phone ?? "",
      owner: ownerBy.get(d.id) ?? "",
      createdAt: d.createdAt.toISOString(),
      trialEndsAt: iso(d.trialEndsAt),
      paidThrough: iso(d.paidThrough),
      subscriptionStatus: d.subscriptionStatus ?? "",
      razorpayStatus: d.razorpayAccountStatus ?? "",
      liveCars: live.get(d.id) ?? 0,
      totalCars: total.get(d.id) ?? 0,
      soldCars: sold.get(d.id) ?? 0,
      menuItems: menuBy.get(d.id) ?? 0,
      leads: leadBy.get(d.id) ?? 0,
      orders: orderBy.get(d.id)?.n ?? 0,
      orderValue: Number(orderBy.get(d.id)?.value ?? 0),
      bookingValue: bookingBy.get(d.id) ?? 0,
      rating:
        rating?.avg != null ? Number(Number(rating.avg).toFixed(1)) : null,
      reviews: rating?.n ?? 0,
      lastActivityAt: last ? new Date(last).toISOString() : null,
      health,
    }
  })
}

export type Overview = {
  businesses: number
  byIndustry: { industry: string; count: number }[]
  byPlan: { plan: string; label: string; count: number; mrr: number }[]
  byPhase: { phase: string; count: number }[]
  mrr: number
  arr: number
  payingBusinesses: number
  trialsEndingSoon: BusinessRow[]
  paymentIssues: BusinessRow[]
  /** Paying businesses with no activity for 30 days: the ones most likely to cancel. */
  dormantPaying: BusinessRow[]
  /** Trials and free accounts with real usage: the best people to talk to about upgrading. */
  upgradeLeads: BusinessRow[]
  renewals: BusinessRow[]
  paying: BusinessRow[]
  cancelling: BusinessRow[]
  atRiskMrr: number
  trialMrr: number
  signups: { date: string; businesses: number }[]
  newLast7: number
  newLast30: number
  users: number
  cars: { live: number; total: number; sold: number }
  leads: { total: number; last30: number }
  orders: { total: number; last30: number; value: number }
  bookings: { paid: number; value: number }
  recent: BusinessRow[]
  topByActivity: BusinessRow[]
}

export async function loadOverview(): Promise<Overview> {
  const rows = await loadBusinesses()
  const since30 = new Date(Date.now() - 30 * DAY)
  const [
    [userCount],
    carStatus,
    [leadTotal],
    [lead30],
    [orderTotal],
    [order30],
    [bookingPaid],
  ] = await Promise.all([
    db.select({ n: count() }).from(users),
    db
      .select({ status: cars.status, n: count() })
      .from(cars)
      .groupBy(cars.status),
    db.select({ n: count() }).from(leads),
    db.select({ n: count() }).from(leads).where(gte(leads.createdAt, since30)),
    db
      .select({ n: count(), value: sum(orders.total) })
      .from(orders)
      .where(REAL_ORDER),
    db
      .select({ n: count() })
      .from(orders)
      .where(and(REAL_ORDER, gte(orders.createdAt, since30))),
    db
      .select({ n: count(), value: sum(bookings.amount) })
      .from(bookings)
      .where(eq(bookings.status, "paid")),
  ])

  const tally = <K extends string>(key: (r: BusinessRow) => K) => {
    const m = new Map<K, number>()
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1)
    return m
  }
  const mrr = rows.reduce((s, r) => s + r.mrr, 0)
  const now = Date.now()
  const signups = new Map<string, number>()
  for (let i = 29; i >= 0; i--)
    signups.set(new Date(now - i * DAY).toISOString().slice(0, 10), 0)
  for (const r of rows) {
    const k = r.createdAt.slice(0, 10)
    if (signups.has(k)) signups.set(k, (signups.get(k) ?? 0) + 1)
  }
  const statusCount = (s: string) =>
    carStatus.find((c) => c.status === s)?.n ?? 0

  return {
    businesses: rows.length,
    byIndustry: [...tally((r) => r.industry)].map(([industry, count]) => ({
      industry,
      count,
    })),
    byPlan: Object.entries(PLANS).map(([plan, p]) => {
      const group = rows.filter((r) => r.plan === plan)
      return {
        plan,
        label: p.label,
        count: group.length,
        mrr: group.reduce((s, r) => s + r.mrr, 0),
      }
    }),
    byPhase: [...tally((r) => r.phase)].map(([phase, count]) => ({
      phase,
      count,
    })),
    mrr,
    arr: mrr * 12,
    payingBusinesses: rows.filter((r) => r.mrr > 0).length,
    trialsEndingSoon: rows
      .filter(
        (r) =>
          r.phase === "trial" &&
          r.trialEndsAt &&
          new Date(r.trialEndsAt).getTime() - now < 7 * DAY
      )
      .sort((a, b) => (a.trialEndsAt ?? "").localeCompare(b.trialEndsAt ?? "")),
    dormantPaying: rows.filter((r) => r.mrr > 0 && r.health === "dormant"),
    upgradeLeads: rows
      .filter(
        (r) =>
          (r.phase === "trial" || r.phase === "free") && r.leads + r.orders >= 3
      )
      .sort((a, b) => b.leads + b.orders - (a.leads + a.orders))
      .slice(0, 8),
    paying: rows.filter((r) => r.mrr > 0).sort((a, b) => b.mrr - a.mrr),
    cancelling: rows.filter((r) => r.subscriptionStatus === "cancelled"),
    renewals: rows
      .filter(
        (r) =>
          r.phase === "active" &&
          r.paidThrough &&
          new Date(r.paidThrough).getTime() - now < 30 * DAY
      )
      .sort((a, b) => (a.paidThrough ?? "").localeCompare(b.paidThrough ?? "")),
    atRiskMrr: rows
      .filter(
        (r) => r.mrr > 0 && (r.health === "at_risk" || r.health === "dormant")
      )
      .reduce((s, r) => s + r.mrr, 0),
    trialMrr: rows
      .filter((r) => r.phase === "trial")
      .reduce((s, r) => s + monthlyRevenue(r.plan, r.billingCycle), 0),
    paymentIssues: rows.filter(
      (r) =>
        r.phase === "grace" ||
        r.phase === "suspended" ||
        ["pending", "halted"].includes(r.subscriptionStatus)
    ),
    signups: [...signups].map(([date, businesses]) => ({ date, businesses })),
    newLast7: rows.filter(
      (r) => now - new Date(r.createdAt).getTime() < 7 * DAY
    ).length,
    newLast30: rows.filter(
      (r) => now - new Date(r.createdAt).getTime() < 30 * DAY
    ).length,
    users: userCount?.n ?? 0,
    cars: {
      live: statusCount("live"),
      total: carStatus.reduce((s, c) => s + c.n, 0),
      sold: statusCount("sold"),
    },
    leads: { total: leadTotal?.n ?? 0, last30: lead30?.n ?? 0 },
    orders: {
      total: orderTotal?.n ?? 0,
      last30: order30?.n ?? 0,
      value: Number(orderTotal?.value ?? 0),
    },
    bookings: {
      paid: bookingPaid?.n ?? 0,
      value: Number(bookingPaid?.value ?? 0),
    },
    recent: rows.slice(0, 6),
    topByActivity: [...rows]
      .sort((a, b) => b.leads + b.orders - (a.leads + a.orders))
      .slice(0, 6),
  }
}

export type BusinessDetail = {
  row: BusinessRow
  profile: Record<string, unknown>
  theme: Record<string, unknown>
  businessHours: unknown
  serviceArea: Record<string, unknown> | null
  orderSettings: Record<string, unknown> | null
  logoUrl: string | null
  subscriptionId: string
  cancelRequestedAt: string | null
  nextPlan: string | null
  nextPlanStartsAt: string | null
  razorpayAccountId: string
  team: { name: string; email: string; phone: string; role: string }[]
  domains: { hostname: string; verified: boolean }[]
  recentCars: {
    id: string
    title: string
    status: string
    price: number | null
    km: number | null
    listedAt: string | null
  }[]
  recentLeads: {
    id: string
    name: string
    phone: string
    car: string
    source: string
    status: string
    createdAt: string
  }[]
  recentOrders: {
    id: string
    code: string
    customer: string
    phone: string
    total: number
    status: string
    payment: string
    createdAt: string
  }[]
  recentBookings: {
    id: string
    buyer: string
    amount: number
    status: string
    createdAt: string
  }[]
}

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

export async function loadBusiness(id: string): Promise<BusinessDetail | null> {
  await requireSuperAdmin()
  if (!isUuid(id)) return null
  const [dealer] = await db
    .select()
    .from(dealers)
    .where(eq(dealers.id, id))
    .limit(1)
  if (!dealer) return null
  const row = (await loadBusinesses()).find((r) => r.id === id)
  if (!row) return null

  const [team, domains, carRows, leadRows, orderRows, bookingRows] =
    await Promise.all([
      db
        .select({
          name: users.name,
          email: users.email,
          phone: users.phone,
          role: dealerUsers.role,
        })
        .from(dealerUsers)
        .innerJoin(users, eq(users.id, dealerUsers.userId))
        .where(eq(dealerUsers.dealerId, id)),
      db.select().from(dealerDomains).where(eq(dealerDomains.dealerId, id)),
      db
        .select({ car: cars, make: variants.make, model: variants.model })
        .from(cars)
        .leftJoin(variants, eq(variants.id, cars.variantId))
        .where(eq(cars.dealerId, id))
        .orderBy(desc(cars.listedAt))
        .limit(10),
      db
        .select()
        .from(leads)
        .where(eq(leads.dealerId, id))
        .orderBy(desc(leads.createdAt))
        .limit(10),
      db
        .select()
        .from(orders)
        .where(eq(orders.dealerId, id))
        .orderBy(desc(orders.createdAt))
        .limit(10),
      db
        .select()
        .from(bookings)
        .where(eq(bookings.dealerId, id))
        .orderBy(desc(bookings.createdAt))
        .limit(10),
    ])

  const carTitle = new Map(
    carRows.map(({ car, make, model }) => [
      car.id,
      [car.year, make, model].filter(Boolean).join(" ") || "Untitled car",
    ])
  )
  const leadCars = leadRows.length
    ? await db
        .select({
          id: cars.id,
          year: cars.year,
          make: variants.make,
          model: variants.model,
        })
        .from(cars)
        .leftJoin(variants, eq(variants.id, cars.variantId))
        .where(
          inArray(
            cars.id,
            leadRows.map((l) => l.carId)
          )
        )
    : []
  for (const c of leadCars)
    if (!carTitle.has(c.id))
      carTitle.set(
        c.id,
        [c.year, c.make, c.model].filter(Boolean).join(" ") || "Untitled car"
      )

  return {
    row,
    profile: dealer.profile ?? {},
    theme: (dealer.theme ?? {}) as unknown as Record<string, unknown>,
    businessHours: dealer.businessHours,
    serviceArea: dealer.serviceArea,
    orderSettings: dealer.orderSettings,
    logoUrl: dealer.logoUrl,
    subscriptionId: dealer.subscriptionId ?? "",
    cancelRequestedAt: iso(dealer.cancelRequestedAt),
    nextPlan: dealer.nextPlan,
    nextPlanStartsAt: iso(dealer.nextPlanStartsAt),
    razorpayAccountId: dealer.razorpayAccountId ?? "",
    team: team.map((t) => ({
      name: t.name ?? "",
      email: t.email ?? "",
      phone: t.phone ?? "",
      role: t.role,
    })),
    domains: domains.map((d) => ({
      hostname: d.hostname,
      verified: d.verifiedAt != null,
    })),
    recentCars: carRows.map(({ car }) => ({
      id: car.id,
      title: carTitle.get(car.id) ?? "",
      status: car.status,
      price: car.askingPrice,
      km: car.kmDriven,
      listedAt: iso(car.listedAt),
    })),
    recentLeads: leadRows.map((l) => ({
      id: l.id,
      name: l.name,
      phone: maskPhone(tryDecrypt(l.phone)),
      car: carTitle.get(l.carId) ?? "",
      source: l.source,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
    })),
    recentOrders: orderRows.map((o) => ({
      id: o.id,
      code: o.code,
      customer: o.customerName,
      phone: maskPhone(o.customerPhone),
      total: o.total,
      status: o.status,
      payment: `${o.paymentMethod} · ${o.paymentStatus}`,
      createdAt: o.createdAt.toISOString(),
    })),
    recentBookings: bookingRows.map((b) => ({
      id: b.id,
      buyer: b.buyerName,
      amount: b.amount,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
    })),
  }
}

// ---------- platform-wide lists ----------

const LIST_LIMIT = 2000

export type UserRow = {
  id: string
  name: string
  email: string
  phone: string
  business: string
  businessId: string
  role: string
  verified: boolean
}

export async function loadUsers(): Promise<UserRow[]> {
  await requireSuperAdmin()
  const rows = await db
    .select({
      u: users,
      dealerId: dealers.id,
      dealer: dealers.displayName,
      role: dealerUsers.role,
    })
    .from(users)
    .leftJoin(dealerUsers, eq(dealerUsers.userId, users.id))
    .leftJoin(dealers, eq(dealers.id, dealerUsers.dealerId))
    .limit(LIST_LIMIT)
  return rows.map(({ u, dealerId, dealer, role }) => ({
    id: `${u.id}:${dealerId ?? ""}`,
    name: u.name ?? "",
    email: u.email ?? "",
    phone: u.phone ?? "",
    business: dealer ?? "",
    businessId: dealerId ?? "",
    role: role ?? "no business",
    verified: u.emailVerified != null,
  }))
}

export type CarListRow = {
  id: string
  title: string
  business: string
  businessId: string
  status: string
  year: number | null
  km: number | null
  fuel: string
  price: number | null
  soldPrice: number | null
  rcVerified: boolean
  listedAt: string | null
}

export async function loadCars(dealerId?: string): Promise<CarListRow[]> {
  await requireSuperAdmin()
  const rows = await db
    .select({
      car: cars,
      make: variants.make,
      model: variants.model,
      dealer: dealers.displayName,
    })
    .from(cars)
    .innerJoin(dealers, eq(dealers.id, cars.dealerId))
    .leftJoin(variants, eq(variants.id, cars.variantId))
    .where(dealerId ? eq(cars.dealerId, dealerId) : undefined)
    .orderBy(desc(cars.listedAt))
    .limit(LIST_LIMIT)
  return rows.map(({ car, make, model, dealer }) => ({
    id: car.id,
    title: [car.year, make, model].filter(Boolean).join(" ") || "Untitled car",
    business: dealer,
    businessId: car.dealerId,
    status: car.status,
    year: car.year,
    km: car.kmDriven,
    fuel: car.fuel ?? "",
    price: car.askingPrice,
    soldPrice: car.soldPrice,
    rcVerified: car.rcVerifiedAt != null,
    listedAt: iso(car.listedAt),
  }))
}

export type LeadListRow = {
  id: string
  name: string
  phone: string
  business: string
  businessId: string
  car: string
  source: string
  status: string
  createdAt: string
}

export async function loadLeads(dealerId?: string): Promise<LeadListRow[]> {
  await requireSuperAdmin()
  const rows = await db
    .select({
      lead: leads,
      make: variants.make,
      model: variants.model,
      year: cars.year,
      dealer: dealers.displayName,
    })
    .from(leads)
    .innerJoin(dealers, eq(dealers.id, leads.dealerId))
    .innerJoin(cars, eq(cars.id, leads.carId))
    .leftJoin(variants, eq(variants.id, cars.variantId))
    .where(dealerId ? eq(leads.dealerId, dealerId) : undefined)
    .orderBy(desc(leads.createdAt))
    .limit(LIST_LIMIT)
  return rows.map(({ lead, make, model, year, dealer }) => ({
    id: lead.id,
    name: lead.name,
    phone: maskPhone(tryDecrypt(lead.phone)),
    business: dealer,
    businessId: lead.dealerId,
    car: [year, make, model].filter(Boolean).join(" ") || "Untitled car",
    source: lead.source,
    status: lead.status,
    createdAt: lead.createdAt.toISOString(),
  }))
}

export type OrderListRow = {
  id: string
  code: string
  customer: string
  phone: string
  business: string
  businessId: string
  fulfilment: string
  total: number
  payment: string
  paymentStatus: string
  status: string
  createdAt: string
}

export async function loadOrders(dealerId?: string): Promise<OrderListRow[]> {
  await requireSuperAdmin()
  const rows = await db
    .select({ o: orders, dealer: dealers.displayName })
    .from(orders)
    .innerJoin(dealers, eq(dealers.id, orders.dealerId))
    .where(dealerId ? eq(orders.dealerId, dealerId) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(LIST_LIMIT)
  return rows.map(({ o, dealer }) => ({
    id: o.id,
    code: o.code,
    customer: o.customerName,
    phone: maskPhone(o.customerPhone),
    business: dealer,
    businessId: o.dealerId,
    fulfilment: o.fulfilment,
    total: o.total,
    payment: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
  }))
}

export type BookingListRow = {
  id: string
  buyer: string
  phone: string
  business: string
  businessId: string
  car: string
  amount: number
  status: string
  razorpayOrderId: string
  createdAt: string
  paidAt: string | null
}

export async function loadBookings(
  dealerId?: string
): Promise<BookingListRow[]> {
  await requireSuperAdmin()
  const rows = await db
    .select({
      b: bookings,
      dealer: dealers.displayName,
      make: variants.make,
      model: variants.model,
      year: cars.year,
    })
    .from(bookings)
    .innerJoin(dealers, eq(dealers.id, bookings.dealerId))
    .innerJoin(cars, eq(cars.id, bookings.carId))
    .leftJoin(variants, eq(variants.id, cars.variantId))
    .where(dealerId ? eq(bookings.dealerId, dealerId) : undefined)
    .orderBy(desc(bookings.createdAt))
    .limit(LIST_LIMIT)
  return rows.map(({ b, dealer, make, model, year }) => ({
    id: b.id,
    buyer: b.buyerName,
    phone: maskPhone(tryDecrypt(b.buyerPhone)),
    business: dealer,
    businessId: b.dealerId,
    car: [year, make, model].filter(Boolean).join(" ") || "Untitled car",
    amount: b.amount,
    status: b.status,
    razorpayOrderId: b.razorpayOrderId,
    createdAt: b.createdAt.toISOString(),
    paidAt: iso(b.paidAt),
  }))
}
