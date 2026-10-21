import { isAuthConfigured } from "./index"
import type { dealers } from "../db/schema"
import { DEFAULT_THEME } from "../theme/tokens"

export const DEV_BYPASS_COOKIE = "dev-bypass"

/**
 * Local development only, and only while Google sign-in is not configured (or while the browser tests run: E2E=1 lets the
 * operator's demo sign-in coexist with the Firebase emulator the customer login needs).
 * Hard-gated on NODE_ENV so it can never be active in a production build.
 */
export const isDevBypassEnabled = () => process.env.NODE_ENV === "development" && (!isAuthConfigured() || process.env.E2E === "1")

export const DEV_USER = { id: "dev-user", name: "Dev Owner", email: "dev@localhost" }

export const DEV_DEALER: typeof dealers.$inferSelect = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "sri-murugan",
  displayName: "Sri Murugan Motors",
  industry: "motors",
  orderSettings: null,
  profile: null,
  serviceArea: null,
  logoUrl: null,
  theme: DEFAULT_THEME,
  plan: "starter",
  billingCycle: "monthly",
  trialEndsAt: null,
  paidThrough: null,
  cancelRequestedAt: null,
  nextPlan: null,
  nextBillingCycle: null,
  nextPlanStartsAt: null,
  subscriptionId: null,
  subscriptionStatus: null,
  city: "Chennai",
  phone: null,
  businessHours: null,
  razorpayAccountId: null,
  razorpayAccountStatus: null,
  createdAt: new Date(0),
}
