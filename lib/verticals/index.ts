import { cabs } from "./cabs"
import { DEFAULT_INDUSTRY, INDUSTRY_KEYS, type IndustryKey } from "./keys"
import { motors } from "./motors"
import { restaurants } from "./restaurants"
import { retail } from "./retail"
import type { Vertical } from "./types"

export { DEFAULT_INDUSTRY, INDUSTRY_KEYS, type IndustryKey } from "./keys"
export type { CabPlanLimits, PlanLimitKind, Vertical } from "./types"
export { RETAIL_TYPES, RETAIL_TYPE_KEYS, DEFAULT_RETAIL_TYPE, retailTypeList, getRetailType, isRetailType, type RetailType, type RetailTypeKey } from "./retail-types"
export { storeTerms, type StoreTerms } from "./terms"
export { allowedEmails, canCreateVertical, industriesFor } from "./flags"

/** One entry per industry. `Record<IndustryKey, ...>` makes a new key fail to compile until it is registered here. */
export const VERTICALS: Record<IndustryKey, Vertical> = { motors, restaurants, cabs, retail }

export const verticalList: Vertical[] = INDUSTRY_KEYS.map((k) => VERTICALS[k])

/** Industries that can be chosen in onboarding today. */
export const LIVE_INDUSTRY_KEYS = INDUSTRY_KEYS.filter((k) => VERTICALS[k].adminReady) as [IndustryKey, ...IndustryKey[]]

export const isIndustryKey = (value: unknown): value is IndustryKey => typeof value === "string" && value in VERTICALS

/** The vertical for a stored industry value. Anything unknown (older rows, a typo) is treated as the default. */
export function getVertical(key: string | null | undefined): Vertical {
  return isIndustryKey(key) ? VERTICALS[key] : VERTICALS[DEFAULT_INDUSTRY]
}

/**
 * Industries that run on the ordering engine (menu or catalogue, cart, checkout, delivery, riders). Guards and routes that used to
 * check for "restaurants" alone check for this family instead, so TanyEats and TanyRetail share one backend.
 */
export const ORDER_INDUSTRIES = ["restaurants", "retail"] as const satisfies readonly IndustryKey[]
export type OrderIndustry = (typeof ORDER_INDUSTRIES)[number]
export const isOrderIndustry = (value: unknown): value is OrderIndustry => (ORDER_INDUSTRIES as readonly unknown[]).includes(value)
