/**
 * The industries a tenant can run on the platform. This is also the Postgres enum `industry` (see lib/db/schema/enums.ts),
 * so it has no imports. A new vertical adds its key here, then `ALTER TYPE industry ADD VALUE '...'` in its own migration.
 */
export const INDUSTRY_KEYS = ["motors", "restaurants", "cabs"] as const
export type IndustryKey = (typeof INDUSTRY_KEYS)[number]

export const DEFAULT_INDUSTRY: IndustryKey = "motors"
