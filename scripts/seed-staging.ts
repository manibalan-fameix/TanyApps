// Staging demo data: one cab operator, one restaurant and one car dealer. FAKE DATA ONLY: invented names, 9000000xxx phone numbers,
// TN00 registrations, no real people, photos or addresses.
//
//   pnpm seed:staging                                  (reads .env.staging; needs DATABASE_URL, ENCRYPTION_KEY, BLIND_INDEX_KEY)
//   STAGING_OWNER_EMAIL=you@example.com pnpm seed:staging
//
// With STAGING_OWNER_EMAIL, that person becomes owner of all three demo businesses, so signing in with that Google account lands on
// a dashboard. Safe to run twice (it updates what it made and leaves everything else alone). It REFUSES to run against the database
// in .env.local, which is production's.
import { readFileSync } from "node:fs"

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { encrypt } from "../lib/crypto/index.ts"
import { blindIndex, phoneHash } from "../lib/crypto/blind-index.ts"
import { users } from "../lib/db/schema/auth.ts"
import { cabSettings, driverDocuments, drivers, packages, rateCards, rateSurcharges, vehicleClasses, vehicleDocuments, vehicles } from "../lib/db/schema/cabs.ts"
import { cars, priceEvents } from "../lib/db/schema/cars.ts"
import { dealerUsers, dealers } from "../lib/db/schema/dealers.ts"
import { menuCategories, menuItems } from "../lib/db/schema/menu.ts"
import { generateShortCode } from "../lib/short-code.ts"

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is not set (run with --env-file=.env.staging, which `pnpm seed:staging` does)")
if (!process.env.ENCRYPTION_KEY || !process.env.BLIND_INDEX_KEY) throw new Error("ENCRYPTION_KEY and BLIND_INDEX_KEY must be set")

/** Production's database, if .env.local has one: staging data must never be written there. */
function productionUrl(): string | null {
  try {
    const m = /^DATABASE_URL=(.*)$/m.exec(readFileSync(".env.local", "utf8"))
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null
  } catch {
    return null
  }
}
const prod = productionUrl()
const sameDb = (a: string, b: string) => {
  const x = new URL(a)
  const y = new URL(b)
  return x.hostname === y.hostname && x.pathname === y.pathname
}
if (prod && sameDb(url, prod)) throw new Error("DATABASE_URL is the same database as .env.local (production). Refusing to seed demo data there.")

const pool = new Pool({ connectionString: url })
const db = drizzle(pool)

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000)

async function upsertDealer(d: typeof dealers.$inferInsert) {
  const [row] = await db
    .insert(dealers)
    .values(d)
    .onConflictDoUpdate({ target: dealers.slug, set: { displayName: d.displayName, theme: d.theme, plan: d.plan, phone: d.phone, city: d.city, industry: d.industry } })
    .returning()
  return row
}

// ---------------------------------------------------------------- cab operator
async function seedCabs() {
  const dealer = await upsertDealer({
    slug: "demo-cabs",
    displayName: "Demo Cabs",
    industry: "cabs",
    plan: "pro",
    city: "Chennai",
    phone: "+919000000101",
    trialEndsAt: inDays(60),
    theme: { primary: "#047857", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "lg" },
  })
  const id = dealer.id

  const classDefs = [
    { name: "Sedan", seats: 4, bags: 2, sortOrder: 1, perKm: 1400, tourPrice: 1_800_000, local: 180_000 },
    { name: "SUV", seats: 6, bags: 3, sortOrder: 2, perKm: 1800, tourPrice: 2_400_000, local: 240_000 },
    { name: "Tempo Traveller", seats: 12, bags: 8, sortOrder: 3, perKm: 2500, tourPrice: 3_600_000, local: 360_000 },
  ]
  const classIds: Record<string, string> = {}
  for (const c of classDefs) {
    const [row] = await db
      .insert(vehicleClasses)
      .values({ dealerId: id, name: c.name, seats: c.seats, bags: c.bags, ac: true, sortOrder: c.sortOrder, description: "Demo vehicle (fake data)." })
      .onConflictDoUpdate({ target: [vehicleClasses.dealerId, vehicleClasses.name], set: { seats: c.seats, bags: c.bags, sortOrder: c.sortOrder } })
      .returning()
    classIds[c.name] = row.id
  }

  // Rate cards: only where none exist yet, so re-running does not duplicate them.
  const existing = await db.select({ n: rateCards.id }).from(rateCards).where(eq(rateCards.dealerId, id))
  if (existing.length === 0) {
    for (const c of classDefs) {
      const cid = classIds[c.name]
      await db.insert(rateCards).values([
        { dealerId: id, vehicleClassId: cid, tripType: "airport", basePaise: 25_000, perKmPaise: c.perKm },
        { dealerId: id, vehicleClassId: cid, tripType: "outstation_one_way", perKmPaise: c.perKm - 100, minKmPerDay: 250, bataPerDayPaise: 40_000 },
        { dealerId: id, vehicleClassId: cid, tripType: "outstation_round", perKmPaise: c.perKm - 200, minKmPerDay: 300, bataPerDayPaise: 40_000 },
        { dealerId: id, vehicleClassId: cid, tripType: "local_hourly", basePaise: c.local, packageHours: 8, packageKm: 80, extraKmPaise: c.perKm, extraHourPaise: 15_000 },
        { dealerId: id, vehicleClassId: cid, tripType: "local_hourly", basePaise: Math.round(c.local / 2), packageHours: 4, packageKm: 40, extraKmPaise: c.perKm, extraHourPaise: 15_000 },
      ])
    }
    await db.insert(rateSurcharges).values([
      { dealerId: id, kind: "night", label: "Night charge", scope: { window: { start: "22:00", end: "06:00" } }, bps: 1000 },
      { dealerId: id, kind: "hill", label: "Kodaikanal hill charge", scope: { places: ["Kodaikanal"] }, amountPaise: 50_000 },
      { dealerId: id, kind: "permit", label: "Kerala permit", scope: { states: ["KL"] }, amountPaise: 60_000 },
      { dealerId: id, kind: "airport", label: "Airport entry", scope: { tripTypes: ["airport"], places: ["Airport"] }, amountPaise: 15_000 },
    ])
  }

  const tourPrices = Object.fromEntries(classDefs.map((c) => [classIds[c.name], c.tourPrice]))
  await db
    .insert(packages)
    .values({
      dealerId: id,
      name: "Kodaikanal weekend",
      slug: "kodaikanal-weekend",
      description: "Two days in the hills (demo itinerary, fake data).",
      days: 2,
      itinerary: [
        { day: 1, title: "Madurai to Kodaikanal", description: "Drive up, lake and viewpoints." },
        { day: 2, title: "Kodaikanal to Madurai", description: "Morning walk, drive back." },
      ],
      vehicleClassPrices: tourPrices,
    })
    .onConflictDoNothing()

  await db
    .insert(cabSettings)
    .values({ dealerId: id, gstRateBps: 500, stateCode: "33", sacCode: "9964", invoicePrefix: "DC", nightStart: "22:00", nightEnd: "06:00", minLeadMinutes: 60, bufferMinutes: 30, serviceCities: ["Chennai", "Madurai"], cancellationPolicy: [{ hoursBefore: 24, feeBps: 0 }, { hoursBefore: 4, feeBps: 2500 }, { hoursBefore: 0, feeBps: 5000 }] })
    .onConflictDoNothing()

  // Three vehicles with in-date papers, two drivers. Registrations, licences and phones are invented.
  const vehicleDefs = [
    { reg: "TN00AA0001", cls: "Sedan", model: "Toyota Etios (demo)", fuel: "diesel" as const },
    { reg: "TN00AA0002", cls: "SUV", model: "Toyota Innova (demo)", fuel: "diesel" as const },
    { reg: "TN00AA0003", cls: "Tempo Traveller", model: "Force Traveller (demo)", fuel: "diesel" as const },
  ]
  for (const v of vehicleDefs) {
    const [row] = await db
      .insert(vehicles)
      .values({ dealerId: id, classId: classIds[v.cls], regEnc: encrypt(v.reg), regHash: blindIndex("vehicle_reg", v.reg), regPrefix: v.reg.slice(0, 4), makeModel: v.model, year: 2022, colour: "White", fuel: v.fuel, ownership: "own", odometerKm: 30_000 })
      .onConflictDoNothing()
      .returning()
    if (row) {
      for (const type of ["rc", "insurance", "permit", "fc"] as const) {
        await db.insert(vehicleDocuments).values({ dealerId: id, vehicleId: row.id, type, number: `DEMO-${type.toUpperCase()}-${v.reg}`, validFrom: day(-60), validTill: type === "rc" ? null : day(300) })
      }
    }
  }
  const driverDefs = [
    { name: "Demo Driver One", phone: "+919000000111", licence: "TN0020200000001", employment: "employee" as const },
    { name: "Demo Driver Two", phone: "+919000000112", licence: "TN0020200000002", employment: "attached" as const },
  ]
  for (const d of driverDefs) {
    const [row] = await db
      .insert(drivers)
      .values({ dealerId: id, name: d.name, phoneEnc: encrypt(d.phone), phoneHash: phoneHash(d.phone), licenceEnc: encrypt(d.licence), licenceHash: blindIndex("licence", d.licence), licenceValidTill: day(400), badgeNo: "DEMO-BADGE", employment: d.employment, languages: ["ta", "en"] })
      .onConflictDoNothing()
      .returning()
    if (row) await db.insert(driverDocuments).values({ dealerId: id, driverId: row.id, type: "licence", number: d.licence, validTill: day(400) })
  }
  return dealer
}

// ---------------------------------------------------------------- restaurant
async function seedRestaurant() {
  const dealer = await upsertDealer({
    slug: "demo-eats",
    displayName: "Demo Eats",
    industry: "restaurants",
    plan: "growth",
    city: "Chennai",
    phone: "+919000000102",
    trialEndsAt: inDays(60),
    theme: { primary: "#b45309", primaryForeground: "#ffffff", accent: "#16a34a", radius: "md" },
  })
  const id = dealer.id
  const cats: Record<string, string> = {}
  for (const [i, name] of ["Starters", "Mains", "Desserts"].entries()) {
    const [row] = await db
      .insert(menuCategories)
      .values({ dealerId: id, name, sortOrder: i })
      .onConflictDoUpdate({ target: [menuCategories.dealerId, menuCategories.name], set: { sortOrder: i } })
      .returning()
    cats[name] = row.id
  }
  const dishes = [
    { cat: "Starters", name: "Paneer tikka (demo)", price: 220, veg: true, description: "Fake dish for testing." },
    { cat: "Starters", name: "Chicken 65 (demo)", price: 240, veg: false, description: "Fake dish for testing." },
    { cat: "Mains", name: "Veg biryani (demo)", price: 180, veg: true, description: "Fake dish for testing." },
    { cat: "Mains", name: "Chicken biryani (demo)", price: 260, veg: false, description: "Fake dish for testing." },
    { cat: "Mains", name: "Parotta with salna (demo)", price: 90, veg: true, description: "Fake dish for testing." },
    { cat: "Desserts", name: "Gulab jamun (demo)", price: 80, veg: true, description: "Fake dish for testing." },
  ]
  const have = await db.select({ name: menuItems.name }).from(menuItems).where(eq(menuItems.dealerId, id))
  const names = new Set(have.map((h) => h.name))
  for (const [i, d] of dishes.entries()) {
    if (names.has(d.name)) continue
    await db.insert(menuItems).values({ dealerId: id, categoryId: cats[d.cat], name: d.name, description: d.description, price: d.price, isVeg: d.veg, sortOrder: i, isFeatured: i < 2 })
  }
  return dealer
}

// ---------------------------------------------------------------- car dealer
async function seedMotors() {
  const dealer = await upsertDealer({
    slug: "demo-motors",
    displayName: "Demo Motors",
    industry: "motors",
    plan: "starter",
    city: "Chennai",
    phone: "+919000000103",
    trialEndsAt: inDays(60),
    theme: { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f5b400", radius: "lg" },
  })
  const demoCars = [
    { year: 2017, reg: "TN00AB0001", km: 48_200, owners: 1, fuel: "Petrol", trans: "Manual", price: 565_000, slug: "2017-demo-hatchback" },
    { year: 2019, reg: "TN00AB0002", km: 31_500, owners: 1, fuel: "Diesel", trans: "Automatic", price: 1_125_000, slug: "2019-demo-suv" },
    { year: 2015, reg: "TN00AB0003", km: 72_000, owners: 2, fuel: "Petrol", trans: "Manual", price: 345_000, slug: "2015-demo-sedan" },
  ]
  for (const [i, c] of demoCars.entries()) {
    const [car] = await db
      .insert(cars)
      .values({ dealerId: dealer.id, year: c.year, regNumber: encrypt(c.reg), regPrefix: c.reg.slice(0, 4).toLowerCase(), kmDriven: c.km, ownerCount: c.owners, fuel: c.fuel, transmission: c.trans, askingPrice: c.price, status: i < 2 ? "live" : "draft", shortCode: generateShortCode(), slug: `${dealer.slug}-${c.slug}`, listedAt: i < 2 ? new Date() : null })
      .onConflictDoNothing()
      .returning()
    if (car && i < 2) await db.insert(priceEvents).values({ carId: car.id, event: "listed", price: c.price })
  }
  return dealer
}

try {
  const made = [await seedCabs(), await seedRestaurant(), await seedMotors()]
  for (const d of made) console.log(`seeded ${d.slug} (${d.industry}, ${d.plan})`)

  const ownerEmail = process.env.STAGING_OWNER_EMAIL?.trim().toLowerCase()
  if (ownerEmail) {
    const [user] = await db.insert(users).values({ email: ownerEmail }).onConflictDoUpdate({ target: users.email, set: { email: ownerEmail } }).returning()
    for (const d of made) await db.insert(dealerUsers).values({ dealerId: d.id, userId: user.id, role: "owner" }).onConflictDoNothing()
    console.log("linked the owner (email from STAGING_OWNER_EMAIL) to all three demo businesses")
  } else {
    console.log("no STAGING_OWNER_EMAIL: the demo sites are public, but nobody can manage them. Run again with it set to link an owner.")
  }
} finally {
  await pool.end()
}
