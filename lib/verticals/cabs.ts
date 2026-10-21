import type { Vertical } from "./types"

/**
 * TanyCabs. Live and selectable by every signed-in operator.
 * Razorpay: `transport` / `cab_hailing` is the only taxi entry in Razorpay's Route category list (checked 2026-10-21).
 * Plan limits are the owner's, set 2026-10-21. There is no free plan; the trial is the standard 30 days.
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
  firstItemHref: "/cabs/vehicles",
  adminReady: true,
  planLimit: "vehicles",
  offeredPlans: ["starter", "growth", "pro"],
  // The owner's cab prices, set 2026-10-21: Starter 3,999, Growth 7,999, Pro 14,999 a month.
  planPrices: { starter: 3_999, growth: 7_999, pro: 14_999 },
  // Yearly is 11 months for 12, as for cars and restaurants (the owner confirmed 2026-10-21): no override here.
  // Vehicles and drivers are hard limits (adding more is blocked with an upgrade prompt). Bookings are a soft limit: a
  // customer booking is never refused; the operator sees a banner at 80% and 100% of the month's allowance.
  cabLimits: {
    starter: { vehicles: 10, drivers: 15, bookingsPerMonth: 400 },
    growth: { vehicles: 30, drivers: 45, bookingsPerMonth: 1_500 },
    pro: { vehicles: 75, drivers: 110, bookingsPerMonth: 4_000 },
  },
  razorpay: { category: "transport", subcategory: "cab_hailing" },
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
