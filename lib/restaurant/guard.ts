import { requireIndustry } from "../core/guards"

/** For restaurant admin pages: sends everyone else (signed out, no business, or another industry) away. */
export const requireRestaurant = () => requireIndustry("restaurants")
