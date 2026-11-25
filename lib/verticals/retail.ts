import type { Vertical } from "./types"

/**
 * TanyRetail: shops and supermarkets. It runs on the same ordering engine as TanyEats (catalogue, categories, cart, checkout, delivery,
 * riders, coupons, inventory, payments), so the data model is shared. What differs is vocabulary and defaults, which come from the shop's
 * business type (lib/verticals/retail-types.ts) chosen in onboarding.
 * Razorpay: UNVERIFIED. `retail` / `general_retail` is a guess at Route's category list (the Eats and Motors values were once wrong the same
 * way, see docs/tanycabs/DECISIONS.md). Check it against the list before the first linked account is created.
 */
export const retail: Vertical = {
  key: "retail",
  product: "tanyretail",
  label: "Retail",
  blurb: "Shops, supermarkets, textile and hardware stores. Share your range and take orders.",
  businessNoun: "shop",
  pageNoun: "store page",
  itemNoun: "products",
  customerNoun: "customers",
  nameLabel: "Shop name",
  namePlaceholder: "Sri Murugan Stores",
  previewName: "Your Shop",
  phoneLabel: "Mobile number customers can call",
  firstItemCta: "Add your first product",
  firstItemHref: "/menu/new",
  adminReady: true,
  planLimit: "menu_items",
  offeredPlans: ["free", "starter", "growth", "pro"],
  razorpay: { category: "retail", subcategory: "general_retail" },
  paymentsPurpose: "customers can pay for their orders online",
  tenantMobileNav: false,
  liveMessage: "Your store page has its own link. Share it on WhatsApp and Instagram, and print it as a QR code for your counter.",
  welcomeCta: "Add my first product",
  welcomeSteps: [
    "Add your products and group them into categories.",
    "Share your store link on WhatsApp and Instagram, or print it as a QR code for your counter.",
    "Watch orders and customer messages arrive here.",
  ],
}
