import { index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core"

import type { BusinessHours } from "../../hours"
import type { DealerTheme } from "../../theme/tokens"
import { dealerRole, industry } from "./enums.ts"
import { users } from "./auth.ts"

export const dealers = pgTable("dealers", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  /** Kind of business (see lib/industries.ts). Every row created before industries existed is a motors dealer. */
  industry: industry("industry").notNull().default("motors"),
  /** Restaurant ordering rules (see lib/restaurant/settings.ts). Null until the owner changes the defaults. */
  /** Public storefront text: tagline, story, address, email (see lib/restaurant/profile.ts). */
  profile: jsonb("profile").$type<Record<string, unknown>>(),
  /** Where the business is and how far it serves (see lib/restaurant/service-area.ts). Null until the owner sets it. */
  serviceArea: jsonb("service_area").$type<Record<string, unknown>>(),
  orderSettings: jsonb("order_settings").$type<Record<string, unknown>>(),
  logoUrl: text("logo_url"),
  theme: jsonb("theme").$type<DealerTheme>().notNull(),
  plan: text("plan").notNull().default("starter"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  /** Razorpay subscription id and its last known status (created, authenticated, active, ...). */
  /** A plan change bought mid-period: it takes over at `nextPlanStartsAt`, when the period already paid for ends. */
  nextPlan: text("next_plan"),
  nextBillingCycle: text("next_billing_cycle"),
  nextPlanStartsAt: timestamp("next_plan_starts_at", { withTimezone: true }),
  /** Set when the owner cancels. Access continues until the period already covered ends. */
  cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
  /** End of the period the last successful charge covers. */
  paidThrough: timestamp("paid_through", { withTimezone: true }),
  subscriptionId: text("subscription_id"),
  subscriptionStatus: text("subscription_status"),
  city: text("city").notNull().default("Chennai"),
  phone: text("phone"),
  // Added beyond the spec: test-drive slots come from configured hours (7.2).
  businessHours: jsonb("business_hours").$type<BusinessHours>(),
  /** Razorpay Route linked account: buyer booking payments transfer here, not into our balance. */
  razorpayAccountId: text("razorpay_account_id"),
  /** Mirrors Razorpay's account/product state: created, needs_clarification, activated, suspended. */
  razorpayAccountStatus: text("razorpay_account_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const dealerDomains = pgTable(
  "dealer_domains",
  {
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => [index("dealer_domains_dealer_idx").on(t.dealerId)],
)

export const dealerUsers = pgTable(
  "dealer_users",
  {
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: dealerRole("role").notNull().default("staff"),
  },
  (t) => [primaryKey({ columns: [t.dealerId, t.userId] }), index("dealer_users_user_idx").on(t.userId)],
)
