// Onboards ONE fully-detailed TanyEats test restaurant on staging: "Marina Spice Kitchen" (marina-spice).
// FAKE DATA ONLY: invented name, 9000000xxx phone numbers, no real people or addresses beyond a public Chennai locality.
//
//   pnpm seed:tanyeats                                   (reads .env.staging)
//   STAGING_OWNER_EMAIL=you@example.com pnpm seed:tanyeats
//
// Step 1 here creates the business the way onboarding would (name, slug, hours, brand colours, plan, trial) and fills in everything
// an owner would later add in Settings (storefront text, address and delivery radius, ordering rules). Step 2 runs scripts/seed-restaurant.ts
// on it: 30 dishes with pictures, categories, banners, coupons, delivery zones, riders, ~130 orders over 45 days, reviews, enquiries, stock.
// Safe to run twice. It REFUSES to run against the database in .env.local (production's).
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { users } from "../lib/db/schema/auth.ts"
import { dealerUsers, dealers } from "../lib/db/schema/dealers.ts"

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is not set (run with --env-file=.env.staging, which `pnpm seed:tanyeats` does)")

function productionUrl(): string | null {
  try {
    const m = /^DATABASE_URL=(.*)$/m.exec(readFileSync(".env.local", "utf8"))
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : null
  } catch {
    return null
  }
}
const prod = productionUrl()
if (prod) {
  const a = new URL(url)
  const b = new URL(prod)
  if (a.hostname === b.hostname && a.pathname === b.pathname) throw new Error("DATABASE_URL is the same database as .env.local (production). Refusing to seed test data there.")
}

export const TANYEATS_TEST = {
  slug: "marina-spice",
  displayName: "Marina Spice Kitchen",
  phone: "+919000000201",
}

const hours = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "07:00", close: "22:30" }]))
const pool = new Pool({ connectionString: url })
const db = drizzle(pool)

try {
  const values = {
    ...TANYEATS_TEST,
    industry: "restaurants" as const,
    city: "Chennai",
    plan: "growth",
    billingCycle: "monthly",
    trialEndsAt: new Date(Date.now() + 60 * 86_400_000),
    businessHours: hours,
    theme: { primary: "#c2410c", primaryForeground: "#ffffff", accent: "#15803d", radius: "md" as const },
    profile: {
      tagline: "Chennai home-style meals, biryani and filter coffee",
      about:
        "Marina Spice Kitchen is a TEST restaurant on TanyEats staging (fake data). It serves soft idlis and ghee roast dosas for breakfast, Chettinad curries and dum biryani for lunch and dinner, and filter coffee all day. Dine in, pick up, or order delivery across T. Nagar, Anna Nagar, Adyar and Velachery.",
      address: "18, Venkatesa Agraharam Street, Mylapore, Chennai 600004",
      email: "hello@marina-spice.test",
      whatsapp: "919000000201",
    },
    // Dine-in, pickup and delivery all on; free delivery above Rs 500; cash and online payments both offered.
    orderSettings: { acceptingOrders: true, delivery: true, pickup: true, dineIn: true, deliveryFee: 30, freeDeliveryAbove: 500, minOrder: 150, acceptCod: true, acceptOnline: true },
    // Mylapore, with a 10 km range that covers all four delivery zones the seed creates.
    serviceArea: { lat: 13.0339, lng: 80.2619, address: "18, Venkatesa Agraharam Street, Mylapore, Chennai 600004", radiusKm: 10 },
  }
  const [dealer] = await db
    .insert(dealers)
    .values(values)
    .onConflictDoUpdate({ target: dealers.slug, set: values })
    .returning()
  console.log(`onboarded ${dealer.slug} (${dealer.displayName}, ${dealer.plan})`)

  const ownerEmail = process.env.STAGING_OWNER_EMAIL?.trim().toLowerCase()
  if (ownerEmail) {
    const [user] = await db.insert(users).values({ email: ownerEmail }).onConflictDoUpdate({ target: users.email, set: { email: ownerEmail } }).returning()
    await db.insert(dealerUsers).values({ dealerId: dealer.id, userId: user.id, role: "owner" }).onConflictDoNothing()
    console.log("linked STAGING_OWNER_EMAIL as owner")
  } else {
    console.log("no STAGING_OWNER_EMAIL: the storefront is public, but nobody can manage it. Run again with it set.")
  }
} finally {
  await pool.end()
}

// Step 2: menu, offers, zones, riders, orders, reviews. Inherits DATABASE_URL and the rest of the environment.
execFileSync(process.execPath, ["scripts/seed-restaurant.ts", TANYEATS_TEST.slug], { stdio: "inherit" })
