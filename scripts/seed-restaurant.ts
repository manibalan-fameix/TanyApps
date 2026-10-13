// Demo data for a restaurant: 30 South Indian dishes with pictures, categories, banners, coupons, delivery zones,
// riders, ~130 orders over 45 days, reviews, enquiries and stock levels, so every admin page has something real in it.
//
// Run:  pnpm db:seed-restaurant            (fills the restaurant with slug "fameixfoods")
//       pnpm db:seed-restaurant my-slug    (any restaurant)
//
// Safe to run again. It only replaces rows it made itself (demo guests use phone numbers +91 90000 0xxxx, demo dishes
// and categories are matched by name), so a real dish, a real order or a real guest is never touched.
// Dish pictures are drawn here and uploaded through the app's storage (R2 when configured, local disk otherwise).
// They stand in until the owner uploads real photos. Uses Node's native TypeScript support, hence the explicit .ts imports.
import { eq, inArray, like } from "drizzle-orm"

import { hashPassword } from "../lib/auth/password.ts"
import { unscopedDb } from "../lib/db/client.ts"
import { scopedDb } from "../lib/db/scoped.ts"
import { getStorage } from "../lib/storage/index.ts"
import * as s from "../lib/db/schema/index.ts"

const { dealers, menuItems, orders, reviews } = s

const slug = process.argv[2] ?? "fameixfoods"
const [dealer] = await unscopedDb.select().from(dealers).where(eq(dealers.slug, slug)).limit(1)
if (!dealer) throw new Error(`No restaurant with slug "${slug}"`)
if (dealer.industry !== "restaurants") throw new Error(`"${slug}" is not a restaurant`)
const db = scopedDb(dealer.id)

// ---------- deterministic randomness, so a re-run builds the same history ----------
let seedState = 20261002
const rnd = () => {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296
  return seedState / 4294967296
}
const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]
const chance = (p: number) => rnd() < p
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))

// ---------- the menu ----------
type Dish = {
  name: string
  cat: string
  price: number
  desc: string
  veg: boolean
  emoji: string
  portions?: { label: string; price: number }[]
  was?: number
  best?: boolean
  stock?: number
  off?: boolean
}
const CATEGORIES = ["Tiffin & Breakfast", "Dosa Varieties", "Rice & Biryani", "Meals & Combos", "Chettinad Specials", "Starters", "Desserts", "Beverages"]
const TINT: Record<string, [string, string]> = {
  "Tiffin & Breakfast": ["#fff3d6", "#f7c873"],
  "Dosa Varieties": ["#ffe9c7", "#e9a24b"],
  "Rice & Biryani": ["#ffe3d3", "#e8845a"],
  "Meals & Combos": ["#e6f4dc", "#8fc069"],
  "Chettinad Specials": ["#fde0dc", "#d9534f"],
  Starters: ["#ffeccf", "#ef9a3a"],
  Desserts: ["#fbe4f0", "#e26fa6"],
  Beverages: ["#e1f0f8", "#6fb4d8"],
}
const DISHES: Dish[] = [
  { name: "Idli (Steamed Rice Cakes)", cat: "Tiffin & Breakfast", price: 40, desc: "Soft steamed idlis with sambar and two chutneys.", veg: true, emoji: "🍚", portions: [{ label: "2 pcs", price: 40 }, { label: "4 pcs", price: 75 }], best: true, stock: 80 },
  { name: "Medu Vada", cat: "Tiffin & Breakfast", price: 50, desc: "Crisp lentil doughnuts, golden outside and fluffy inside.", veg: true, emoji: "🧆", portions: [{ label: "2 pcs", price: 50 }, { label: "4 pcs", price: 95 }] },
  { name: "Ven Pongal", cat: "Tiffin & Breakfast", price: 70, desc: "Rice and moong dal cooked in ghee with pepper and cashews.", veg: true, emoji: "🥘", stock: 40 },
  { name: "Poori Masala", cat: "Tiffin & Breakfast", price: 80, desc: "Puffed pooris with a soft potato masala.", veg: true, emoji: "🫓" },
  { name: "Rava Upma", cat: "Tiffin & Breakfast", price: 60, desc: "Roasted semolina cooked with mustard, curry leaves and vegetables.", veg: true, emoji: "🍲" },
  { name: "Plain Dosa", cat: "Dosa Varieties", price: 60, desc: "Thin, crisp dosa with sambar and chutneys.", veg: true, emoji: "🫓", stock: 100 },
  { name: "Masala Dosa", cat: "Dosa Varieties", price: 90, desc: "Crisp dosa filled with spiced potato masala.", veg: true, emoji: "🌯", best: true, was: 105 },
  { name: "Ghee Roast", cat: "Dosa Varieties", price: 110, desc: "A paper-thin golden dosa roasted in pure ghee.", veg: true, emoji: "🫓", best: true },
  { name: "Mysore Masala Dosa", cat: "Dosa Varieties", price: 120, desc: "Dosa spread with fiery red chutney and potato masala.", veg: true, emoji: "🌶️" },
  { name: "Onion Uthappam", cat: "Dosa Varieties", price: 90, desc: "Thick soft uthappam topped with onion and green chilli.", veg: true, emoji: "🥞" },
  { name: "Chicken Biryani", cat: "Rice & Biryani", price: 280, desc: "Seeraga samba rice layered with tender chicken, served with raita.", veg: false, emoji: "🍛", portions: [{ label: "Half", price: 160 }, { label: "Full", price: 280 }], best: true, was: 330, stock: 30 },
  { name: "Mutton Biryani", cat: "Rice & Biryani", price: 380, desc: "Slow-cooked mutton dum biryani with whole spices.", veg: false, emoji: "🍛", portions: [{ label: "Half", price: 220 }, { label: "Full", price: 380 }], best: true, stock: 3 },
  { name: "Vegetable Biryani", cat: "Rice & Biryani", price: 180, desc: "Fragrant rice cooked with seasonal vegetables and mint.", veg: true, emoji: "🥗" },
  { name: "Curd Rice", cat: "Rice & Biryani", price: 80, desc: "Cool curd rice tempered with mustard and curry leaves, with pickle.", veg: true, emoji: "🍚" },
  { name: "South Indian Veg Meals", cat: "Meals & Combos", price: 150, desc: "Rice, sambar, rasam, two poriyals, kootu, curd, payasam and papad.", veg: true, emoji: "🍱", best: true, stock: 25 },
  { name: "Non-Veg Meals", cat: "Meals & Combos", price: 220, desc: "Meals with chicken curry, fish fry, egg and all the sides.", veg: false, emoji: "🍱", stock: 0 },
  { name: "Mini Tiffin Combo", cat: "Meals & Combos", price: 130, desc: "One idli, one vada, a mini dosa, pongal and filter coffee.", veg: true, emoji: "🍽️", was: 160 },
  { name: "Chettinad Chicken Curry", cat: "Chettinad Specials", price: 280, desc: "Chicken in freshly ground Chettinad masala with kalpasi.", veg: false, emoji: "🍗", best: true },
  { name: "Mutton Chukka", cat: "Chettinad Specials", price: 360, desc: "Dry-roasted mutton with pepper, fennel and curry leaves.", veg: false, emoji: "🥩", off: true },
  { name: "Kerala Fish Curry", cat: "Chettinad Specials", price: 300, desc: "Seer fish simmered in a tangy tamarind and coconut gravy.", veg: false, emoji: "🐟", stock: 12 },
  { name: "Paneer Chettinad", cat: "Chettinad Specials", price: 220, desc: "Paneer in a roasted pepper and coconut masala.", veg: true, emoji: "🧀" },
  { name: "Chicken 65", cat: "Starters", price: 220, desc: "Spicy, crisp fried chicken with curry leaves and green chilli.", veg: false, emoji: "🍗", portions: [{ label: "Half", price: 130 }, { label: "Full", price: 220 }], best: true },
  { name: "Gobi 65", cat: "Starters", price: 150, desc: "Crisp cauliflower tossed in a spicy red masala.", veg: true, emoji: "🥦" },
  { name: "Fish Fry", cat: "Starters", price: 260, desc: "Marinated seer fish shallow-fried on a tawa.", veg: false, emoji: "🐟", stock: 4 },
  { name: "Semiya Payasam", cat: "Desserts", price: 70, desc: "Vermicelli simmered in milk with cardamom, cashews and raisins.", veg: true, emoji: "🍮" },
  { name: "Rava Kesari", cat: "Desserts", price: 60, desc: "Saffron semolina sweet roasted in ghee.", veg: true, emoji: "🍮", was: 75 },
  { name: "Mysore Pak", cat: "Desserts", price: 70, desc: "Melt-in-the-mouth gram flour and ghee sweet.", veg: true, emoji: "🍬" },
  { name: "Filter Coffee", cat: "Beverages", price: 40, desc: "Strong decoction coffee with frothy milk, served hot.", veg: true, emoji: "☕", best: true, stock: 200 },
  { name: "Buttermilk (Neer Mor)", cat: "Beverages", price: 30, desc: "Spiced buttermilk with ginger, curry leaves and coriander.", veg: true, emoji: "🥛" },
  { name: "Fresh Lime Soda", cat: "Beverages", price: 50, desc: "Fresh lime with soda, sweet, salt or mixed.", veg: true, emoji: "🍋" },
]

// ---------- pictures ----------
const keyOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
const storage = getStorage()
const imgUrl = (key: string) => storage.publicUrl(key)

async function drawPictures(jobs: { key: string; emoji: string; tint: [string, string]; label?: string; wide?: boolean }[]) {
  let chromium: typeof import("@playwright/test").chromium
  try {
    ;({ chromium } = await import("@playwright/test"))
  } catch {
    console.log("Playwright is not installed, so pictures are skipped (dishes will show the plate icon).")
    return new Set<string>()
  }
  const done = new Set<string>()
  const browser = await chromium.launch()
  try {
    for (const j of jobs) {
      const w = j.wide ? 1200 : 800
      const h = j.wide ? 400 : 600
      const page = await browser.newPage({ viewport: { width: w, height: h } })
      await page.setContent(`<body style="margin:0;width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;
        background:radial-gradient(circle at 30% 25%, ${j.tint[0]} 0%, ${j.tint[1]} 100%);font-family:system-ui;overflow:hidden">
        <div style="width:${h * 0.62}px;height:${h * 0.62}px;border-radius:50%;background:rgba(255,255,255,.55);box-shadow:0 20px 50px rgba(0,0,0,.18);
        display:flex;align-items:center;justify-content:center;font-size:${h * 0.38}px;line-height:1">${j.emoji}</div>
        ${j.label ? `<div style="position:absolute;left:48px;bottom:40px;color:#fff;font-size:44px;font-weight:700;text-shadow:0 2px 12px rgba(0,0,0,.35)">${j.label}</div>` : ""}</body>`)
      const bytes = await page.screenshot({ type: "jpeg", quality: 82 })
      await page.close()
      await storage.put(j.key, bytes, "image/jpeg")
      done.add(j.key)
    }
  } finally {
    await browser.close()
  }
  return done
}

// ---------- 1. dealer profile and ordering rules ----------
const hours = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "07:00", close: "22:30" }]))
await unscopedDb
  .update(dealers)
  .set({
    profile: {
      tagline: "Authentic South Indian cooking, made fresh every day",
      about:
        "Fameix Foods serves the food of Tamil Nadu the way it is cooked at home: soft idlis steamed every morning, crisp ghee roast dosas, Chettinad curries ground fresh each day, and dum biryani made with seeraga samba rice. We use cold-pressed oil, fresh coconut and no shortcuts. Dine in, pick up, or have it delivered across Chennai.",
      address: "42, South Usman Road, T. Nagar, Chennai 600017",
      email: "hello@fameixfoods.in",
      whatsapp: "918903957899",
    },
    orderSettings: { acceptingOrders: true, delivery: true, pickup: true, dineIn: true, deliveryFee: 30, freeDeliveryAbove: 500, minOrder: 150, acceptCod: true, acceptOnline: true },
    businessHours: hours,
    // Roughly 42 South Usman Road, T. Nagar. A 10 km range covers all four demo delivery zones.
    serviceArea: { lat: 13.0418, lng: 80.2341, address: "42, South Usman Road, T. Nagar, Chennai 600017", radiusKm: 10 },
  })
  .where(eq(dealers.id, dealer.id))

// ---------- 2. categories and dishes ----------
const catRows = await db.menuCategories.select()
const catId = new Map(catRows.map((c) => [c.name, c.id]))
for (const [i, name] of CATEGORIES.entries()) {
  if (!catId.has(name)) await db.menuCategories.insert({ name, sortOrder: i })
}
for (const c of await db.menuCategories.select()) catId.set(c.name, c.id)

const wantedKeys = DISHES.map((d) => ({ d, key: `dealers/${dealer.id}/menu/${keyOf(d.name)}.jpg` }))
const pictures = await drawPictures(wantedKeys.map(({ d, key }) => ({ key, emoji: d.emoji, tint: TINT[d.cat] })))

const existing = await db.menuItems.select()
const byName = new Map(existing.map((i) => [i.name, i]))
for (const { d, key } of wantedKeys) {
  const row = {
    name: d.name,
    description: d.desc,
    categoryId: catId.get(d.cat) ?? null,
    price: d.price,
    compareAtPrice: d.was ?? null,
    portions: d.portions ?? [],
    imageUrl: pictures.has(key) ? imgUrl(key) : null,
    isVeg: d.veg,
    isAvailable: d.off ? false : d.stock === 0 ? false : true,
    isFeatured: Boolean(d.best),
    stockQuantity: d.stock ?? null,
    sortOrder: DISHES.indexOf(d),
  }
  const found = byName.get(d.name)
  if (found) await db.menuItems.update(row, eq(menuItems.id, found.id))
  else await db.menuItems.insert(row)
}
const items = await db.menuItems.select()
const dishByName = new Map(items.map((i) => [i.name, i]))
const demoItemIds = DISHES.map((d) => dishByName.get(d.name)!.id)

// stock history: an opening count and a couple of restocks for every tracked dish
await db.stockAdjustments.delete(inArray(s.stockAdjustments.itemId, demoItemIds))
for (const d of DISHES.filter((x) => x.stock !== undefined)) {
  const it = dishByName.get(d.name)!
  const now = d.stock!
  await db.stockAdjustments.insert({ itemId: it.id, delta: now + 20, quantityAfter: now + 20, reason: "Started tracking" })
  await db.stockAdjustments.insert({ itemId: it.id, delta: -20, quantityAfter: now, reason: "Order rush, weekend" })
}

// ---------- 3. banners, coupons, zones, riders ----------
const bannerJobs = [
  { title: "Weekend Biryani Feast", subtitle: "Chicken and mutton biryani, fresh from the dum", emoji: "🍛", tint: ["#ffe3d3", "#e8845a"] as [string, string] },
  { title: "Free delivery above ₹500", subtitle: "Across T. Nagar, Anna Nagar, Adyar and Velachery", emoji: "🛵", tint: ["#e6f4dc", "#8fc069"] as [string, string] },
  { title: "Filter coffee, all day", subtitle: "Strong, frothy and just the way you like it", emoji: "☕", tint: ["#fff3d6", "#c98a45"] as [string, string] },
]
const bannerPics = await drawPictures(bannerJobs.map((b) => ({ key: `dealers/${dealer.id}/banner/${keyOf(b.title)}.jpg`, emoji: b.emoji, tint: b.tint, label: b.title, wide: true })))
await db.banners.delete(inArray(s.banners.title, bannerJobs.map((b) => b.title)))
for (const [i, b] of bannerJobs.entries()) {
  const key = `dealers/${dealer.id}/banner/${keyOf(b.title)}.jpg`
  await db.banners.insert({ title: b.title, subtitle: b.subtitle, imageUrl: bannerPics.has(key) ? imgUrl(key) : null, sortOrder: i, isActive: true })
}

const day = 86_400_000
const couponDefs = [
  { code: "WELCOME10", kind: "percent", value: 10, minOrder: 200, maxDiscount: 50, expiresAt: null as Date | null, usedCount: 0 },
  { code: "FLAT50", kind: "flat", value: 50, minOrder: 300, maxDiscount: null, expiresAt: null, usedCount: 0 },
  { code: "SOUTH20", kind: "percent", value: 20, minOrder: 500, maxDiscount: 100, expiresAt: new Date(Date.now() + 60 * day), usedCount: 0 },
  { code: "DIWALI15", kind: "percent", value: 15, minOrder: 250, maxDiscount: 75, expiresAt: new Date(Date.now() - 20 * day), usedCount: 0 },
]
await db.coupons.delete(inArray(s.coupons.code, couponDefs.map((c) => c.code)))
const couponByCode = new Map<string, (typeof couponDefs)[number]>()
for (const c of couponDefs) couponByCode.set(c.code, c)

const zoneDefs = [
  { name: "T. Nagar", pincodes: ["600017"], fee: 30, minOrder: null as number | null, etaMinutes: 30, centre: [13.0418, 80.2341] },
  { name: "Anna Nagar", pincodes: ["600040", "600101", "600102"], fee: 40, minOrder: 200, etaMinutes: 40, centre: [13.085, 80.2101] },
  { name: "Adyar", pincodes: ["600020", "600090"], fee: 50, minOrder: 250, etaMinutes: 45, centre: [13.0012, 80.2565] },
  { name: "Velachery", pincodes: ["600042", "600091"], fee: 60, minOrder: 300, etaMinutes: 50, centre: [12.9815, 80.218] },
]
await db.deliveryZones.delete(inArray(s.deliveryZones.name, zoneDefs.map((z) => z.name)))
for (const z of zoneDefs) await db.deliveryZones.insert({ name: z.name, pincodes: z.pincodes, fee: z.fee, minOrder: z.minOrder, etaMinutes: z.etaMinutes, isActive: true })
const zoneOf = (pin: string) => zoneDefs.find((z) => z.pincodes.includes(pin))!

const riderDefs = [
  { code: "DP001", name: "Mani Kandan", phone: "+919841100101", vehicleNumber: "TN 09 AB 1234", pin: "1111", isActive: true },
  { code: "DP002", name: "Karthik Raja", phone: "+919841100102", vehicleNumber: "TN 10 CD 5678", pin: "2222", isActive: true },
  { code: "DP003", name: "Suresh Babu", phone: "+919841100103", vehicleNumber: "TN 07 EF 9012", pin: "3333", isActive: false },
]
await db.deliveryPartners.delete(inArray(s.deliveryPartners.code, riderDefs.map((r) => r.code)))
for (const r of riderDefs) await db.deliveryPartners.insert({ code: r.code, name: r.name, phone: r.phone, vehicleNumber: r.vehicleNumber, isActive: r.isActive, pinHash: await hashPassword(r.pin) })
const riders = (await db.deliveryPartners.select()).filter((r) => riderDefs.some((d) => d.code === r.code))

// ---------- 4. guests and orders ----------
const GUESTS = [
  "Arun Kumar", "Priya Lakshmi", "Venkatesh R", "Meenakshi S", "Karthikeyan", "Divya Bharathi", "Senthil Nathan", "Lavanya M", "Gopalakrishnan", "Revathi",
  "Balaji S", "Anitha Raj", "Murugan P", "Kavitha", "Ramesh Babu", "Sangeetha", "Vignesh", "Deepa Rani", "Prakash J", "Nithya",
  "Saravanan", "Janani", "Harish K", "Pooja", "Dinesh Kumar", "Shanthi", "Ganesh", "Abirami", "Manoj", "Thenmozhi",
]
const guests = GUESTS.map((name, i) => ({ name, phone: `+9190000${String(i + 1).padStart(5, "0")}` }))
const STREETS = ["North Usman Road", "Habibullah Road", "2nd Avenue", "Lattice Bridge Road", "Gandhi Nagar 3rd Main Street", "Velachery Main Road", "Pondy Bazaar", "Sardar Patel Road", "Thiruvalluvar Street", "LB Road"]
const NOTES = ["Less spicy please", "Extra chutney", "Ring the bell twice", "No onion", "Call when you reach", "", "", "", "", ""]

// remove only earlier demo orders, their reviews and enquiries
const oldDemo = await db.orders.select(like(orders.customerPhone, "+91900000%"))
if (oldDemo.length) await db.reviews.delete(inArray(reviews.orderId, oldDemo.map((o) => o.id)))
await db.orders.delete(like(orders.customerPhone, "+91900000%"))
await db.enquiries.delete(like(s.enquiries.phone, "+91900000%"))

const CODE = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
const usedCodes = new Set((await db.orders.select()).map((o) => o.code))
const newCode = () => {
  for (;;) {
    const c = Array.from({ length: 6 }, () => CODE[Math.floor(rnd() * CODE.length)]).join("")
    if (!usedCodes.has(c)) return usedCodes.add(c), c
  }
}
const available = DISHES.filter((d) => !d.off)
// busier at lunch and dinner, and on weekends
const HOUR_WEIGHTS = [0, 0, 0, 0, 0, 0, 0, 3, 5, 4, 2, 2, 5, 8, 7, 3, 2, 3, 5, 8, 9, 7, 3, 0]
const hourPick = () => {
  const total = HOUR_WEIGHTS.reduce((a, b) => a + b, 0)
  let r = rnd() * total
  for (let h = 0; h < 24; h++) {
    r -= HOUR_WEIGHTS[h]
    if (r <= 0) return h
  }
  return 20
}
const ISTMS = 5.5 * 3_600_000
function istInstant(daysAgo: number, hour: number) {
  const base = new Date(Date.now() + ISTMS)
  base.setUTCHours(0, 0, 0, 0)
  return new Date(base.getTime() - ISTMS - daysAgo * day + hour * 3_600_000 + between(0, 59) * 60_000)
}

type Plan = { daysAgo: number; hour: number; todayStatus?: string }
const plans: Plan[] = []
for (let d = 44; d >= 1; d--) {
  const weekday = new Date(Date.now() - d * day + ISTMS).getUTCDay()
  const count = Math.round((weekday === 0 || weekday === 6 ? 4.5 : 2.4) * (0.7 + (44 - d) / 90) + rnd() * 1.5)
  for (let i = 0; i < count; i++) plans.push({ daysAgo: d, hour: hourPick() })
}
// today: a live kitchen at every stage, so the board is not empty
const nowIst = new Date(Date.now() + ISTMS)
const hourNow = Math.max(8, nowIst.getUTCHours())
for (const st of ["completed", "completed", "completed", "completed", "out_for_delivery", "out_for_delivery", "preparing", "preparing", "confirmed", "new", "new", "new", "pending_payment", "cancelled"])
  plans.push({ daysAgo: 0, hour: Math.min(hourNow, 7 + between(0, Math.max(0, hourNow - 7))), todayStatus: st })

let made = 0
const completedForReview: { id: string; name: string }[] = []
for (const plan of plans) {
  const g = pick(guests.slice(0, chance(0.6) ? 12 : 30)) // a core of regulars, plus a long tail
  const fulfilment = chance(0.58) ? "delivery" : chance(0.65) ? "pickup" : "dine_in"
  const lineCount = between(1, 4)
  const chosen = new Set<string>()
  const lines: { itemId: string; name: string; portion: string | null; price: number; qty: number }[] = []
  for (let i = 0; i < lineCount; i++) {
    const d = pick(available)
    if (chosen.has(d.name)) continue
    chosen.add(d.name)
    const row = dishByName.get(d.name)!
    const portion = d.portions ? pick(d.portions) : null
    lines.push({ itemId: row.id, name: d.name, portion: portion?.label ?? null, price: portion?.price ?? d.price, qty: chance(0.7) ? 1 : between(2, 3) })
  }
  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0)
  let pincode: string | null = null
  let zoneName: string | null = null
  let address: string | null = null
  let fee = 0
  if (fulfilment === "delivery") {
    pincode = pick(zoneDefs.flatMap((z) => z.pincodes))
    const z = zoneOf(pincode)
    zoneName = z.name
    address = `${between(1, 240)}, ${pick(STREETS)}, ${z.name}, Chennai`
    fee = subtotal >= 500 ? 0 : z.fee
  }
  let couponCode: string | null = null
  let discount = 0
  if (chance(0.22)) {
    const c = pick(couponDefs.filter((c) => c.code !== "DIWALI15" || plan.daysAgo > 25))
    if (subtotal >= c.minOrder) {
      couponCode = c.code
      const raw = c.kind === "percent" ? Math.floor((subtotal * c.value) / 100) : c.value
      discount = Math.min(c.maxDiscount != null ? Math.min(raw, c.maxDiscount) : raw, subtotal)
      couponByCode.get(c.code)!.usedCount += 1
    }
  }
  const total = subtotal - discount + fee

  let status = plan.todayStatus
  if (!status) status = chance(0.07) ? "cancelled" : "completed"
  if (status === "out_for_delivery" && fulfilment !== "delivery") status = "preparing"
  const online = chance(0.4) && status !== "pending_payment" ? true : status === "pending_payment"
  const placed = plan.todayStatus ? new Date(Date.now() - between(8, 200) * 60_000) : istInstant(plan.daysAgo, plan.hour)
  const rider = fulfilment === "delivery" && ["out_for_delivery", "completed", "preparing", "confirmed"].includes(status) ? pick(riders.filter((r) => r.isActive)) : null
  const code = newCode()
  const paid = status === "completed" ? true : status === "cancelled" ? false : online && status !== "pending_payment"
  const refunded = status === "cancelled" && online && chance(0.8)
  const lat = pincode ? zoneOf(pincode).centre[0] + (rnd() - 0.5) * 0.012 : null
  const lng = pincode ? zoneOf(pincode).centre[1] + (rnd() - 0.5) * 0.012 : null
  await db.orders.insert({
    code,
    customerName: g.name,
    customerPhone: g.phone,
    fulfilment,
    address,
    note: pick(NOTES),
    lines,
    subtotal,
    discount,
    deliveryFee: fee,
    total,
    couponCode,
    pincode,
    zoneName,
    // Roughly where in the zone the guest shared their location from, so the maps links have something to open.
    latitude: lat,
    longitude: lng,
    partnerId: rider?.id ?? null,
    paymentMethod: online ? "online" : "cod",
    paymentStatus: refunded ? "refunded" : paid ? "paid" : "pending",
    paidAt: paid || refunded ? new Date(placed.getTime() + 60_000) : null,
    razorpayOrderId: online ? `order_demo${code}` : null,
    razorpayPaymentId: online && (paid || refunded) ? `pay_demo${code}` : null,
    refundedAt: refunded ? new Date(placed.getTime() + 3_600_000) : null,
    stockReleased: status === "cancelled",
    status,
    createdAt: placed,
    updatedAt: new Date(placed.getTime() + between(10, 70) * 60_000),
  })
  made++
  if (status === "out_for_delivery" && rider && lat !== null && lng !== null) {
    // A rider part-way to the guest, so the live map has something to show. Real positions replace this once a rider shares.
    const [saved] = await db.orders.select(eq(orders.code, code), { limit: 1 })
    await db.orderLocations.insert({ orderId: saved.id, lat: Math.round((lat + 0.01) * 1e6) / 1e6, lng: Math.round((lng - 0.008) * 1e6) / 1e6, accuracy: 12, heading: 200, updatedAt: new Date() })
  }
  if (status === "completed") {
    const [saved] = await db.orders.select(eq(orders.code, code), { limit: 1 })
    completedForReview.push({ id: saved.id, name: g.name.split(" ")[0] })
  }
}
for (const c of couponDefs) await db.coupons.insert({ code: c.code, kind: c.kind, value: c.value, minOrder: c.minOrder, maxDiscount: c.maxDiscount, expiresAt: c.expiresAt, usedCount: couponByCode.get(c.code)!.usedCount, isActive: true })

// ---------- 5. reviews and enquiries ----------
const REVIEWS: [number, string][] = [
  [5, "The ghee roast dosa was crisp and the sambar tasted like home. Delivery was early too."],
  [5, "Best chicken biryani in T. Nagar. The portion is generous and the rice is perfectly cooked."],
  [4, "Idli and vada were soft and fresh. Chutneys could be a little spicier."],
  [5, "Filter coffee is exactly how my grandmother made it. Will order every morning."],
  [5, "Chettinad chicken curry has real flavour. Ordered for a family dinner and everyone loved it."],
  [4, "Meals were great value. Rasam was excellent."],
  [5, "Quick delivery and the food was still hot. Mutton biryani is a must try."],
  [3, "Food was good but arrived 15 minutes later than promised."],
  [5, "Payasam was the perfect finish. Packaging was neat and spill-proof."],
  [4, "Masala dosa was crisp and the potato filling was well spiced."],
  [5, "Pongal with vada for breakfast, every time. Consistent taste."],
  [2, "My order was missing the chutney. The restaurant called and fixed it, so thank you."],
  [5, "Fish curry reminded me of Kerala. Excellent."],
  [4, "Good food, fair price. The Mini Tiffin Combo is a great idea."],
]
const reviewTargets = completedForReview.slice(-REVIEWS.length)
for (const [i, r] of REVIEWS.entries()) {
  const t = reviewTargets[i]
  if (!t) break
  await db.reviews.insert({ orderId: t.id, name: t.name, rating: r[0], comment: r[1], status: i === 7 ? "pending" : i === 11 ? "hidden" : i === 13 ? "pending" : "approved", createdAt: new Date(Date.now() - (REVIEWS.length - i) * 2 * day + between(0, 12) * 3_600_000) })
}
const ENQUIRIES = [
  ["Do you take bulk orders for a family function of around 60 people?", "new"],
  ["Is the biryani available for lunch on weekdays? We would like to order for the office.", "new"],
  ["Can I get jain food, without onion and garlic, in your meals?", "handled"],
  ["Do you cater for birthday parties at home? Looking for idli, dosa and sweets.", "handled"],
  ["What time do you stop taking dine-in orders on Sundays?", "new"],
  ["Please share the allergen details for the Mysore pak.", "handled"],
] as const
for (const [i, [message, status]] of ENQUIRIES.entries()) {
  const g = guests[(i * 5) % guests.length]
  await db.enquiries.insert({ name: g.name, phone: g.phone, message, status, createdAt: new Date(Date.now() - (i * 3 + 1) * day) })
}

const counts = await Promise.all([db.menuItems.count(), db.orders.count(), db.coupons.count(), db.deliveryZones.count(), db.deliveryPartners.count(), db.reviews.count(), db.enquiries.count(), db.banners.count()])
console.log(`Filled "${dealer.displayName}" (${slug})`)
console.log(`  dishes ${counts[0]} · orders ${counts[1]} (${made} new) · coupons ${counts[2]} · zones ${counts[3]} · riders ${counts[4]} · reviews ${counts[5]} · enquiries ${counts[6]} · banners ${counts[7]}`)
console.log("  rider PINs: DP001 1111, DP002 2222, DP003 3333 (paused)")
console.log("  pictures:", pictures.size ? `${pictures.size} dish pictures drawn` : "skipped")
process.exit(0)
