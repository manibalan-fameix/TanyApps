import type { Vertical } from "./types"

export const motors: Vertical = {
  key: "motors",
  product: "tanymotos",
  label: "Motors",
  blurb: "Used car and bike dealers. List vehicles and take test drive bookings.",
  businessNoun: "dealership",
  pageNoun: "showroom",
  itemNoun: "cars",
  customerNoun: "buyers",
  nameLabel: "Dealership name",
  namePlaceholder: "Sri Murugan Motors",
  previewName: "Your Dealership",
  phoneLabel: "Mobile number buyers can call",
  firstItemCta: "Add your first car",
  firstItemHref: "/cars/new",
  adminReady: true,
  planLimit: "live_cars",
  offeredPlans: ["free", "starter", "growth", "pro"],
  // Razorpay's list has no "automobile" category; car dealers are an ecommerce subcategory (checked 2026-10-21).
  razorpay: { category: "ecommerce", subcategory: "automobile_and_truck_dealers" },
  paymentsPurpose: "buyers can pay a booking amount online",
  tenantMobileNav: true,
  liveMessage: "Your showroom has its own link. Add a car and share it on WhatsApp and Instagram.",
  welcomeCta: "Add my first car",
  welcomeSteps: [
    "Add your first car from a plate photo, a video or by voice.",
    "Share its link on WhatsApp and Instagram.",
    "Watch leads and test-drive bookings arrive here.",
  ],
}
