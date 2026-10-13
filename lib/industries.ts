/**
 * The kinds of business a tenant can run on the platform. Everything that differs by industry in
 * onboarding (names, labels, preview) reads from here so a new industry is one more entry.
 */
export const INDUSTRY_KEYS = ["motors", "restaurants"] as const
export type IndustryKey = (typeof INDUSTRY_KEYS)[number]

export const DEFAULT_INDUSTRY: IndustryKey = "motors"

export type Industry = {
  key: IndustryKey
  label: string
  /** One line on the industry card. */
  blurb: string
  /** What the business is called: "dealership", "restaurant". */
  businessNoun: string
  /** What the public page is called: "showroom", "menu page". */
  pageNoun: string
  /** What the customer-facing listings are: "cars", "dishes". */
  itemNoun: string
  nameLabel: string
  namePlaceholder: string
  /** Label for the phone customers call. */
  phoneLabel: string
  /** Shown on the share page and first-run prompt after onboarding. */
  firstItemCta: string
  /** Where "first item" leads. Restaurants add a dish. */
  firstItemHref: string
  /** Whether the admin and public pages for this industry are built yet. */
  adminReady: boolean
}

export const INDUSTRIES: Record<IndustryKey, Industry> = {
  motors: {
    key: "motors",
    label: "Motors",
    blurb: "Used car and bike dealers. List vehicles and take test drive bookings.",
    businessNoun: "dealership",
    pageNoun: "showroom",
    itemNoun: "cars",
    nameLabel: "Dealership name",
    namePlaceholder: "Sri Murugan Motors",
    phoneLabel: "Mobile number buyers can call",
    firstItemCta: "Add your first car",
    firstItemHref: "/cars/new",
    adminReady: true,
  },
  restaurants: {
    key: "restaurants",
    label: "Restaurants",
    blurb: "Restaurants, cafes and cloud kitchens. Share your menu and take table or order enquiries.",
    businessNoun: "restaurant",
    pageNoun: "menu page",
    itemNoun: "dishes",
    nameLabel: "Restaurant name",
    namePlaceholder: "Annapoorna Kitchen",
    phoneLabel: "Mobile number guests can call",
    firstItemCta: "Add your first dish",
    firstItemHref: "/menu/new",
    adminReady: true,
  },
}

export const industryList = INDUSTRY_KEYS.map((k) => INDUSTRIES[k])

export function getIndustry(key: string | null | undefined): Industry {
  return INDUSTRIES[(key as IndustryKey) in INDUSTRIES ? (key as IndustryKey) : DEFAULT_INDUSTRY]
}
