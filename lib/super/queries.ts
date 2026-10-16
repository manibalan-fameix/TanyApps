import { createHash } from "node:crypto"
import {
  and,
  avg,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  or,
  sql,
  sum,
} from "drizzle-orm"

import { unscopedDb as db } from "../db/client"
import {
  banners,
  bookings,
  cars,
  coupons,
  deliveryPartners,
  deliveryZones,
  dealers,
  enquiries,
  leads,
  menuCategories,
  menuItems,
  orders,
  reviews,
  users,
  variants,
} from "../db/schema"
import { REAL_ORDER, loadBusinesses, maskPhone, type BusinessRow } from "./data"
import { requireSuperAdmin } from "./guard"

const DAY = 86_400_000
const LIMIT = 2000
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

/** The calendar day in India, as YYYY-MM-DD. Every chart on this admin buckets by IST. */
export const istDay = (ms: number) =>
  new Date(ms + 19_800_000).toISOString().slice(0, 10)
const dayOf = (col: Parameters<typeof sql>[1]) =>
  sql<string>`to_char(date_trunc('day', ${col} at time zone 'Asia/Kolkata'), 'YYYY-MM-DD')`

type Daily = Map<string, { n: number; v: number }>

async function daily(
  table: typeof leads | typeof orders | typeof bookings | typeof dealers,
  col: unknown,
  since: Date,
  where: unknown[],
  valueCol?: unknown
): Promise<Daily> {
  const day = dayOf(col as never)
  const rows = await db
    .select({
      day,
      n: count(),
      v: valueCol ? sum(valueCol as never) : sql<number>`0`,
    })
    .from(table as never)
    .where(and(gte(col as never, since), ...(where as never[])))
    .groupBy(day)
  return new Map(
    (rows as { day: string; n: number; v: string | number | null }[]).map(
      (r) => [r.day, { n: Number(r.n), v: Number(r.v ?? 0) }]
    )
  )
}

function span(days: number, offset = 0) {
  const now = Date.now() - offset * DAY
  return Array.from({ length: days }, (_, i) =>
    istDay(now - (days - 1 - i) * DAY)
  )
}

const sumOf = (m: Daily, keys: string[], f: "n" | "v") =>
  keys.reduce((s, k) => s + (m.get(k)?.[f] ?? 0), 0)
/** Percent change from the previous period. Null when there is nothing to compare with. */
export const delta = (now: number, before: number) =>
  before > 0 ? Math.round(((now - before) / before) * 100) : null

export type Mix = { key: string; count: number }[]
const mixOf = (rows: { key: string | null; n: number }[]): Mix =>
  rows
    .map((r) => ({ key: r.key ?? "unknown", count: Number(r.n) }))
    .sort((a, b) => b.count - a.count)

export type Metric = { value: number; delta: number | null }

export type PlatformAnalytics = {
  days: number
  series: {
    date: string
    signups: number
    leads: number
    orders: number
    gmv: number
    bookings: number
    bookingValue: number
  }[]
  signups: Metric
  leads: Metric
  orders: Metric
  gmv: Metric
  aov: Metric
  bookingValue: Metric
  orderStatus: Mix
  fulfilment: Mix
  payment: Mix
  leadSource: Mix
  leadStage: Mix
  bookingStatus: Mix
  carStatus: Mix
  ratings: Mix
  cities: { city: string; businesses: number; gmv: number; leads: number }[]
  industries: {
    industry: string
    businesses: number
    paying: number
    mrr: number
    gmv: number
  }[]
  funnel: { label: string; count: number }[]
  cohorts: { month: string; signed: number; active: number; paying: number }[]
  health: { key: string; count: number }[]
  topGmv: BusinessRow[]
  topLeads: BusinessRow[]
}

export async function loadPlatformAnalytics(
  days: number
): Promise<PlatformAnalytics> {
  await requireSuperAdmin()
  const since = new Date(Date.now() - 2 * days * DAY)
  const rangeStart = new Date(Date.now() - days * DAY)
  const inRange = (col: unknown) => gte(col as never, rangeStart)
  const [
    rows,
    dLeads,
    dOrders,
    dBookings,
    dSignups,
    orderStatus,
    fulfilment,
    payment,
    leadSource,
    leadStage,
    bookingStatus,
    carStatus,
    ratings,
  ] = await Promise.all([
    loadBusinesses(),
    daily(leads, leads.createdAt, since, []),
    daily(orders, orders.createdAt, since, [REAL_ORDER], orders.total),
    daily(
      bookings,
      bookings.createdAt,
      since,
      [eq(bookings.status, "paid")],
      bookings.amount
    ),
    daily(dealers, dealers.createdAt, since, []),
    db
      .select({ key: orders.status, n: count() })
      .from(orders)
      .where(inRange(orders.createdAt))
      .groupBy(orders.status),
    db
      .select({ key: orders.fulfilment, n: count() })
      .from(orders)
      .where(and(inRange(orders.createdAt), REAL_ORDER))
      .groupBy(orders.fulfilment),
    db
      .select({
        key: sql<string>`${orders.paymentMethod} || ' · ' || ${orders.paymentStatus}`,
        n: count(),
      })
      .from(orders)
      .where(and(inRange(orders.createdAt), REAL_ORDER))
      .groupBy(orders.paymentMethod, orders.paymentStatus),
    db
      .select({ key: leads.source, n: count() })
      .from(leads)
      .where(inRange(leads.createdAt))
      .groupBy(leads.source),
    db
      .select({ key: leads.status, n: count() })
      .from(leads)
      .where(inRange(leads.createdAt))
      .groupBy(leads.status),
    db
      .select({ key: bookings.status, n: count() })
      .from(bookings)
      .where(inRange(bookings.createdAt))
      .groupBy(bookings.status),
    db.select({ key: cars.status, n: count() }).from(cars).groupBy(cars.status),
    db
      .select({ key: sql<string>`${reviews.rating}::text`, n: count() })
      .from(reviews)
      .groupBy(reviews.rating),
  ])

  const cur = span(days)
  const prev = span(days, days)
  const series = cur.map((date) => ({
    date,
    signups: dSignups.get(date)?.n ?? 0,
    leads: dLeads.get(date)?.n ?? 0,
    orders: dOrders.get(date)?.n ?? 0,
    gmv: dOrders.get(date)?.v ?? 0,
    bookings: dBookings.get(date)?.n ?? 0,
    bookingValue: dBookings.get(date)?.v ?? 0,
  }))
  const metric = (m: Daily, f: "n" | "v"): Metric => ({
    value: sumOf(m, cur, f),
    delta: delta(sumOf(m, cur, f), sumOf(m, prev, f)),
  })
  const gmvNow = sumOf(dOrders, cur, "v")
  const ordersNow = sumOf(dOrders, cur, "n")
  const gmvBefore = sumOf(dOrders, prev, "v")
  const ordersBefore = sumOf(dOrders, prev, "n")
  const aovNow = ordersNow ? Math.round(gmvNow / ordersNow) : 0
  const aovBefore = ordersBefore ? Math.round(gmvBefore / ordersBefore) : 0

  const group = <K extends string>(key: (r: BusinessRow) => K) => {
    const m = new Map<K, BusinessRow[]>()
    for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r])
    return m
  }
  const cities = [...group((r) => (r.city || "Unknown") as string)]
    .map(([city, g]) => ({
      city,
      businesses: g.length,
      gmv: g.reduce((s, r) => s + r.orderValue + r.bookingValue, 0),
      leads: g.reduce((s, r) => s + r.leads, 0),
    }))
    .sort((a, b) => b.businesses - a.businesses)
    .slice(0, 10)
  const industries = [...group((r) => r.industry)].map(([industry, g]) => ({
    industry,
    businesses: g.length,
    paying: g.filter((r) => r.mrr > 0).length,
    mrr: g.reduce((s, r) => s + r.mrr, 0),
    gmv: g.reduce((s, r) => s + r.orderValue + r.bookingValue, 0),
  }))

  const activated = rows.filter((r) => r.totalCars + r.menuItems > 0)
  const engaged = activated.filter((r) => r.leads + r.orders > 0)
  const funnel = [
    { label: "Signed up", count: rows.length },
    { label: "Added first listing or dish", count: activated.length },
    { label: "Got a lead or order", count: engaged.length },
    { label: "Paying", count: rows.filter((r) => r.mrr > 0).length },
  ]

  const months = new Map<string, BusinessRow[]>()
  for (const r of rows)
    months.set(r.createdAt.slice(0, 7), [
      ...(months.get(r.createdAt.slice(0, 7)) ?? []),
      r,
    ])
  const cohorts = [...months]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 6)
    .map(([month, g]) => ({
      month,
      signed: g.length,
      active: g.filter((r) => r.health === "healthy" || r.health === "new")
        .length,
      paying: g.filter((r) => r.mrr > 0).length,
    }))

  const healthCount = new Map<string, number>()
  for (const r of rows)
    healthCount.set(r.health, (healthCount.get(r.health) ?? 0) + 1)

  return {
    days,
    series,
    signups: metric(dSignups, "n"),
    leads: metric(dLeads, "n"),
    orders: metric(dOrders, "n"),
    gmv: metric(dOrders, "v"),
    aov: { value: aovNow, delta: delta(aovNow, aovBefore) },
    bookingValue: metric(dBookings, "v"),
    orderStatus: mixOf(orderStatus),
    fulfilment: mixOf(fulfilment),
    payment: mixOf(payment),
    leadSource: mixOf(leadSource),
    leadStage: mixOf(leadStage),
    bookingStatus: mixOf(bookingStatus),
    carStatus: mixOf(carStatus),
    ratings: mixOf(ratings).sort((a, b) => Number(b.key) - Number(a.key)),
    cities,
    industries,
    funnel,
    cohorts,
    health: [...healthCount].map(([key, count]) => ({ key, count })),
    topGmv: [...rows]
      .sort(
        (a, b) =>
          b.orderValue + b.bookingValue - (a.orderValue + a.bookingValue)
      )
      .slice(0, 8),
    topLeads: [...rows].sort((a, b) => b.leads - a.leads).slice(0, 8),
  }
}

// ---------- one business, in depth ----------

export type BusinessInsights = {
  series: {
    date: string
    leads: number
    orders: number
    gmv: number
    bookings: number
  }[]
  totals: { leads: Metric; orders: Metric; gmv: Metric; aov: Metric }
  orderStatus: Mix
  payment: Mix
  fulfilment: Mix
  leadStage: Mix
  leadSource: Mix
  winRate: number | null
  cancelRate: number | null
  repeatRate: number | null
  customers: number
  avgDaysToSell: number | null
  soldValue: number
  stockValue: number
  topItems: { name: string; qty: number; revenue: number }[]
  rating: { avg: number | null; count: number; pending: number }
  lastOrderAt: string | null
  lastLeadAt: string | null
}

export async function loadBusinessInsights(
  dealerId: string,
  days = 30
): Promise<BusinessInsights> {
  await requireSuperAdmin()
  const since = new Date(Date.now() - 2 * days * DAY)
  const [
    dLeads,
    dOrders,
    dBookings,
    orderStatus,
    payment,
    fulfilment,
    leadStage,
    leadSource,
    carRows,
    orderRows,
    ratingRows,
    pending,
  ] = await Promise.all([
    daily(leads, leads.createdAt, since, [eq(leads.dealerId, dealerId)]),
    daily(
      orders,
      orders.createdAt,
      since,
      [eq(orders.dealerId, dealerId), REAL_ORDER],
      orders.total
    ),
    daily(
      bookings,
      bookings.createdAt,
      since,
      [eq(bookings.dealerId, dealerId), eq(bookings.status, "paid")],
      bookings.amount
    ),
    db
      .select({ key: orders.status, n: count() })
      .from(orders)
      .where(eq(orders.dealerId, dealerId))
      .groupBy(orders.status),
    db
      .select({
        key: sql<string>`${orders.paymentMethod} || ' · ' || ${orders.paymentStatus}`,
        n: count(),
      })
      .from(orders)
      .where(and(eq(orders.dealerId, dealerId), REAL_ORDER))
      .groupBy(orders.paymentMethod, orders.paymentStatus),
    db
      .select({ key: orders.fulfilment, n: count() })
      .from(orders)
      .where(and(eq(orders.dealerId, dealerId), REAL_ORDER))
      .groupBy(orders.fulfilment),
    db
      .select({ key: leads.status, n: count() })
      .from(leads)
      .where(eq(leads.dealerId, dealerId))
      .groupBy(leads.status),
    db
      .select({ key: leads.source, n: count() })
      .from(leads)
      .where(eq(leads.dealerId, dealerId))
      .groupBy(leads.source),
    db
      .select({
        status: cars.status,
        price: cars.askingPrice,
        soldPrice: cars.soldPrice,
        listedAt: cars.listedAt,
        soldAt: cars.soldAt,
      })
      .from(cars)
      .where(eq(cars.dealerId, dealerId)),
    db
      .select({
        lines: orders.lines,
        phone: orders.customerPhone,
        status: orders.status,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.dealerId, dealerId))
      .orderBy(desc(orders.createdAt))
      .limit(1000),
    db
      .select({ avg: avg(reviews.rating), n: count() })
      .from(reviews)
      .where(
        and(eq(reviews.dealerId, dealerId), sql`${reviews.status} <> 'hidden'`)
      ),
    db
      .select({ n: count() })
      .from(reviews)
      .where(
        and(eq(reviews.dealerId, dealerId), eq(reviews.status, "pending"))
      ),
  ])

  const cur = span(days)
  const prev = span(days, days)
  const m = (d: Daily, f: "n" | "v"): Metric => ({
    value: sumOf(d, cur, f),
    delta: delta(sumOf(d, cur, f), sumOf(d, prev, f)),
  })
  const gmv = sumOf(dOrders, cur, "v")
  const ord = sumOf(dOrders, cur, "n")
  const gmvPrev = sumOf(dOrders, prev, "v")
  const ordPrev = sumOf(dOrders, prev, "n")

  const stage = (k: string) => leadStage.find((l) => l.key === k)?.n ?? 0
  const leadTotal = leadStage.reduce((s, l) => s + Number(l.n), 0)
  const won = stage("won")
  const lost = stage("lost")
  const orderTotal = orderStatus.reduce((s, o) => s + Number(o.n), 0)
  const cancelled = orderStatus.find((o) => o.key === "cancelled")?.n ?? 0

  const byPhone = new Map<string, number>()
  const items = new Map<string, { qty: number; revenue: number }>()
  for (const o of orderRows) {
    if (o.status === "cancelled" || o.status === "pending_payment") continue
    byPhone.set(o.phone, (byPhone.get(o.phone) ?? 0) + 1)
    for (const l of o.lines ?? []) {
      const cur2 = items.get(l.name) ?? { qty: 0, revenue: 0 }
      items.set(l.name, {
        qty: cur2.qty + l.qty,
        revenue: cur2.revenue + l.qty * l.price,
      })
    }
  }
  const repeat = [...byPhone.values()].filter((n) => n > 1).length

  const soldCars = carRows.filter((c) => c.status === "sold")
  const spans = soldCars
    .filter((c) => c.listedAt && c.soldAt)
    .map((c) => (c.soldAt!.getTime() - c.listedAt!.getTime()) / DAY)

  return {
    series: cur.map((date) => ({
      date,
      leads: dLeads.get(date)?.n ?? 0,
      orders: dOrders.get(date)?.n ?? 0,
      gmv: dOrders.get(date)?.v ?? 0,
      bookings: dBookings.get(date)?.n ?? 0,
    })),
    totals: {
      leads: m(dLeads, "n"),
      orders: m(dOrders, "n"),
      gmv: m(dOrders, "v"),
      aov: {
        value: ord ? Math.round(gmv / ord) : 0,
        delta: delta(ord ? gmv / ord : 0, ordPrev ? gmvPrev / ordPrev : 0),
      },
    },
    orderStatus: mixOf(orderStatus),
    payment: mixOf(payment),
    fulfilment: mixOf(fulfilment),
    leadStage: mixOf(leadStage),
    leadSource: mixOf(leadSource),
    winRate:
      won + lost > 0
        ? Math.round((won / (won + lost)) * 100)
        : leadTotal
          ? 0
          : null,
    cancelRate: orderTotal
      ? Math.round((Number(cancelled) / orderTotal) * 100)
      : null,
    repeatRate: byPhone.size ? Math.round((repeat / byPhone.size) * 100) : null,
    customers: byPhone.size,
    avgDaysToSell: spans.length
      ? Math.round(spans.reduce((a, b) => a + b, 0) / spans.length)
      : null,
    soldValue: soldCars.reduce((s, c) => s + (c.soldPrice ?? 0), 0),
    stockValue: carRows
      .filter((c) => c.status === "live")
      .reduce((s, c) => s + (c.price ?? 0), 0),
    topItems: [...items]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8),
    rating: {
      avg:
        ratingRows[0]?.avg != null
          ? Number(Number(ratingRows[0].avg).toFixed(1))
          : null,
      count: ratingRows[0]?.n ?? 0,
      pending: pending[0]?.n ?? 0,
    },
    lastOrderAt: iso(orderRows[0]?.createdAt),
    lastLeadAt: null,
  }
}

// ---------- lists (platform-wide, or one business with `dealerId`) ----------

export type MenuRow = {
  id: string
  name: string
  business: string
  businessId: string
  category: string
  price: number
  compareAt: number | null
  veg: boolean
  available: boolean
  featured: boolean
  stock: number | null
  status: string
  createdAt: string
}

export async function loadMenu(dealerId?: string): Promise<MenuRow[]> {
  await requireSuperAdmin()
  const rows = await db
    .select({
      i: menuItems,
      cat: menuCategories.name,
      dealer: dealers.displayName,
    })
    .from(menuItems)
    .innerJoin(dealers, eq(dealers.id, menuItems.dealerId))
    .leftJoin(menuCategories, eq(menuCategories.id, menuItems.categoryId))
    .where(dealerId ? eq(menuItems.dealerId, dealerId) : undefined)
    .orderBy(desc(menuItems.createdAt))
    .limit(LIMIT)
  return rows.map(({ i, cat, dealer }) => ({
    id: i.id,
    name: i.name,
    business: dealer,
    businessId: i.dealerId,
    category: cat ?? "",
    price: i.price,
    compareAt: i.compareAtPrice,
    veg: i.isVeg,
    available: i.isAvailable,
    featured: i.isFeatured,
    stock: i.stockQuantity,
    status: i.isAvailable ? "available" : "sold_out",
    createdAt: i.createdAt.toISOString(),
  }))
}

export type CustomerRow = {
  id: string
  name: string
  phone: string
  business: string
  businessId: string
  orders: number
  spent: number
  avg: number
  lastOrderAt: string
  firstOrderAt: string
  segment: string
}

/** Guests are the distinct numbers on orders, per restaurant. Phones are masked. */
export async function loadCustomers(dealerId?: string): Promise<CustomerRow[]> {
  await requireSuperAdmin()
  const rows = await db
    .select({ o: orders, dealer: dealers.displayName })
    .from(orders)
    .innerJoin(dealers, eq(dealers.id, orders.dealerId))
    .where(
      and(REAL_ORDER, dealerId ? eq(orders.dealerId, dealerId) : undefined)
    )
    .orderBy(desc(orders.createdAt))
    .limit(10_000)
  const map = new Map<string, CustomerRow>()
  for (const { o, dealer } of rows) {
    const k = `${o.dealerId}:${createHash("sha256").update(o.customerPhone).digest("hex").slice(0, 12)}`
    const c = map.get(k)
    if (!c) {
      map.set(k, {
        id: k,
        name: o.customerName,
        phone: maskPhone(o.customerPhone),
        business: dealer,
        businessId: o.dealerId,
        orders: 1,
        spent: o.total,
        avg: 0,
        lastOrderAt: o.createdAt.toISOString(),
        firstOrderAt: o.createdAt.toISOString(),
        segment: "",
      })
    } else {
      c.orders += 1
      c.spent += o.total
      if (o.createdAt.toISOString() < c.firstOrderAt)
        c.firstOrderAt = o.createdAt.toISOString()
    }
  }
  const now = Date.now()
  return [...map.values()]
    .map((c) => ({
      ...c,
      avg: Math.round(c.spent / c.orders),
      segment:
        c.orders >= 5
          ? "loyal"
          : c.orders >= 2
            ? "repeat"
            : now - new Date(c.lastOrderAt).getTime() < 30 * DAY
              ? "new"
              : "one-time",
    }))
    .sort((a, b) => b.spent - a.spent)
}

export type ReviewRow = {
  id: string
  name: string
  rating: number
  comment: string
  business: string
  businessId: string
  status: string
  createdAt: string
}

export async function loadReviews(dealerId?: string): Promise<ReviewRow[]> {
  await requireSuperAdmin()
  const rows = await db
    .select({ r: reviews, dealer: dealers.displayName })
    .from(reviews)
    .innerJoin(dealers, eq(dealers.id, reviews.dealerId))
    .where(dealerId ? eq(reviews.dealerId, dealerId) : undefined)
    .orderBy(desc(reviews.createdAt))
    .limit(LIMIT)
  return rows.map(({ r, dealer }) => ({
    id: r.id,
    name: r.name,
    rating: r.rating,
    comment: r.comment,
    business: dealer,
    businessId: r.dealerId,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }))
}

export type EnquiryRow = {
  id: string
  name: string
  phone: string
  message: string
  business: string
  businessId: string
  status: string
  createdAt: string
}

export async function loadEnquiries(dealerId?: string): Promise<EnquiryRow[]> {
  await requireSuperAdmin()
  const rows = await db
    .select({ e: enquiries, dealer: dealers.displayName })
    .from(enquiries)
    .innerJoin(dealers, eq(dealers.id, enquiries.dealerId))
    .where(dealerId ? eq(enquiries.dealerId, dealerId) : undefined)
    .orderBy(desc(enquiries.createdAt))
    .limit(LIMIT)
  return rows.map(({ e, dealer }) => ({
    id: e.id,
    name: e.name,
    phone: maskPhone(e.phone),
    message: e.message,
    business: dealer,
    businessId: e.dealerId,
    status: e.status,
    createdAt: e.createdAt.toISOString(),
  }))
}

export type CouponRow = {
  id: string
  code: string
  business: string
  businessId: string
  kind: string
  value: number
  minOrder: number
  maxDiscount: number | null
  used: number
  status: string
  expiresAt: string | null
  createdAt: string
}

export async function loadCoupons(dealerId?: string): Promise<CouponRow[]> {
  await requireSuperAdmin()
  const rows = await db
    .select({ c: coupons, dealer: dealers.displayName })
    .from(coupons)
    .innerJoin(dealers, eq(dealers.id, coupons.dealerId))
    .where(dealerId ? eq(coupons.dealerId, dealerId) : undefined)
    .orderBy(desc(coupons.createdAt))
    .limit(LIMIT)
  const now = Date.now()
  return rows.map(({ c, dealer }) => ({
    id: c.id,
    code: c.code,
    business: dealer,
    businessId: c.dealerId,
    kind: c.kind,
    value: c.value,
    minOrder: c.minOrder,
    maxDiscount: c.maxDiscount,
    used: c.usedCount,
    status: !c.isActive
      ? "inactive"
      : c.expiresAt && c.expiresAt.getTime() < now
        ? "expired"
        : "active",
    expiresAt: iso(c.expiresAt),
    createdAt: c.createdAt.toISOString(),
  }))
}

export type PartnerRow = {
  id: string
  name: string
  code: string
  phone: string
  vehicle: string
  business: string
  businessId: string
  status: string
  deliveries: number
  createdAt: string
}

export async function loadPartners(dealerId?: string): Promise<PartnerRow[]> {
  await requireSuperAdmin()
  const [rows, counts] = await Promise.all([
    db
      .select({ p: deliveryPartners, dealer: dealers.displayName })
      .from(deliveryPartners)
      .innerJoin(dealers, eq(dealers.id, deliveryPartners.dealerId))
      .where(dealerId ? eq(deliveryPartners.dealerId, dealerId) : undefined)
      .orderBy(desc(deliveryPartners.createdAt))
      .limit(LIMIT),
    db
      .select({ id: orders.partnerId, n: count() })
      .from(orders)
      .where(and(isNotNull(orders.deliveredAt), isNotNull(orders.partnerId)))
      .groupBy(orders.partnerId),
  ])
  const done = new Map(counts.map((c) => [c.id, c.n]))
  return rows.map(({ p, dealer }) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    phone: maskPhone(p.phone),
    vehicle: p.vehicleNumber,
    business: dealer,
    businessId: p.dealerId,
    status: p.isActive ? "active" : "inactive",
    deliveries: done.get(p.id) ?? 0,
    createdAt: p.createdAt.toISOString(),
  }))
}

export type ZoneRow = {
  id: string
  name: string
  business: string
  businessId: string
  pincodes: string
  fee: number
  minOrder: number | null
  eta: number | null
  status: string
}

export async function loadZones(dealerId?: string): Promise<ZoneRow[]> {
  await requireSuperAdmin()
  const rows = await db
    .select({ z: deliveryZones, dealer: dealers.displayName })
    .from(deliveryZones)
    .innerJoin(dealers, eq(dealers.id, deliveryZones.dealerId))
    .where(dealerId ? eq(deliveryZones.dealerId, dealerId) : undefined)
    .limit(LIMIT)
  return rows.map(({ z, dealer }) => ({
    id: z.id,
    name: z.name,
    business: dealer,
    businessId: z.dealerId,
    pincodes: (z.pincodes ?? []).join(", "),
    fee: z.fee,
    minOrder: z.minOrder,
    eta: z.etaMinutes,
    status: z.isActive ? "active" : "inactive",
  }))
}

export type BannerRow = {
  id: string
  title: string
  subtitle: string
  active: boolean
}

export async function loadBanners(dealerId: string): Promise<BannerRow[]> {
  await requireSuperAdmin()
  const rows = await db
    .select()
    .from(banners)
    .where(eq(banners.dealerId, dealerId))
    .orderBy(banners.sortOrder)
  return rows.map((b) => ({
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    active: b.isActive,
  }))
}

export async function loadCategories(
  dealerId: string
): Promise<{ name: string; items: number }[]> {
  await requireSuperAdmin()
  const [cats, counts] = await Promise.all([
    db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.dealerId, dealerId))
      .orderBy(menuCategories.sortOrder),
    db
      .select({ id: menuItems.categoryId, n: count() })
      .from(menuItems)
      .where(eq(menuItems.dealerId, dealerId))
      .groupBy(menuItems.categoryId),
  ])
  const by = new Map(counts.map((c) => [c.id, c.n]))
  return cats.map((c) => ({ name: c.name, items: by.get(c.id) ?? 0 }))
}

// ---------- activity feed and search ----------

export type ActivityItem = {
  at: string
  kind: "signup" | "lead" | "order" | "booking" | "review" | "enquiry"
  title: string
  detail: string
  business: string
  businessId: string
}

/** The latest things that happened anywhere on the platform, newest first. */
export async function loadActivity(limit = 25): Promise<ActivityItem[]> {
  await requireSuperAdmin()
  const [d, l, o, b, r, e] = await Promise.all([
    db.select().from(dealers).orderBy(desc(dealers.createdAt)).limit(limit),
    db
      .select({ l: leads, dealer: dealers.displayName })
      .from(leads)
      .innerJoin(dealers, eq(dealers.id, leads.dealerId))
      .orderBy(desc(leads.createdAt))
      .limit(limit),
    db
      .select({ o: orders, dealer: dealers.displayName })
      .from(orders)
      .innerJoin(dealers, eq(dealers.id, orders.dealerId))
      .where(REAL_ORDER)
      .orderBy(desc(orders.createdAt))
      .limit(limit),
    db
      .select({ b: bookings, dealer: dealers.displayName })
      .from(bookings)
      .innerJoin(dealers, eq(dealers.id, bookings.dealerId))
      .where(eq(bookings.status, "paid"))
      .orderBy(desc(bookings.createdAt))
      .limit(limit),
    db
      .select({ r: reviews, dealer: dealers.displayName })
      .from(reviews)
      .innerJoin(dealers, eq(dealers.id, reviews.dealerId))
      .orderBy(desc(reviews.createdAt))
      .limit(limit),
    db
      .select({ e: enquiries, dealer: dealers.displayName })
      .from(enquiries)
      .innerJoin(dealers, eq(dealers.id, enquiries.dealerId))
      .orderBy(desc(enquiries.createdAt))
      .limit(limit),
  ])
  const items: ActivityItem[] = [
    ...d.map((x) => ({
      at: x.createdAt.toISOString(),
      kind: "signup" as const,
      title: `${x.displayName} joined`,
      detail: `${x.industry} · ${x.city}`,
      business: x.displayName,
      businessId: x.id,
    })),
    ...l.map(({ l: x, dealer }) => ({
      at: x.createdAt.toISOString(),
      kind: "lead" as const,
      title: `New lead: ${x.name}`,
      detail: x.source.replace("_", " "),
      business: dealer,
      businessId: x.dealerId,
    })),
    ...o.map(({ o: x, dealer }) => ({
      at: x.createdAt.toISOString(),
      kind: "order" as const,
      title: `Order ${x.code} · ₹${x.total.toLocaleString("en-IN")}`,
      detail: `${x.customerName} · ${x.fulfilment.replace("_", " ")}`,
      business: dealer,
      businessId: x.dealerId,
    })),
    ...b.map(({ b: x, dealer }) => ({
      at: x.createdAt.toISOString(),
      kind: "booking" as const,
      title: `Booking paid · ₹${x.amount.toLocaleString("en-IN")}`,
      detail: x.buyerName,
      business: dealer,
      businessId: x.dealerId,
    })),
    ...r.map(({ r: x, dealer }) => ({
      at: x.createdAt.toISOString(),
      kind: "review" as const,
      title: `${x.rating}★ review from ${x.name}`,
      detail: x.comment.slice(0, 80),
      business: dealer,
      businessId: x.dealerId,
    })),
    ...e.map(({ e: x, dealer }) => ({
      at: x.createdAt.toISOString(),
      kind: "enquiry" as const,
      title: `Enquiry from ${x.name}`,
      detail: x.message.slice(0, 80),
      business: dealer,
      businessId: x.dealerId,
    })),
  ]
  return items.sort((a, b2) => b2.at.localeCompare(a.at)).slice(0, limit)
}

export type SearchResults = {
  businesses: { id: string; name: string; sub: string }[]
  users: { id: string; name: string; sub: string; businessId: string }[]
  orders: { id: string; name: string; sub: string; businessId: string }[]
  cars: { id: string; name: string; sub: string; businessId: string }[]
}

export async function searchPlatform(q: string): Promise<SearchResults> {
  await requireSuperAdmin()
  const term = q.trim().slice(0, 80)
  if (term.length < 2)
    return { businesses: [], users: [], orders: [], cars: [] }
  const like = `%${term.replace(/[%_]/g, "")}%`
  const [b, u, o, c] = await Promise.all([
    db
      .select()
      .from(dealers)
      .where(
        or(
          ilike(dealers.displayName, like),
          ilike(dealers.slug, like),
          ilike(dealers.phone, like),
          ilike(dealers.city, like)
        )
      )
      .limit(10),
    db
      .select({ u: users, dealerId: dealers.id, dealer: dealers.displayName })
      .from(users)
      .leftJoin(sql`dealer_users du`, sql`du.user_id = ${users.id}`)
      .leftJoin(dealers, sql`${dealers.id} = du.dealer_id`)
      .where(
        or(
          ilike(users.email, like),
          ilike(users.name, like),
          ilike(users.phone, like)
        )
      )
      .limit(10),
    db
      .select({ o: orders, dealer: dealers.displayName })
      .from(orders)
      .innerJoin(dealers, eq(dealers.id, orders.dealerId))
      .where(
        or(
          ilike(orders.code, like),
          ilike(orders.customerName, like),
          ilike(orders.customerPhone, like)
        )
      )
      .limit(10),
    db
      .select({
        car: cars,
        make: variants.make,
        model: variants.model,
        dealer: dealers.displayName,
      })
      .from(cars)
      .innerJoin(dealers, eq(dealers.id, cars.dealerId))
      .leftJoin(variants, eq(variants.id, cars.variantId))
      .where(
        or(
          ilike(variants.make, like),
          ilike(variants.model, like),
          ilike(cars.slug, like),
          ilike(cars.shortCode, like)
        )
      )
      .limit(10),
  ])
  return {
    businesses: b.map((x) => ({
      id: x.id,
      name: x.displayName,
      sub: `${x.industry} · ${x.city} · ${x.slug}`,
    })),
    users: u.map(({ u: x, dealerId, dealer }) => ({
      id: x.id,
      name: x.name || x.email || x.phone || "User",
      sub: [x.email, dealer].filter(Boolean).join(" · "),
      businessId: dealerId ?? "",
    })),
    orders: o.map(({ o: x, dealer }) => ({
      id: x.id,
      name: `${x.code} · ₹${x.total.toLocaleString("en-IN")}`,
      sub: `${x.customerName} · ${dealer}`,
      businessId: x.dealerId,
    })),
    cars: c.map(({ car, make, model, dealer }) => ({
      id: car.id,
      name: [car.year, make, model].filter(Boolean).join(" ") || car.slug,
      sub: `${car.status} · ${dealer}`,
      businessId: car.dealerId,
    })),
  }
}

// ---------- system ----------

export type SystemHealth = {
  dbMs: number | null
  counts: { label: string; count: number }[]
}

/** A quick read of the database: how long a query takes and how big each table is. */
export async function loadSystemHealth(): Promise<SystemHealth> {
  await requireSuperAdmin()
  const t0 = Date.now()
  let dbMs: number | null = null
  try {
    await db.execute(sql`select 1`)
    dbMs = Date.now() - t0
  } catch {
    dbMs = null
  }
  const tables = [
    ["Businesses", dealers],
    ["Users", users],
    ["Cars", cars],
    ["Leads", leads],
    ["Bookings", bookings],
    ["Orders", orders],
    ["Menu items", menuItems],
    ["Reviews", reviews],
    ["Coupons", coupons],
    ["Delivery riders", deliveryPartners],
  ] as const
  const counts = await Promise.all(
    tables.map(async ([label, t]) => ({
      label,
      count: ((await db.select({ n: count() }).from(t as never)) as { n: number }[])[0]?.n ?? 0,
    }))
  )
  return { dbMs, counts }
}
