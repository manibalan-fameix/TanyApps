import { eq } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { dealers } from "../db/schema"
import type { IndustryKey } from "../verticals"

/** Ids of every business of one kind, for background jobs that loop over tenants. Jobs then work through scopedDb(id). */
export async function listDealerIdsByIndustry(industry: IndustryKey): Promise<string[]> {
  const rows = await unscopedDb.select({ id: dealers.id }).from(dealers).where(eq(dealers.industry, industry))
  return rows.map((r) => r.id)
}

/** The id, name and phone of every business of one kind, for jobs that message each business's owner. */
export async function listDealerContactsByIndustry(industry: IndustryKey): Promise<{ id: string; displayName: string; phone: string | null }[]> {
  return unscopedDb.select({ id: dealers.id, displayName: dealers.displayName, phone: dealers.phone }).from(dealers).where(eq(dealers.industry, industry))
}
