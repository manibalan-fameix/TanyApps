// Replaces a restaurant's drawn placeholder pictures with real photos from Pexels (https://www.pexels.com).
//
//   pnpm seed:photos                    (reads .env.local; restaurant "marina-spice")
//   pnpm seed:photos my-slug            (any restaurant)
//   pnpm seed:photos:staging            (reads .env.staging)
//   pnpm seed:photos -- --force         (fetch again even for dishes that already have a Pexels photo)
//
// Needs PEXELS_API_KEY (free: https://www.pexels.com/api/). For each dish and banner it searches Pexels, downloads the best match
// into this app's own storage (R2, or local disk in development), so the pages never hot-link Pexels, and writes the photographer
// credit to docs/staging/photo-credits.md as Pexels asks. Safe to run again: it only touches dishes and banners it can match by
// name, and skips ones that already have a Pexels photo.
import { mkdirSync, writeFileSync } from "node:fs"

import { eq } from "drizzle-orm"

import { unscopedDb } from "../lib/db/client.ts"
import { scopedDb } from "../lib/db/scoped.ts"
import * as s from "../lib/db/schema/index.ts"
import { getStorage } from "../lib/storage/index.ts"

const { dealers, menuItems, banners } = s

const key = process.env.PEXELS_API_KEY?.trim()
if (!key) {
  console.error("PEXELS_API_KEY is not set. Get a free key at https://www.pexels.com/api/ and put PEXELS_API_KEY=... in the env file this command reads.")
  process.exit(1)
}
const API = process.env.PEXELS_API_BASE ?? "https://api.pexels.com/v1"
const force = process.argv.includes("--force")
const slug = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "marina-spice"

const [dealer] = await unscopedDb.select().from(dealers).where(eq(dealers.slug, slug)).limit(1)
if (!dealer) throw new Error(`No restaurant with slug "${slug}"`)
if (dealer.industry !== "restaurants") throw new Error(`"${slug}" is not a restaurant`)
const db = scopedDb(dealer.id)
const storage = getStorage()

/** What to search for each dish. Plain dish names find poor matches ("Ghee Roast" is also a coffee), so each has a tuned query. */
const DISH_QUERY: Record<string, string> = {
  "Idli (Steamed Rice Cakes)": "idli sambar south indian breakfast",
  "Medu Vada": "medu vada south indian",
  "Ven Pongal": "ven pongal south indian",
  "Poori Masala": "poori masala indian breakfast",
  "Rava Upma": "rava upma",
  "Plain Dosa": "plain dosa chutney sambar",
  "Masala Dosa": "masala dosa",
  "Ghee Roast": "ghee roast dosa crispy",
  "Mysore Masala Dosa": "mysore masala dosa",
  "Onion Uthappam": "uttapam onion south indian",
  "Chicken Biryani": "chicken biryani",
  "Mutton Biryani": "mutton biryani dum",
  "Vegetable Biryani": "vegetable biryani",
  "Curd Rice": "curd rice south indian",
  "South Indian Veg Meals": "south indian meals banana leaf",
  "Non-Veg Meals": "south indian non veg thali",
  "Mini Tiffin Combo": "south indian tiffin platter idli vada dosa",
  "Chettinad Chicken Curry": "chettinad chicken curry",
  "Mutton Chukka": "mutton chukka dry fry indian",
  "Kerala Fish Curry": "kerala fish curry",
  "Paneer Chettinad": "paneer masala curry",
  "Chicken 65": "chicken 65 indian starter",
  "Gobi 65": "gobi manchurian cauliflower fry",
  "Fish Fry": "indian fish fry",
  "Semiya Payasam": "semiya payasam vermicelli kheer",
  "Rava Kesari": "kesari bath rava sweet",
  "Mysore Pak": "mysore pak indian sweet",
  "Filter Coffee": "south indian filter coffee",
  "Buttermilk (Neer Mor)": "spiced buttermilk indian",
  "Fresh Lime Soda": "fresh lime soda",
}
const BANNER_QUERY: Record<string, string> = {
  "Weekend Biryani Feast": "biryani feast",
  "₹100 off orders above ₹500": "indian food spread table",
  "Filter coffee, all day": "south indian filter coffee tumbler",
}

type Photo = { id: number; width: number; height: number; url: string; alt?: string; photographer: string; photographer_url: string; src: { large: string; large2x: string } }

/** Words in a search that say what the dish is (not "south", "indian", "food"...). A photo whose description has them is a better match. */
const GENERIC = new Set(["south", "indian", "food", "breakfast", "starter", "sweet", "dry", "spiced", "fresh", "crispy", "platter", "with", "and"])
const wordsOf = (q: string) => q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !GENERIC.has(w))

/** Photos already used by this restaurant (this run or an earlier one), so two dishes never share a picture. */
const used = new Set<number>()

async function search(query: string): Promise<Photo | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${API}/search?query=${encodeURIComponent(query)}&per_page=30`, { headers: { Authorization: key! } })
    if (res.status === 401 || res.status === 403) throw new Error("Pexels rejected the API key (401/403). Check PEXELS_API_KEY.")
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)))
      continue
    }
    if (!res.ok) throw new Error(`Pexels search failed: ${res.status}`)
    const body = (await res.json()) as { photos?: Photo[] }
    const words = wordsOf(query)
    // Sharp enough for a desktop tile and not too tall or wide to crop to a square. Then the best description match, never a repeat.
    const fits = (body.photos ?? []).filter((p) => !used.has(p.id) && p.width >= 800 && p.width / p.height > 0.75 && p.width / p.height < 1.8)
    const score = (p: Photo) => words.filter((w) => (p.alt ?? "").toLowerCase().includes(w)).length
    const best = [...fits].sort((a, b) => score(b) - score(a))[0] ?? (body.photos ?? []).find((p) => !used.has(p.id)) ?? null
    return best
  }
  throw new Error("Pexels is rate limiting this key (200 requests an hour). Run again later; finished photos are kept.")
}

const keyOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
const credits: { what: string; query: string; photographer: string; photographerUrl: string; photoUrl: string }[] = []
const missed: string[] = []

async function fetchPhoto(what: string, query: string, objectKey: string): Promise<string | null> {
  const photo = await search(query)
  if (!photo) {
    missed.push(`${what} ("${query}")`)
    return null
  }
  used.add(photo.id)
  const img = await fetch(photo.src.large2x || photo.src.large)
  if (!img.ok) throw new Error(`Could not download the photo for ${what}: ${img.status}`)
  await storage.put(objectKey, Buffer.from(await img.arrayBuffer()), "image/jpeg")
  credits.push({ what, query, photographer: photo.photographer, photographerUrl: photo.photographer_url, photoUrl: photo.url })
  return storage.publicUrl(objectKey)
}

const hasPexels = (url: string | null) => Boolean(url && url.includes("-pexels"))

let dishes = 0
for (const item of await db.menuItems.select()) {
  if (!force && hasPexels(item.imageUrl)) continue
  const query = DISH_QUERY[item.name] ?? `${item.name} indian food`
  const url = await fetchPhoto(item.name, query, `dealers/${dealer.id}/menu/${keyOf(item.name)}-pexels.jpg`)
  if (url) {
    await db.menuItems.update({ imageUrl: url }, eq(menuItems.id, item.id))
    dishes++
    console.log(`  ${item.name}`)
  }
}

let bannerCount = 0
for (const b of await db.banners.select()) {
  if (!force && hasPexels(b.imageUrl)) continue
  const query = BANNER_QUERY[b.title]
  if (!query) continue
  const url = await fetchPhoto(`Banner: ${b.title}`, query, `dealers/${dealer.id}/banner/${keyOf(b.title)}-pexels.jpg`)
  if (url) {
    await db.banners.update({ imageUrl: url }, eq(banners.id, b.id))
    bannerCount++
    console.log(`  banner: ${b.title}`)
  }
}

if (credits.length) {
  mkdirSync("docs/staging", { recursive: true })
  const lines = [
    "# Photo credits",
    "",
    `Dish and banner photos for the test restaurant "${dealer.displayName}" (\`${slug}\`) come from [Pexels](https://www.pexels.com), free to use under the Pexels licence.`,
    "Written by `pnpm seed:photos`; the list only covers photos fetched in the latest run.",
    "",
    ...credits.map((c) => `- ${c.what}: [photo](${c.photoUrl}) by [${c.photographer}](${c.photographerUrl}) on Pexels`),
    "",
  ]
  writeFileSync("docs/staging/photo-credits.md", lines.join("\n"))
}
console.log(`Done: ${dishes} dish photos, ${bannerCount} banner photos for "${dealer.displayName}". Credits: docs/staging/photo-credits.md`)
if (missed.length) console.log(`No photo found for: ${missed.join("; ")}`)
process.exit(0)
