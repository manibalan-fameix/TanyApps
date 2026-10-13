import { eq } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { dealers } from "../db/schema"

export type DealerRouteAccount = Pick<typeof dealers.$inferSelect, "id" | "razorpayAccountId" | "razorpayAccountStatus">

export async function getDealerRouteAccount(dealerId: string): Promise<DealerRouteAccount | null> {
  const [row] = await unscopedDb
    .select({ id: dealers.id, razorpayAccountId: dealers.razorpayAccountId, razorpayAccountStatus: dealers.razorpayAccountStatus })
    .from(dealers)
    .where(eq(dealers.id, dealerId))
    .limit(1)
  return row ?? null
}

export async function updateDealerRouteAccount(dealerId: string, update: Partial<Pick<DealerRouteAccount, "razorpayAccountId" | "razorpayAccountStatus">>): Promise<void> {
  await unscopedDb.update(dealers).set(update).where(eq(dealers.id, dealerId))
}

export async function getDealerRouteAccountByAccountId(accountId: string): Promise<DealerRouteAccount | null> {
  const [row] = await unscopedDb
    .select({ id: dealers.id, razorpayAccountId: dealers.razorpayAccountId, razorpayAccountStatus: dealers.razorpayAccountStatus })
    .from(dealers)
    .where(eq(dealers.razorpayAccountId, accountId))
    .limit(1)
  return row ?? null
}
