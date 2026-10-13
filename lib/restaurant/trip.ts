import { and, eq } from "drizzle-orm"

import { decrypt, encrypt } from "../crypto"
import { orders } from "../db/schema"
import { scopedDb } from "../db/scoped"
import { TOKEN_RE, hashRiderToken, newRiderToken, riderLinkOpen } from "./tracking"

type Order = typeof orders.$inferSelect

/** The delivery a rider's private link opens, or null when the link is wrong, unknown, cancelled or long finished. */
export async function orderByRiderToken(dealerId: string, token: string): Promise<Order | null> {
  if (!TOKEN_RE.test(token)) return null
  const hash = await hashRiderToken(token)
  const [order] = await scopedDb(dealerId).orders.select(eq(orders.riderTokenHash, hash), { limit: 1 })
  return order && order.partnerId && riderLinkOpen(order) ? order : null
}

/**
 * The rider's link for an order: the existing one, so "send again" never breaks a link the rider already has, or a
 * new one when there is none yet. Giving the order to a different rider clears it first (see `forgetRiderLink`).
 */
export async function issueRiderToken(dealerId: string, order: Pick<Order, "id" | "riderTokenEnc">): Promise<string> {
  if (order.riderTokenEnc) {
    try {
      return decrypt(order.riderTokenEnc)
    } catch {
      // Unreadable (a rotated key): fall through and make a new one.
    }
  }
  const token = newRiderToken()
  await scopedDb(dealerId).orders.update({ riderTokenHash: await hashRiderToken(token), riderTokenEnc: encrypt(token), riderAssignedAt: new Date() }, eq(orders.id, order.id))
  return token
}

/** A new rider means a new link: the previous rider's link stops working at once. */
export async function forgetRiderLink(dealerId: string, orderId: string) {
  await scopedDb(dealerId).orders.update({ riderTokenHash: null, riderTokenEnc: null, riderAssignedAt: null }, and(eq(orders.id, orderId))!)
}
