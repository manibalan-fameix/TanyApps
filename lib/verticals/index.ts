import { cabs } from "./cabs"
import { DEFAULT_INDUSTRY, INDUSTRY_KEYS, type IndustryKey } from "./keys"
import { motors } from "./motors"
import { restaurants } from "./restaurants"
import type { Vertical } from "./types"

export { DEFAULT_INDUSTRY, INDUSTRY_KEYS, type IndustryKey } from "./keys"
export type { PlanLimitKind, Vertical } from "./types"

/** One entry per industry. `Record<IndustryKey, ...>` makes a new key fail to compile until it is registered here. */
export const VERTICALS: Record<IndustryKey, Vertical> = { motors, restaurants, cabs }

export const verticalList: Vertical[] = INDUSTRY_KEYS.map((k) => VERTICALS[k])

/** Industries that can be chosen in onboarding today. */
export const LIVE_INDUSTRY_KEYS = INDUSTRY_KEYS.filter((k) => VERTICALS[k].adminReady) as [IndustryKey, ...IndustryKey[]]

export const isIndustryKey = (value: unknown): value is IndustryKey => typeof value === "string" && value in VERTICALS

/** The vertical for a stored industry value. Anything unknown (older rows, a typo) is treated as the default. */
export function getVertical(key: string | null | undefined): Vertical {
  return isIndustryKey(key) ? VERTICALS[key] : VERTICALS[DEFAULT_INDUSTRY]
}
