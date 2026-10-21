import type { ProductKey } from "../products"
import type { IndustryKey } from "./keys"

/** How a vertical's plan limit is counted. Plan numbers live in lib/plans.ts. */
export type PlanLimitKind = "live_cars" | "menu_items" | "vehicles"

/**
 * Everything that differs by industry and is plain data. Anything that needs icons, JSX or a database lives next to the
 * feature (for example admin navigation in components/admin/nav-config.ts, keyed by IndustryKey), not here, so this module
 * stays importable from the server, the browser and the proxy.
 */
export type Vertical = {
  key: IndustryKey
  product: ProductKey
  label: string
  /** One line on the industry card. */
  blurb: string
  /** What the business is called: "dealership", "restaurant". */
  businessNoun: string
  /** What the public page is called: "showroom", "menu page". */
  pageNoun: string
  /** What the customer-facing listings are: "cars", "dishes". */
  itemNoun: string
  /** What the business's customers are called, lower case: "buyers", "guests". */
  customerNoun: string
  nameLabel: string
  namePlaceholder: string
  /** Placeholder business name in the onboarding preview. */
  previewName: string
  /** Label for the phone customers call. */
  phoneLabel: string
  /** Shown on the share page and first-run prompt after onboarding. */
  firstItemCta: string
  /** Where "first item" leads. */
  firstItemHref: string
  /** Whether the admin and public pages for this industry are built and the industry can be chosen in onboarding. */
  adminReady: boolean
  planLimit: PlanLimitKind
  /** The category Razorpay files this kind of business's linked account under. */
  razorpay: { category: string; subcategory: string }
  /** What the owner's customers pay for online, finishing "so ... can ...". */
  paymentsPurpose: string
  /** Whether the public site shows the dealer-style bottom bar. */
  tenantMobileNav: boolean
  /** Text after onboarding says the business is live. */
  liveMessage: string
  /** Button on the first-run dialog. */
  welcomeCta: string
  welcomeSteps: readonly string[]
}
