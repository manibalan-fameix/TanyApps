import { eq } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { dealers } from "../db/schema"
import type { IndustryKey } from "../verticals"

/** Ids of every business of one kind, for background jobs that loop over tenants. Jobs then work through scopedDb(id). */
export async function listDealerIdsByIndustry(industry: IndustryKey): Promise<string[]> {
  const rows = await unscopedDb.select({ id: dealers.id }).from(dealers).where(eq(dealers.industry, industry))
  return rows.map((r) => r.id)
}
