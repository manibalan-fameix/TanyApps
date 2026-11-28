import type { IndustryKey } from "../verticals"

/**
 * Products whose businesses are offered their own domain: all of them. Taking one off this list hides the menu and stops new
 * connections for it. What to check for each product on a real domain is in docs/custom-domains.md.
 */
const CUSTOM_DOMAIN_INDUSTRIES: readonly IndustryKey[] = ["motors", "restaurants", "retail", "cabs"]

export const offersCustomDomain = (industry: IndustryKey) => CUSTOM_DOMAIN_INDUSTRIES.includes(industry)
