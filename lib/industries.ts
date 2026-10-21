/**
 * Compatibility layer: the industry definitions now live in the vertical registry (lib/verticals). New code should import
 * from "@/lib/verticals" directly; these names keep existing imports working.
 */
import { VERTICALS, getVertical, verticalList, type Vertical } from "./verticals"

export { DEFAULT_INDUSTRY, INDUSTRY_KEYS, LIVE_INDUSTRY_KEYS, type IndustryKey } from "./verticals"

export type Industry = Vertical
export const INDUSTRIES = VERTICALS
export const industryList = verticalList
export const getIndustry = getVertical
