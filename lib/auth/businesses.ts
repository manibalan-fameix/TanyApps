import { LIVE_INDUSTRY_KEYS, canCreateVertical, type IndustryKey } from "../verticals"
import type { BusinessSummary } from "./active-business"

/** Live products the user has no business in yet and is allowed to start. */
export function addableProducts(businesses: readonly BusinessSummary[], email?: string | null): IndustryKey[] {
  const owned = new Set(businesses.map((b) => b.industry))
  return LIVE_INDUSTRY_KEYS.filter((k) => !owned.has(k) && canCreateVertical(k, email))
}
