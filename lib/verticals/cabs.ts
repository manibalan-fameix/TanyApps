import type { Vertical } from "./types"

/**
 * TanyCabs. Registered so the type system knows about it, but `adminReady` is false: it cannot be chosen in onboarding
 * until Phase 1 builds its admin and public pages. The Razorpay category is a placeholder to confirm against Razorpay's
 * category list before the first cab operator is onboarded (see docs/tanycabs/DECISIONS.md).
 */
export const cabs: Vertical = {
  key: "cabs",
  product: "tanycabs",
  label: "Cabs",
  blurb: "Taxi and cab operators. Take ride bookings and manage drivers.",
  businessNoun: "cab service",
  pageNoun: "booking page",
  itemNoun: "vehicles",
  customerNoun: "travellers",
  nameLabel: "Cab service name",
  namePlaceholder: "Anna Travels",
  previewName: "Your Cab Service",
  phoneLabel: "Mobile number travellers can call",
  firstItemCta: "Add your first vehicle",
  firstItemHref: "/cabs/fleet",
  adminReady: false,
  planLimit: "vehicles",
  razorpay: { category: "transport", subcategory: "taxi" },
  paymentsPurpose: "travellers can pay for their trips online",
  tenantMobileNav: false,
  liveMessage: "Your booking page has its own link. Share it on WhatsApp and Instagram.",
  welcomeCta: "Add my first vehicle",
  welcomeSteps: [
    "Add your vehicle classes and fares.",
    "Share your booking link on WhatsApp and Instagram.",
    "Watch ride bookings arrive here.",
  ],
}
