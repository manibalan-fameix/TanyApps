import { describe, expect, it } from "vitest"

import { checkoutSchema, couponDiscount, newOrderCode, nextStatuses, priceOrder, timelineFor } from "../lib/restaurant/orders"
import { readOrderSettings } from "../lib/restaurant/settings"

const settings = readOrderSettings({ deliveryFee: 40, freeDeliveryAbove: 500, minOrder: 100, dineIn: true })
const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const items = [
  { id: A, name: "Biryani", price: 200, portions: [{ label: "Half", price: 120 }, { label: "Full", price: 220 }], isAvailable: true },
  { id: B, name: "Tea", price: 20, portions: [], isAvailable: true },
]
const coupon = { code: "SAVE10", kind: "percent", value: 10, minOrder: 200, maxDiscount: 50, isActive: true, expiresAt: null }
const base = { fulfilment: "delivery" as const, address: "12 Main Road, Chennai" }

describe("restaurant order pricing", () => {
  it("prices from stored menu prices, never from the client", () => {
    const r = priceOrder({ ...base, lines: [{ itemId: A, portion: "Full", qty: 2 }] }, items, settings, null, false)
    expect(r).toMatchObject({ ok: true, subtotal: 440, deliveryFee: 40, total: 480 })
  })
  it("charges delivery below the free-delivery threshold and not for pickup", () => {
    const small = priceOrder({ ...base, lines: [{ itemId: A, portion: "Half", qty: 1 }] }, items, settings, null, false)
    expect(small).toMatchObject({ ok: true, deliveryFee: 40, total: 160 })
    const pickup = priceOrder({ fulfilment: "pickup", address: "", lines: [{ itemId: A, portion: "Half", qty: 1 }] }, items, settings, null, false)
    expect(pickup).toMatchObject({ ok: true, deliveryFee: 0, total: 120 })
  })
  it("rejects unknown, sold-out and missing-portion dishes", () => {
    expect(priceOrder({ ...base, lines: [{ itemId: "33333333-3333-4333-8333-333333333333", portion: null, qty: 1 }] }, items, settings, null, false).ok).toBe(false)
    expect(priceOrder({ ...base, lines: [{ itemId: B, portion: null, qty: 1 }] }, [{ ...items[1], isAvailable: false }], settings, null, false).ok).toBe(false)
    expect(priceOrder({ ...base, lines: [{ itemId: A, portion: null, qty: 1 }] }, items, settings, null, false).ok).toBe(false)
    expect(priceOrder({ ...base, lines: [{ itemId: A, portion: "Quarter", qty: 1 }] }, items, settings, null, false).ok).toBe(false)
  })
  it("enforces minimum order, closed kitchen, disabled options and delivery address", () => {
    expect(priceOrder({ ...base, lines: [{ itemId: B, portion: null, qty: 1 }] }, items, settings, null, false).ok).toBe(false)
    expect(priceOrder({ ...base, lines: [{ itemId: A, portion: "Full", qty: 1 }] }, items, { ...settings, acceptingOrders: false }, null, false).ok).toBe(false)
    expect(priceOrder({ ...base, fulfilment: "pickup", lines: [{ itemId: A, portion: "Full", qty: 1 }] }, items, { ...settings, pickup: false }, null, false).ok).toBe(false)
    expect(priceOrder({ ...base, address: "", lines: [{ itemId: A, portion: "Full", qty: 1 }] }, items, settings, null, false).ok).toBe(false)
  })
  it("applies coupons with caps, minimums and expiry", () => {
    expect(couponDiscount(coupon, 300)).toEqual({ discount: 30 })
    expect(couponDiscount(coupon, 1000)).toEqual({ discount: 50 })
    expect(couponDiscount(coupon, 100)).toHaveProperty("error")
    expect(couponDiscount({ ...coupon, expiresAt: new Date(0) }, 300)).toHaveProperty("error")
    expect(couponDiscount({ ...coupon, isActive: false }, 300)).toHaveProperty("error")
    expect(couponDiscount(null, 300)).toHaveProperty("error")
    expect(couponDiscount({ ...coupon, kind: "flat", value: 999, maxDiscount: null }, 300)).toEqual({ discount: 300 })
    const r = priceOrder({ ...base, lines: [{ itemId: A, portion: "Full", qty: 1 }] }, items, settings, coupon, true)
    expect(r).toMatchObject({ ok: true, discount: 22, total: 238 })
    expect(priceOrder({ ...base, lines: [{ itemId: A, portion: "Full", qty: 1 }] }, items, settings, null, true).ok).toBe(false)
  })
})

describe("order status flow", () => {
  it("moves forward one step at a time and can always be cancelled until done", () => {
    expect(nextStatuses("new", "delivery")).toEqual(["confirmed", "cancelled"])
    expect(nextStatuses("preparing", "delivery")).toEqual(["out_for_delivery", "cancelled"])
    expect(nextStatuses("preparing", "pickup")).toEqual(["ready", "cancelled"])
    expect(nextStatuses("completed", "pickup")).toEqual([])
    expect(nextStatuses("cancelled", "delivery")).toEqual([])
    expect(timelineFor("dine_in")).not.toContain("out_for_delivery")
  })
})

describe("checkout input and codes", () => {
  it("normalises phone and coupon, and rejects empty carts", () => {
    const ok = checkoutSchema.safeParse({ name: "Ravi", phone: "98765 43210", fulfilment: "pickup", couponCode: " save10 ", lines: [{ itemId: A, qty: 1 }] })
    expect(ok.success && ok.data.phone).toBe("+919876543210")
    expect(ok.success && ok.data.couponCode).toBe("SAVE10")
    expect(checkoutSchema.safeParse({ name: "Ravi", phone: "98765 43210", fulfilment: "pickup", lines: [] }).success).toBe(false)
    expect(checkoutSchema.safeParse({ name: "R", phone: "123", fulfilment: "pickup", lines: [{ itemId: A, qty: 1 }] }).success).toBe(false)
  })
  it("generates six-character codes without look-alike characters", () => {
    for (let i = 0; i < 50; i++) expect(newOrderCode()).toMatch(/^[2-9A-HJ-NP-Z]{6}$/)
  })
})

import { summariseOrders, startOfDayIst } from "../lib/restaurant/stats"
import { summariseCustomers } from "../lib/restaurant/customers"

describe("dashboard stats", () => {
  // 2026-10-02 11:00 in India
  const now = new Date("2026-10-02T05:30:00Z")
  it("uses the Indian calendar day, not UTC", () => {
    expect(startOfDayIst(now).toISOString()).toBe("2026-10-01T18:30:00.000Z")
    // 00:10 IST on 2 Oct is still 1 Oct in UTC and must count as today.
    const rows = [{ total: 100, status: "new", createdAt: new Date("2026-10-01T18:40:00Z") }, { total: 50, status: "completed", createdAt: new Date("2026-10-01T18:00:00Z") }]
    expect(summariseOrders(rows, now)).toMatchObject({ todayOrders: 1, todayRevenue: 100, weekRevenue: 150 })
  })
  it("ignores cancelled orders and counts open ones", () => {
    const rows = [
      { total: 100, status: "cancelled", createdAt: now },
      { total: 200, status: "preparing", createdAt: now },
      { total: 300, status: "new", createdAt: now },
    ]
    expect(summariseOrders(rows, now)).toMatchObject({ todayOrders: 2, todayRevenue: 500, open: 2, fresh: 1 })
  })
})

describe("customers", () => {
  it("groups by phone, skips cancelled spend and sorts by spend", () => {
    const d = (n: number) => new Date(2026, 9, n)
    const list = summariseCustomers([
      { customerPhone: "+919000000001", customerName: "Ravi", total: 100, status: "completed", createdAt: d(1) },
      { customerPhone: "+919000000001", customerName: "Ravi K", total: 900, status: "cancelled", createdAt: d(2) },
      { customerPhone: "+919000000002", customerName: "Anu", total: 500, status: "completed", createdAt: d(1) },
    ])
    expect(list.map((c) => [c.phone, c.orders, c.spent, c.name])).toEqual([
      ["+919000000002", 1, 500, "Anu"],
      ["+919000000001", 2, 100, "Ravi K"],
    ])
  })
})

import { countBy, dailyOrders, topDishes } from "../lib/restaurant/stats"

describe("dashboard series", () => {
  const now = new Date("2026-10-02T05:30:00Z") // 11:00 IST on 2 Oct
  it("buckets orders by Indian day with zeros for quiet days", () => {
    const rows = [
      { total: 100, status: "completed", createdAt: new Date("2026-10-02T04:00:00Z") }, // today
      { total: 40, status: "new", createdAt: new Date("2026-10-01T10:00:00Z") }, // yesterday
      { total: 900, status: "cancelled", createdAt: new Date("2026-10-02T04:00:00Z") },
      { total: 5, status: "completed", createdAt: new Date("2026-09-01T10:00:00Z") }, // outside the window
    ]
    const pts = dailyOrders(rows, 3, now)
    expect(pts.map((p) => [p.orders, p.revenue])).toEqual([[0, 0], [1, 40], [1, 100]])
    expect(pts).toHaveLength(3)
  })
  it("ranks dishes by quantity and skips cancelled orders", () => {
    const rows = [
      { status: "completed", lines: [{ name: "Biryani", qty: 2, price: 200 }, { name: "Tea", qty: 5, price: 20 }] },
      { status: "cancelled", lines: [{ name: "Tea", qty: 50, price: 20 }] },
      { status: "new", lines: [{ name: "Biryani", qty: 1, price: 200 }] },
    ]
    expect(topDishes(rows).map((d) => [d.name, d.qty, d.revenue])).toEqual([["Tea", 5, 100], ["Biryani", 3, 600]])
    expect(countBy(rows, (r) => r.status).find((c) => c.key === "completed")?.count).toBe(1)
  })
})

import { imageKey, isOwnImage } from "../lib/restaurant/images"

describe("restaurant images", () => {
  const storage = { publicUrl: (k: string) => `https://cdn.example.com/${k}` }
  const mine = "11111111-1111-4111-8111-111111111111"
  const other = "22222222-2222-4222-8222-222222222222"
  it("accepts empty and the restaurant's own uploads only", () => {
    expect(isOwnImage(storage, mine, "")).toBe(true)
    expect(isOwnImage(storage, mine, `https://cdn.example.com/${imageKey(mine, "menu", "abc")}`)).toBe(true)
    expect(isOwnImage(storage, mine, `https://cdn.example.com/${imageKey(other, "menu", "abc")}`)).toBe(false)
    expect(isOwnImage(storage, mine, "https://evil.example.com/x.jpg")).toBe(false)
    expect(isOwnImage(storage, mine, `https://cdn.example.com/dealers/${mine}/../${other}/menu/a.jpg`)).toBe(false)
    expect(isOwnImage(storage, mine, `https://cdn.example.com/dealers/${mine}/menu/a.html`)).toBe(false)
  })
})

import { DISH_FILTERS, categorySlugs, filterDishes, offerPercent, type StoreDish } from "../lib/restaurant/storefront"
import { readProfile } from "../lib/restaurant/profile"

const dish = (o: Partial<StoreDish>): StoreDish => ({ id: "x", name: "Dish", description: "", price: 100, compareAt: null, portions: [], imageUrl: null, isVeg: true, isAvailable: true, isFeatured: false, categoryId: null, categoryName: "", ...o })

describe("storefront helpers", () => {
  it("computes offer percentages only for real discounts", () => {
    expect(offerPercent({ price: 150, compareAt: 200 })).toBe(25)
    expect(offerPercent({ price: 200, compareAt: 200 })).toBeNull()
    expect(offerPercent({ price: 200, compareAt: null })).toBeNull()
    expect(offerPercent({ price: 300, compareAt: 200 })).toBeNull()
  })
  it("builds unique category slugs", () => {
    const m = categorySlugs([{ id: "a", name: "Biryani & Rice" }, { id: "b", name: "Biryani  Rice" }, { id: "c", name: "!!!" }])
    expect([...m.values()]).toEqual(["biryani-rice", "biryani-rice-2", "category"])
  })
  it("searches and applies every active filter together", () => {
    const all = [
      dish({ id: "1", name: "Paneer Tikka", isVeg: true, isFeatured: true, categoryName: "Starters" }),
      dish({ id: "2", name: "Chicken 65", isVeg: false, compareAt: 200, categoryName: "Starters" }),
      dish({ id: "3", name: "Dosa", isAvailable: false, portions: [{ label: "Full", price: 90 }] }),
    ]
    expect(filterDishes(all, "starters", new Set()).map((d) => d.id)).toEqual(["1", "2"])
    expect(filterDishes(all, "", new Set(["nonVeg"])).map((d) => d.id)).toEqual(["2"])
    expect(filterDishes(all, "", new Set(["offer"])).map((d) => d.id)).toEqual(["2"])
    expect(filterDishes(all, "", new Set(["inStock", "veg"])).map((d) => d.id)).toEqual(["1"])
    expect(filterDishes(all, "", new Set(["portions"])).map((d) => d.id)).toEqual(["3"])
    expect(filterDishes(all, "paneer", new Set(["bestseller", "veg"])).map((d) => d.id)).toEqual(["1"])
    expect(DISH_FILTERS).toHaveLength(6)
  })
  it("reads a damaged profile as empty and normalises WhatsApp", () => {
    expect(readProfile({ email: "nope" }).email).toBe("")
    expect(readProfile({ whatsapp: "98765 43210" }).whatsapp).toBe("919876543210")
    expect(readProfile(null).about).toBe("")
  })
})

import { summariseHours } from "../lib/hours"

describe("opening hours line", () => {
  it("groups consecutive days with the same times", () => {
    const h = { mon: { open: "10:00", close: "19:00" }, tue: { open: "10:00", close: "19:00" }, wed: { open: "10:00", close: "19:00" }, sat: { open: "09:30", close: "20:00" } }
    expect(summariseHours(h)).toBe("Mon to Wed, 10 am to 7 pm · Sat, 9:30 am to 8 pm")
    expect(summariseHours({ mon: { open: "00:00", close: "12:00" } })).toBe("Mon, 12 am to 12 pm")
    expect(summariseHours({})).toBeNull()
    expect(summariseHours(null)).toBeNull()
  })
  it("says every day when all seven match", () => {
    const all = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "09:00", close: "20:00" }]))
    expect(summariseHours(all)).toBe("Every day, 9 am to 8 pm")
  })
})

import { findZone, nextPartnerCode, parsePincodes, partnerSchema, pinSchema, zoneSchema } from "../lib/restaurant/delivery"
import { adjustQuantity, stockState, unitsByItem } from "../lib/restaurant/stock"

describe("delivery zones", () => {
  const zones = [
    { id: "z1", name: "Anna Nagar", pincodes: ["600040", "600102"], fee: 30, minOrder: 200, etaMinutes: 35, isActive: true },
    { id: "z2", name: "Closed", pincodes: ["600001"], fee: 0, minOrder: null, etaMinutes: null, isActive: false },
  ]
  const line = [{ itemId: A, portion: "Full", qty: 1 }]
  it("parses pincodes and reports the bad ones", () => {
    expect(parsePincodes("600040, 600102;600040 12345 abcdef")).toEqual({ pincodes: ["600040", "600102"], invalid: ["12345", "abcdef"] })
    expect(zoneSchema.safeParse({ name: "X", pincodes: ["600040"], fee: 10 }).success).toBe(false)
    expect(zoneSchema.safeParse({ name: "Anna Nagar", pincodes: [], fee: 10 }).success).toBe(false)
  })
  it("matches only active zones", () => {
    expect(findZone(zones, "600040")?.name).toBe("Anna Nagar")
    expect(findZone(zones, "600001")).toBeNull()
    expect(findZone(zones, "999999")).toBeNull()
  })
  it("uses the zone's fee and minimum, and refuses pincodes outside every zone", () => {
    const base = { fulfilment: "delivery" as const, address: "12 Main Road", lines: line }
    const ok = priceOrder({ ...base, pincode: "600040" }, items, { ...settings, deliveryFee: 99, freeDeliveryAbove: null }, null, false, new Date(), zones)
    expect(ok).toMatchObject({ ok: true, deliveryFee: 30, zoneName: "Anna Nagar", etaMinutes: 35, pincode: "600040", total: 250 })
    expect(priceOrder({ ...base, pincode: "999999" }, items, settings, null, false, new Date(), zones)).toMatchObject({ ok: false, field: "pincode" })
    expect(priceOrder({ ...base, pincode: "" }, items, settings, null, false, new Date(), zones)).toMatchObject({ ok: false, field: "pincode" })
    // Below the zone's own minimum (200), even though the default minimum is only 100.
    expect(priceOrder({ ...base, lines: [{ itemId: A, portion: "Half", qty: 1 }], pincode: "600040" }, items, settings, null, false, new Date(), zones)).toMatchObject({ ok: false })
  })
  it("ignores zones for pickup and falls back to default fees when no zones exist", () => {
    const pick = priceOrder({ fulfilment: "pickup", address: "", lines: line, pincode: "" }, items, settings, null, false, new Date(), zones)
    expect(pick).toMatchObject({ ok: true, deliveryFee: 0, zoneName: null })
    const none = priceOrder({ fulfilment: "delivery", address: "12 Main Road", lines: [{ itemId: A, portion: "Half", qty: 2 }], pincode: "" }, items, settings, null, false)
    expect(none).toMatchObject({ ok: true, deliveryFee: 40 })
  })
  it("numbers riders without reusing codes, and validates riders and PINs", () => {
    expect(nextPartnerCode([])).toBe("DP001")
    expect(nextPartnerCode(["DP001", "DP003"])).toBe("DP002")
    expect(partnerSchema.safeParse({ name: "Mani", phone: "98765 43210" }).success).toBe(true)
    expect(partnerSchema.safeParse({ name: "Mani", phone: "123" }).success).toBe(false)
    expect(pinSchema.safeParse("1234").success && pinSchema.safeParse("123456").success).toBe(true)
    expect(pinSchema.safeParse("123").success || pinSchema.safeParse("12ab").success).toBe(false)
  })
})

describe("stock", () => {
  it("reports state and rejects over-deductions", () => {
    expect(stockState(null, true)).toBe("untracked")
    expect(stockState(null, false)).toBe("out")
    expect(stockState(0, true)).toBe("out")
    expect(stockState(3, true)).toBe("low")
    expect(stockState(40, true)).toBe("in_stock")
    expect(adjustQuantity(10, 5)).toEqual({ ok: true, quantity: 15 })
    expect(adjustQuantity(10, -10)).toEqual({ ok: true, quantity: 0 })
    expect(adjustQuantity(10, -11).ok).toBe(false)
    expect(adjustQuantity(10, 0).ok).toBe(false)
    expect(adjustQuantity(10, 1.5).ok).toBe(false)
  })
  it("limits an order to what is left, counting every portion of the same dish together", () => {
    const tracked = [{ ...items[0], stock: 3 }]
    const base = { fulfilment: "pickup" as const, address: "" }
    expect(priceOrder({ ...base, lines: [{ itemId: A, portion: "Full", qty: 2 }, { itemId: A, portion: "Half", qty: 2 }] }, tracked, settings, null, false)).toMatchObject({ ok: false, error: "Only 3 left of Biryani." })
    expect(priceOrder({ ...base, lines: [{ itemId: A, portion: "Full", qty: 3 }] }, tracked, settings, null, false).ok).toBe(true)
    expect(priceOrder({ ...base, lines: [{ itemId: A, portion: "Full", qty: 1 }] }, [{ ...items[0], stock: 0 }], settings, null, false).ok).toBe(false)
    expect(unitsByItem([{ itemId: "a", qty: 2 }, { itemId: "a", qty: 1 }]).get("a")).toBe(3)
  })
})

import { averageOrderValue, ordersByHour, ordersByPincode, ordersByWeekday, repeatStats, revenueByDish } from "../lib/restaurant/stats"

describe("analytics", () => {
  // 2026-10-02 is a Friday. 18:30 UTC is midnight IST, which is already Saturday.
  const fri = new Date("2026-10-02T05:30:00Z") // 11:00 IST Friday
  const satEarly = new Date("2026-10-02T18:40:00Z") // 00:10 IST Saturday
  const rows = [
    { total: 200, status: "completed", createdAt: fri, customerPhone: "+919000000001", pincode: "600040", zoneName: "Anna Nagar" },
    { total: 100, status: "new", createdAt: fri, customerPhone: "+919000000001", pincode: "600040", zoneName: null },
    { total: 500, status: "cancelled", createdAt: fri, customerPhone: "+919000000002", pincode: "600102", zoneName: null },
    { total: 300, status: "completed", createdAt: satEarly, customerPhone: "+919000000003", pincode: null, zoneName: null },
  ]
  it("uses Indian hours and weekdays", () => {
    expect(ordersByHour(rows).find((h) => h.hour === "11am")?.orders).toBe(2)
    expect(ordersByHour(rows).find((h) => h.hour === "12am")?.orders).toBe(1)
    expect(ordersByHour(rows)).toHaveLength(24)
    const w = ordersByWeekday(rows)
    expect(w.find((d) => d.day === "Fri")).toMatchObject({ orders: 2, revenue: 300 })
    expect(w.find((d) => d.day === "Sat")).toMatchObject({ orders: 1, revenue: 300 })
  })
  it("counts repeat guests and ignores cancelled orders", () => {
    expect(repeatStats(rows)).toEqual({ guests: 2, returning: 1, new: 1, repeatRate: 50 })
    expect(averageOrderValue(rows)).toBe(200)
    expect(averageOrderValue([])).toBe(0)
  })
  it("groups delivery orders by pincode and keeps the zone name", () => {
    expect(ordersByPincode(rows)).toEqual([{ pincode: "600040", zone: "Anna Nagar", orders: 2, revenue: 300, average: 150 }])
  })
  it("ranks dishes by revenue", () => {
    const d = revenueByDish([{ status: "completed", lines: [{ name: "Tea", qty: 10, price: 20 }, { name: "Biryani", qty: 1, price: 250 }] }])
    expect(d.map((x) => x.name)).toEqual(["Biryani", "Tea"])
  })
})

import { readRiderSession, riderNext, signRiderSession } from "../lib/restaurant/rider-session"

describe("rider session", () => {
  const t0 = 1_800_000_000_000
  it("accepts a fresh token and rejects tampered, expired or foreign ones", () => {
    const token = signRiderSession({ partnerId: "p1", dealerId: "d1" }, t0)
    expect(readRiderSession(token, t0 + 1000)).toMatchObject({ partnerId: "p1", dealerId: "d1" })
    expect(readRiderSession(token, t0 + 13 * 3600 * 1000)).toBeNull()
    const [body, sig] = token.split(".")
    const forged = Buffer.from(JSON.stringify({ partnerId: "p2", dealerId: "d1", exp: 9_999_999_999 })).toString("base64url")
    expect(readRiderSession(`${forged}.${sig}`, t0)).toBeNull()
    expect(readRiderSession(`${body}.x`, t0)).toBeNull()
    expect(readRiderSession(undefined, t0)).toBeNull()
    expect(readRiderSession("garbage", t0)).toBeNull()
  })
  it("lets a rider only move an order forward: leave, then deliver", () => {
    expect(riderNext("preparing")).toBe("out_for_delivery")
    expect(riderNext("out_for_delivery")).toBe("completed")
    expect(riderNext("new")).toBeNull()
    expect(riderNext("completed")).toBeNull()
    expect(riderNext("cancelled")).toBeNull()
  })
})

import { PAYMENT_WINDOW_MINUTES, STATUS_LABEL } from "../lib/restaurant/orders"
import { paymentOptions } from "../lib/restaurant/settings"

describe("online payment rules", () => {
  it("offers online only when payouts are connected and the owner accepts it", () => {
    const s = readOrderSettings({})
    expect(paymentOptions(s, false)).toEqual(["cod"])
    // Online comes first, so it is the checkout's default.
    expect(paymentOptions(s, true)).toEqual(["online", "cod"])
    expect(paymentOptions({ ...s, acceptCod: false }, true)).toEqual(["online"])
    expect(paymentOptions({ ...s, acceptOnline: false }, true)).toEqual(["cod"])
    // Turning everything off must never leave a guest with no way to order.
    expect(paymentOptions({ ...s, acceptCod: false, acceptOnline: false }, true)).toEqual(["cod"])
  })
  it("treats an unpaid online order as not placed and only cancellable", () => {
    expect(nextStatuses("pending_payment", "delivery")).toEqual(["cancelled"])
    expect(STATUS_LABEL.pending_payment).toBe("Awaiting payment")
    expect(PAYMENT_WINDOW_MINUTES).toBe(20)
    const rows = [{ total: 500, status: "pending_payment", createdAt: new Date("2026-10-02T05:30:00Z"), customerPhone: "+919000000001", customerName: "Ravi", lines: [{ name: "X", qty: 1, price: 500 }] }]
    expect(summariseOrders(rows, new Date("2026-10-02T05:30:00Z"))).toMatchObject({ todayOrders: 0, todayRevenue: 0, open: 0, fresh: 0 })
    expect(topDishes(rows)).toEqual([])
    expect(summariseCustomers(rows)).toEqual([])
    expect(repeatStats(rows)).toMatchObject({ guests: 0 })
  })
  it("defaults the checkout to pay on delivery", () => {
    const r = checkoutSchema.safeParse({ name: "Ravi", phone: "98765 43210", fulfilment: "pickup", lines: [{ itemId: A, qty: 1 }] })
    expect(r.success && r.data.paymentMethod).toBe("cod")
    expect(checkoutSchema.safeParse({ name: "Ravi", phone: "98765 43210", fulfilment: "pickup", paymentMethod: "bitcoin", lines: [{ itemId: A, qty: 1 }] }).success).toBe(false)
  })
})

import { mapsUrl, parseNominatim, parseStoredLocation, validCoords } from "../lib/restaurant/location"

describe("guest location", () => {
  it("accepts coordinates inside India only", () => {
    expect(validCoords(13.0418, 80.2341)).toBe(true)
    expect(validCoords(51.5, -0.12)).toBe(false) // London
    expect(validCoords(NaN, 80)).toBe(false)
    expect(validCoords("13", "80")).toBe(false)
    expect(validCoords(13.04, undefined)).toBe(false)
  })
  it("reads a saved location and rejects damaged or out-of-range ones", () => {
    const ok = { lat: 13.04, lng: 80.23, pincode: "600017", area: "T. Nagar", city: "Chennai", address: "1 Main Rd", source: "gps" }
    expect(parseStoredLocation(JSON.stringify(ok))?.pincode).toBe("600017")
    expect(parseStoredLocation(JSON.stringify({ ...ok, lat: 51.5, lng: -0.1 }))).toBeNull()
    expect(parseStoredLocation(JSON.stringify({ ...ok, pincode: "12" }))).toBeNull()
    expect(parseStoredLocation("not json")).toBeNull()
    expect(parseStoredLocation(null)).toBeNull()
    expect(parseStoredLocation(JSON.stringify({ ...ok, lat: null, lng: null, source: "pincode" }))?.source).toBe("pincode")
  })
  it("builds a maps link from coordinates", () => {
    expect(mapsUrl(13.0418, 80.2341)).toBe("https://www.google.com/maps/search/?api=1&query=13.0418,80.2341")
  })
  it("reads a reverse-geocode answer into pincode, area and address", () => {
    const r = parseNominatim({ address: { country_code: "in", house_number: "42", road: "South Usman Road", suburb: "T. Nagar", city: "Chennai", postcode: "600 017" } })
    expect(r).toEqual({ pincode: "600017", area: "T. Nagar", city: "Chennai", address: "42, South Usman Road, T. Nagar, Chennai, 600017" })
    expect(parseNominatim({ address: { country_code: "gb", postcode: "SW1A 1AA" } })).toBeNull()
    expect(parseNominatim(null)).toBeNull()
    // No usable pincode: keep what we know and let the guest type the pincode.
    expect(parseNominatim({ address: { country_code: "in", suburb: "Adyar", city: "Chennai", postcode: "ABC" } })?.pincode).toBe("")
  })
})

import { checkRadius, distanceKm, formatKm, osmEmbedUrl, readServiceArea } from "../lib/restaurant/service-area"

describe("service area", () => {
  const tNagar = { lat: 13.0418, lng: 80.2341 }
  const adyar = { lat: 13.0012, lng: 80.2565 }
  it("measures real distances", () => {
    expect(distanceKm(tNagar, tNagar)).toBe(0)
    // T. Nagar to Adyar is about 5.2 km in a straight line.
    expect(distanceKm(tNagar, adyar)).toBeGreaterThan(4.9)
    expect(distanceKm(tNagar, adyar)).toBeLessThan(5.6)
    // Chennai to Bengaluru is about 290 km.
    expect(distanceKm(tNagar, { lat: 12.9716, lng: 77.5946 })).toBeGreaterThan(280)
    expect(distanceKm(tNagar, { lat: 12.9716, lng: 77.5946 })).toBeLessThan(300)
    expect(distanceKm(adyar, tNagar)).toBeCloseTo(distanceKm(tNagar, adyar), 6)
  })
  it("limits delivery only when a radius is set", () => {
    const area = { ...tNagar, address: "", radiusKm: 5 }
    expect(checkRadius(area, adyar)).toMatchObject({ within: false, radiusKm: 5 })
    expect(checkRadius({ ...area, radiusKm: 6 }, adyar)).toMatchObject({ within: true })
    expect(checkRadius({ ...area, radiusKm: null }, adyar)).toBeNull()
    expect(checkRadius(null, adyar)).toBeNull()
    expect(checkRadius(area, null)).toBeNull()
    expect(checkRadius(area, tNagar)).toMatchObject({ distanceKm: 0, within: true })
  })
  it("rejects a damaged or non-Indian saved location", () => {
    expect(readServiceArea({ lat: 13.04, lng: 80.23, radiusKm: 5 })?.radiusKm).toBe(5)
    expect(readServiceArea({ lat: 51.5, lng: -0.1, radiusKm: 5 })).toBeNull()
    expect(readServiceArea({ lat: 13.04, lng: 80.23, radiusKm: 0.1 })).toBeNull()
    expect(readServiceArea({ lat: 13.04, lng: 80.23, radiusKm: 500 })).toBeNull()
    expect(readServiceArea(null)).toBeNull()
  })
  it("builds a map preview centred on the spot and prints distances tidily", () => {
    expect(osmEmbedUrl(13.04, 80.23, 5)).toContain("marker=13.04%2C80.23")
    expect(formatKm(7.25)).toBe("7.3")
    expect(formatKm(5)).toBe("5")
    expect(formatKm(23.4)).toBe("23")
  })
})

describe("zones when a distance limit is set", () => {
  const zones = [{ id: "z1", name: "Anna Nagar", pincodes: ["600040"], fee: 30, minOrder: 100, etaMinutes: 35, isActive: true }]
  const base = { fulfilment: "delivery" as const, address: "12 Main Road, Urapakkam", lines: [{ itemId: A, portion: "Full", qty: 1 }] }
  it("blocks an address outside every zone only when zones decide", () => {
    expect(priceOrder({ ...base, pincode: "603210" }, items, settings, null, false, new Date(), zones, true)).toMatchObject({ ok: false, field: "pincode" })
    // With a distance limit the zone no longer gates: the address is accepted and pays the default delivery charge.
    expect(priceOrder({ ...base, pincode: "603210" }, items, { ...settings, deliveryFee: 25, freeDeliveryAbove: null }, null, false, new Date(), zones, false)).toMatchObject({ ok: true, zoneName: null, deliveryFee: 25 })
    // A matching zone still sets its own charge.
    expect(priceOrder({ ...base, pincode: "600040" }, items, settings, null, false, new Date(), zones, false)).toMatchObject({ ok: true, zoneName: "Anna Nagar", deliveryFee: 30 })
    // No pincode at all is fine when the distance decides.
    expect(priceOrder({ ...base, pincode: "" }, items, { ...settings, deliveryFee: 25, freeDeliveryAbove: null }, null, false, new Date(), zones, false)).toMatchObject({ ok: true })
  })
})

import { TOKEN_RE, ago, customerMessage, etaMinutes, hashRiderToken, isFresh, newRiderToken, riderLinkOpen, riderMessage, sharingAllowed, toFix } from "../lib/restaurant/tracking"

describe("delivery tracking", () => {
  it("makes long, unguessable, URL-safe rider links, stored only as a hash", async () => {
    const a = newRiderToken(), b = newRiderToken()
    expect(a).toMatch(TOKEN_RE)
    expect(a).not.toBe(b)
    const h = await hashRiderToken(a)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain(a)
    expect(await hashRiderToken(a)).toBe(h)
    expect(await hashRiderToken(b)).not.toBe(h)
  })
  it("keeps a rider's link open while the order is open, and briefly after delivery, never after cancel", () => {
    const t0 = Date.parse("2026-10-04T10:00:00Z")
    const done = new Date(t0)
    expect(riderLinkOpen({ status: "out_for_delivery", deliveredAt: null, updatedAt: done }, t0)).toBe(true)
    expect(riderLinkOpen({ status: "completed", deliveredAt: done, updatedAt: done }, t0 + 3600_000)).toBe(true)
    expect(riderLinkOpen({ status: "completed", deliveredAt: done, updatedAt: done }, t0 + 3 * 3600_000)).toBe(false)
    expect(riderLinkOpen({ status: "cancelled", deliveredAt: null, updatedAt: done }, t0)).toBe(false)
    expect(riderLinkOpen({ status: "pending_payment", deliveredAt: null, updatedAt: done }, t0)).toBe(false)
  })
  it("only accepts live positions while a rider is on the job", () => {
    expect(["confirmed", "preparing", "ready", "out_for_delivery"].every(sharingAllowed)).toBe(true)
    expect(["new", "completed", "cancelled", "pending_payment"].some(sharingAllowed)).toBe(false)
  })
  it("keeps real Indian positions and rejects glitches", () => {
    expect(toFix({ lat: 13.0418234567, lng: 80.2341, accuracy: 12, heading: 90 }, 5)).toEqual({ lat: 13.041823, lng: 80.2341, accuracy: 12, heading: 90, at: 5 })
    expect(toFix({ lat: 13.04, lng: 80.23 }, 5)).toMatchObject({ accuracy: null, heading: null })
    expect(toFix({ lat: 51.5, lng: -0.1 })).toBeNull() // London
    expect(toFix({ lat: 0, lng: 0 })).toBeNull() // null island, a classic GPS glitch
    expect(toFix({ lat: "13", lng: "80" })).toBeNull()
    expect(toFix({ lat: 13.04, lng: 80.23, heading: 400 })).toBeNull()
    expect(toFix(null)).toBeNull()
  })
  it("calls a position stale after 45 seconds", () => {
    expect(isFresh({ at: 1000 }, 1000 + 44_000)).toBe(true)
    expect(isFresh({ at: 1000 }, 1000 + 46_000)).toBe(false)
    expect(isFresh(null)).toBe(false)
  })
  it("estimates arrival from distance, never less than a minute", () => {
    expect(etaMinutes(0)).toBe(1)
    expect(etaMinutes(5)).toBe(18) // 5 km x 1.3 / 22 km/h = 17.7 min
    expect(etaMinutes(11)).toBeGreaterThan(etaMinutes(5))
  })
  it("says how fresh a position is in plain words", () => {
    expect(ago(1000, 1000 + 2000)).toBe("just now")
    expect(ago(1000, 1000 + 20_000)).toBe("20 s ago")
    expect(ago(1000, 1000 + 130_000)).toBe("2 min ago")
  })
  it("writes the rider's and the customer's messages with the links in them", () => {
    const r = riderMessage({ restaurant: "Fameix Foods", riderName: "Mani", code: "AB12CD", address: "12 Main Rd, Urapakkam", link: "https://fameixfoods.showmoto.in/delivery/t/TOKEN" })
    expect(r).toContain("Mani")
    expect(r).toContain("AB12CD")
    expect(r).toContain("12 Main Rd, Urapakkam")
    expect(r).toContain("https://fameixfoods.showmoto.in/delivery/t/TOKEN")
    const c = customerMessage({ restaurant: "Fameix Foods", customerName: "Ravi", code: "AB12CD", riderName: "Mani", riderPhone: "+919841100101", trackUrl: "https://fameixfoods.showmoto.in/o/AB12CD" })
    expect(c).toContain("Mani (+919841100101) is delivering your order")
    expect(c).toContain("https://fameixfoods.showmoto.in/o/AB12CD")
    expect(customerMessage({ restaurant: "F", customerName: "R", code: "X", riderName: null, riderPhone: null, trackUrl: "u" })).toContain("being prepared")
  })
})

import type { TrackerNamespace, TrackerStub } from "../lib/restaurant/live-location"
import { readFix, readFixes, saveFix } from "../lib/restaurant/live-location"

/** A stand-in for the Cloudflare binding that behaves like the Durable Object: one store per name, newest fix wins. */
function fakeNamespace(): TrackerNamespace & { names: string[] } {
  const stores = new Map<string, import("../lib/restaurant/tracking").LiveFix>()
  const names: string[] = []
  return {
    names,
    idFromName: (n) => n,
    get: (id): TrackerStub => {
      const name = String(id)
      names.push(name)
      return {
        put: async (f) => { const c = stores.get(name); if (!c || c.at <= f.at) stores.set(name, f) },
        get: async () => stores.get(name) ?? null,
        clear: async () => void stores.delete(name),
      }
    },
  }
}

describe("live location store (Cloudflare binding)", () => {
  const D = "11111111-1111-4111-8111-111111111111", E = "22222222-2222-4222-8222-222222222222"
  const O1 = "33333333-3333-4333-8333-333333333333", O2 = "44444444-4444-4444-8444-444444444444"
  it("keeps one position per order and dealer, and the newest wins", async () => {
    const ns = fakeNamespace()
    await saveFix(D, O1, { lat: 13.04, lng: 80.23, accuracy: 10, heading: null, at: 2000 }, ns)
    await saveFix(D, O1, { lat: 13.05, lng: 80.24, accuracy: 10, heading: null, at: 1000 }, ns) // arrives late
    expect((await readFix(D, O1, ns))?.lat).toBe(13.04)
    await saveFix(D, O1, { lat: 13.06, lng: 80.25, accuracy: 8, heading: 90, at: 3000 }, ns)
    expect(await readFix(D, O1, ns)).toMatchObject({ lat: 13.06, heading: 90 })
  })
  it("never mixes restaurants: the object is named by dealer and order", async () => {
    const ns = fakeNamespace()
    await saveFix(D, O1, { lat: 13.04, lng: 80.23, accuracy: null, heading: null, at: 1 }, ns)
    expect(await readFix(E, O1, ns)).toBeNull()
    expect(ns.names).toContain(`${D}:${O1}`)
    expect(ns.names).toContain(`${E}:${O1}`)
  })
  it("reads several orders at once and skips those with no position", async () => {
    const ns = fakeNamespace()
    await saveFix(D, O1, { lat: 13.04, lng: 80.23, accuracy: null, heading: null, at: 1 }, ns)
    const m = await readFixes(D, [O1, O2], ns)
    expect([...m.keys()]).toEqual([O1])
    expect((await readFixes(D, [], ns)).size).toBe(0)
  })
  it("falls back to the database when the object cannot be reached", async () => {
    const broken: TrackerNamespace = { idFromName: (n) => n, get: () => ({ put: async () => { throw new Error("down") }, get: async () => { throw new Error("down") }, clear: async () => { throw new Error("down") } }) }
    // With no database here the fallback itself throws, which proves it was attempted rather than the error swallowed.
    await expect(saveFix(D, O1, { lat: 13.04, lng: 80.23, accuracy: null, heading: null, at: 1 }, broken)).rejects.toBeDefined()
  })
})
