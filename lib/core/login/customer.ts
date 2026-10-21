import { eq } from "drizzle-orm"
import { cookies } from "next/headers"

import { customers } from "../../db/schema"
import { scopedDb } from "../../db/scoped"
import { readSession, sessionCookieName } from "./customer-session"

export type SignedInCustomer = typeof customers.$inferSelect

/**
 * The customer behind this request's session cookie at this business, or null. The cookie must be genuine, unexpired, issued for
 * THIS business, and its version must still match the customer's (bumping the version signs them out everywhere).
 */
export async function currentCustomer(dealerId: string): Promise<SignedInCustomer | null> {
  const token = (await cookies()).get(sessionCookieName())?.value
  return customerFromToken(dealerId, token)
}

export async function customerFromToken(dealerId: string, token: string | null | undefined): Promise<SignedInCustomer | null> {
  const s = await readSession(token, dealerId)
  if (!s || !/^[0-9a-f-]{36}$/.test(s.cid)) return null // sessions from before customers existed are not valid
  const [c] = await scopedDb(dealerId).customers.select(eq(customers.id, s.cid), { limit: 1 })
  return c && c.sessionVersion === s.v ? c : null
}
