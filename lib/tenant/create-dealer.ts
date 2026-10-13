import { eq } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { dealerUsers, dealers } from "../db/schema"
import { type OnboardInput, toDealerValues } from "../dealers/onboard"

export async function isSlugTaken(slug: string): Promise<boolean> {
  const [row] = await unscopedDb.select({ id: dealers.id }).from(dealers).where(eq(dealers.slug, slug)).limit(1)
  return Boolean(row)
}

/** Creates a dealership and makes `userId` its owner. Throws with Postgres code 23505 if the slug is taken. */
export async function createDealerForOwner(userId: string, input: OnboardInput, logoUrl?: string): Promise<string> {
  return unscopedDb.transaction(async (tx) => {
    const [dealer] = await tx.insert(dealers).values(toDealerValues(input, logoUrl)).returning({ id: dealers.id })
    await tx.insert(dealerUsers).values({ dealerId: dealer.id, userId, role: "owner" })
    return dealer.id
  })
}
