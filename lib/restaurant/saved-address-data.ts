import { desc, eq } from "drizzle-orm"

import { tryDecrypt } from "../crypto"
import { customerAddresses } from "../db/schema"
import { scopedDb } from "../db/scoped"
import { decodeAddress, type SavedAddress } from "./saved-address"

/** One customer's saved addresses at one business, newest first. Server only. */
export async function savedAddressesFor(dealerId: string, customerId: string): Promise<SavedAddress[]> {
  const rows = await scopedDb(dealerId).customerAddresses.select(eq(customerAddresses.customerId, customerId), { orderBy: [desc(customerAddresses.createdAt)] })
  return rows.flatMap((r) => decodeAddress(r, tryDecrypt(r.addressEnc, dealerId)) ?? [])
}
