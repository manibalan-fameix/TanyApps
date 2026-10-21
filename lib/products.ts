import { type IndustryKey, verticalList } from "@/lib/verticals"

/** Every TanyApps product. Brand files live in /public/brand as `<key>-icon.svg` and `<key>-wordmark.svg`. */
export const PRODUCTS = [
  { key: "tanymotos", name: "TanyMotos", blurb: "Used car and bike dealers. List vehicles and take test drive bookings.", industry: "motors" },
  { key: "tanyeats", name: "TanyEats", blurb: "Restaurants, cafes and cloud kitchens. Share your menu and take orders.", industry: "restaurants" },
  { key: "tanycabs", name: "TanyCabs", blurb: "Taxi and cab operators. Take ride bookings and manage drivers.", industry: "cabs" },
  { key: "tanyecom", name: "TanyEcom", blurb: "Online stores. Sell products with a catalogue and checkout." },
  { key: "tanyexpert", name: "TanyExpert", blurb: "Consultants and professionals. Share your profile and take appointments." },
  { key: "tanygaming", name: "TanyGaming", blurb: "Gaming cafes and game stores. Manage slots, tournaments and sales." },
  { key: "tanygarage", name: "TanyGarage", blurb: "Garages and service centres. Book services and track repairs." },
  { key: "tanymeat", name: "TanyMeat", blurb: "Meat and fish shops. Share your daily stock and take orders." },
  { key: "tanymeds", name: "TanyMeds", blurb: "Pharmacies and medical stores. Take prescriptions and orders." },
  { key: "tanyretail", name: "TanyRetail", blurb: "Local shops and supermarkets. Showcase your range and take orders." },
  { key: "tanysalon", name: "TanySalon", blurb: "Salons and spas. Share services and take appointments." },
  { key: "tanysport", name: "TanySport", blurb: "Turfs, courts and sports clubs. Manage slot bookings and memberships." },
] as const satisfies readonly {
  key: string
  name: string
  blurb: string
  industry?: IndustryKey
}[]

export type ProductKey = (typeof PRODUCTS)[number]["key"]

/** Product behind each industry, derived from the vertical registry. */
export const INDUSTRY_PRODUCT = Object.fromEntries(verticalList.map((v) => [v.key, v.product])) as Record<IndustryKey, ProductKey>

/** Captions for the explore step's side panel, shown in order for products without an animated story. */
export const PRODUCT_STORY: Record<ProductKey, readonly string[]> = {
  tanymotos: ["Set up your showroom online in minutes", "List every car and bike with photos and prices", "Take test drive bookings straight from buyers", "Keep every rupee, zero marketplace commission"],
  tanyeats: ["Set up your restaurant online in 3 minutes", "Share your menu with a link and a QR code", "Take orders directly from your guests", "Keep every rupee, zero aggregator commission"],
  tanycabs: ["Put your cab service online in minutes", "Share fares, vehicles and service areas", "Take ride bookings around the clock", "Assign drivers and track every trip"],
  tanyecom: ["Open your online store in minutes", "Add products with photos, prices and variants", "Take orders and payments at checkout", "Ship, track and grow without a marketplace cut"],
  tanyexpert: ["Put your practice online in minutes", "Share your profile, services and experience", "Let clients book appointments themselves", "Get reminders and follow-ups handled for you"],
  tanygaming: ["Set up your gaming cafe online in minutes", "Show your machines, games and pricing", "Let players book slots and join tournaments", "Track sales and peak hours in one place"],
  tanygarage: ["Put your garage online in minutes", "List your services with clear prices", "Take service bookings from vehicle owners", "Update customers as each repair progresses"],
  tanymeat: ["Open your meat and fish shop online", "Share today's stock, cuts and prices", "Take orders for pickup and delivery", "Update availability as the day goes on"],
  tanymeds: ["Put your pharmacy online in minutes", "Let customers upload prescriptions", "Confirm availability and take orders", "Offer pickup and home delivery"],
  tanyretail: ["Put your local shop online in minutes", "Showcase your range with photos and prices", "Take orders on WhatsApp and your own page", "Keep customers coming back with offers"],
  tanysalon: ["Set up your salon online in minutes", "Share your services, prices and team", "Let clients book appointments themselves", "Cut no-shows with automatic reminders"],
  tanysport: ["Put your turf or court online in minutes", "Show your grounds, slots and pricing", "Take slot bookings and memberships", "Fill empty hours with smart offers"],
}

/** Businesses each product suits, shown as tags in the explore step. */
export const PRODUCT_AUDIENCE: Record<ProductKey, readonly string[]> = {
  tanymotos: ["Used car dealers", "Bike dealers", "Showrooms"],
  tanyeats: ["Restaurants", "Cafes", "Cloud kitchens"],
  tanycabs: ["Taxi operators", "Cab fleets", "Drivers"],
  tanyecom: ["Online stores", "D2C brands", "Home sellers"],
  tanyexpert: ["Consultants", "Coaches", "Professionals"],
  tanygaming: ["Gaming cafes", "Game stores", "Esports arenas"],
  tanygarage: ["Garages", "Service centres", "Car wash"],
  tanymeat: ["Meat shops", "Fish shops", "Poultry"],
  tanymeds: ["Pharmacies", "Medical stores", "Clinics"],
  tanyretail: ["Local shops", "Supermarkets", "Grocers"],
  tanysalon: ["Salons", "Spas", "Barbers"],
  tanysport: ["Turfs", "Courts", "Sports clubs"],
}

/** Products with an animated how-it-works page in /public/brand (`<key>-how-it-works.html`). */
export const HOW_IT_WORKS: readonly ProductKey[] = ["tanymotos", "tanyeats", "tanycabs", "tanyecom", "tanyexpert", "tanygaming", "tanygarage"]

/** One-line examples for "Find my Tany", one per product. `focus` is the business itself, shown bolder. */
export const PRODUCT_EXAMPLES: Record<ProductKey, { lead: string; focus: string }> = {
  tanymotos: { lead: "I sell ", focus: "used cars" },
  tanyeats: { lead: "I run a ", focus: "restaurant" },
  tanycabs: { lead: "I run a ", focus: "taxi service" },
  tanyecom: { lead: "I sell ", focus: "gifts online" },
  tanyexpert: { lead: "I am a ", focus: "business consultant" },
  tanygaming: { lead: "I own a ", focus: "gaming cafe" },
  tanygarage: { lead: "I run a ", focus: "car repair garage" },
  tanymeat: { lead: "I sell ", focus: "fresh chicken and fish" },
  tanymeds: { lead: "I own a ", focus: "medical store" },
  tanyretail: { lead: "I run a ", focus: "grocery shop" },
  tanysalon: { lead: "I own a ", focus: "salon" },
  tanysport: { lead: "I run a ", focus: "cricket turf" },
}
