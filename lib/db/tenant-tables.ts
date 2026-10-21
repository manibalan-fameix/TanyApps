import {
  accounts,
  banners,
  bookings,
  carMedia,
  carViews,
  cars,
  coupons,
  cronRuns,
  dealerDomains,
  dealerUsers,
  dealers,
  deliveryPartners,
  deliveryZones,
  enquiries,
  leads,
  menuCategories,
  menuItems,
  orderLocations,
  orders,
  priceEvents,
  rcLookups,
  rcTransfers,
  reviews,
  stockAdjustments,
  users,
  variants,
} from "./schema/index.ts"

/**
 * The allow-list of tenant data. scopedDb() builds one scoped repository per entry, and tests/tenant-leak.test.ts fails
 * when a schema table is in none of the lists below. So a new table is either scoped or consciously declared global; it
 * can never be silently unscoped.
 *
 * A vertical adds its tables to its own group. Every new table carries `dealer_id` and goes in a DIRECT group.
 */

/** Tables every industry uses. */
const PLATFORM_DIRECT = { dealerUsers, dealerDomains, coupons, reviews, enquiries, banners } as const

/** TanyMotos. */
const MOTORS_DIRECT = { cars, leads, bookings } as const

/** TanyEats. */
const EATS_DIRECT = { menuCategories, menuItems, orders, deliveryPartners, deliveryZones, stockAdjustments, orderLocations } as const

/** Tables carrying their own dealer_id. */
export const DIRECT_TENANT_TABLES = { ...PLATFORM_DIRECT, ...MOTORS_DIRECT, ...EATS_DIRECT } as const

/** Tables owned through a car (car_id). Scoped by an ownership subquery on cars. TanyMotos only: new tables use dealer_id. */
export const CHILD_TENANT_TABLES = { carMedia, rcLookups, carViews, rcTransfers, priceEvents } as const

/**
 * Tables that are deliberately not tenant-scoped: the tenant root itself, authentication, and shared reference data. Code
 * reads them only through lib/tenant, lib/auth and lib/variants (the raw client is blocked everywhere else by ESLint).
 */
export const GLOBAL_TABLES = { dealers, users, accounts, variants, cronRuns } as const
