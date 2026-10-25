/**
 * Which of the signed-in user's businesses (one per product) the admin is showing. A session cookie, so every new
 * sign-in asks again. It is only a preference: `getDealerContext` honours it solely when the user is a member of that
 * business, so a forged value changes nothing.
 */
export const ACTIVE_BUSINESS_COOKIE = "tany-active-business"

/** What the product chooser and the sidebar switcher need to show one business. Never carries anything sensitive. */
export type BusinessSummary = {
  id: string
  name: string
  industry: string
  logoUrl: string | null
}
