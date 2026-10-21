import { eq } from "drizzle-orm"

import type { BusinessHours } from "../hours"
import { unscopedDb } from "../db/client"
import { dealers } from "../db/schema"
import type { DealerTheme } from "../theme/tokens"

// `dealers` is the tenant root, so it is written by id here rather than through scopedDb. Callers pass the dealer id
// from the signed-in session, never from the request.

export async function setDealerHours(dealerId: string, hours: BusinessHours): Promise<void> {
  await unscopedDb.update(dealers).set({ businessHours: hours }).where(eq(dealers.id, dealerId))
}

export async function setDealerTheme(dealerId: string, theme: DealerTheme): Promise<void> {
  await unscopedDb.update(dealers).set({ theme }).where(eq(dealers.id, dealerId))
}
