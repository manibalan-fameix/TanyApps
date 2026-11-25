import { requireIndustry } from "../core/guards"
import { ORDER_INDUSTRIES } from "../verticals"

/** For restaurant admin pages: sends everyone else (signed out, no business, or another industry) away. */
export const requireRestaurant = () => requireIndustry(ORDER_INDUSTRIES)
