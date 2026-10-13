import { eq, inArray } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { variants } from "../db/schema"
import type { VariantRow } from "./match"

// The variants table is shared master data, not tenant data, so it is read directly.
// It is small (hundreds of rows) and read-mostly: keep a short-lived copy per server instance.
let cache: { rows: VariantRow[]; at: number } | null = null
const TTL_MS = 5 * 60_000

export async function getAllVariants(): Promise<VariantRow[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows
  const rows = await unscopedDb
    .select({
      id: variants.id, make: variants.make, model: variants.model, variant: variants.variant,
      fuel: variants.fuel, transmission: variants.transmission, engineCc: variants.engineCc,
      yearFrom: variants.yearFrom, yearTo: variants.yearTo,
    })
    .from(variants)
  // An empty table is never cached, so importing the data takes effect straight away.
  if (rows.length > 0) cache = { rows, at: Date.now() }
  return rows
}

export type VariantFull = typeof variants.$inferSelect

export async function getVariantById(id: string): Promise<VariantFull | null> {
  const [row] = await unscopedDb.select().from(variants).where(eq(variants.id, id)).limit(1)
  return row ?? null
}

export async function getVariantsByIds(ids: string[]): Promise<VariantFull[]> {
  return ids.length ? unscopedDb.select().from(variants).where(inArray(variants.id, ids)) : []
}
