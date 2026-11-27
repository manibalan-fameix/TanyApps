import type { IndustryKey } from "../verticals"

/**
 * Products whose businesses are offered their own domain. Motos only for now. Before adding another, check it on a real domain:
 * ordering sites also have customer sign-in, carts, payments, maps and live delivery tracking (docs/custom-domains.md).
 */
const CUSTOM_DOMAIN_INDUSTRIES: readonly IndustryKey[] = ["motors"]

export const offersCustomDomain = (industry: IndustryKey) => CUSTOM_DOMAIN_INDUSTRIES.includes(industry)
