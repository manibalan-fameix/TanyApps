"use server"

import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { tenantContext } from "@/lib/core/guards"
import { currentCustomer } from "@/lib/core/login/customer"
import { pinAgreement } from "@/lib/core/geo/pin-check"
import { rateLimit } from "@/lib/core/rate-limit"
import { encrypt } from "@/lib/crypto"
import { customerAddresses, monthlyPlans } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { pincodeCentre, reverseGeocode } from "@/lib/restaurant/geocode"
import { MAX_SAVED_ADDRESSES, addressLine, encodeAddress, savedAddressSchema, type SavedAddress } from "@/lib/restaurant/saved-address"
import { savedAddressesFor } from "@/lib/restaurant/saved-address-data"
import { ORDER_INDUSTRIES } from "@/lib/verticals"

type Fail = { ok: false; error: string; field?: string }
type Saved = { ok: true; id: string; addresses: SavedAddress[] }

const signedOut: Fail = { ok: false, error: "Please sign in to use saved addresses." }
const isId = (v: unknown): v is string => z.string().uuid().safeParse(v).success

/** The signed-in customer of the shop this request is for. The shop comes from the host and the customer from their cookie. */
async function who() {
  const ctx = await tenantContext(ORDER_INDUSTRIES)
  const customer = ctx ? await currentCustomer(ctx.dealer.id) : null
  return ctx && customer ? { dealerId: ctx.dealer.id, customerId: customer.id } : null
}

/** Adds an address, or changes the one with `id`. Both only ever touch the signed-in customer's own rows. */
export async function saveDeliveryAddress(input: unknown, id: string | null = null): Promise<Saved | Fail> {
  const me = await who()
  if (!me) return signedOut
  if (id !== null && !isId(id)) return { ok: false, error: "That address no longer exists." }
  if (!(await rateLimit(`address:${me.customerId}`, 30, 10 * 60_000))) return { ok: false, error: "Too many tries. Please wait a moment." }

  const parsed = savedAddressSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") }
  }
  const a = parsed.data

  // Checked here so that an order to a saved address never has its pin dropped later for being in another pincode.
  const found = await reverseGeocode(a.lat, a.lng)
  const centre = found?.pincode === a.pincode ? null : await pincodeCentre(a.pincode)
  if (pinAgreement(found?.pincode || null, centre, a, a.pincode) === "mismatch")
    return { ok: false, error: "The pin is not in that pincode. Move the pin to your door, or correct the pincode.", field: "pincode" }

  const db = scopedDb(me.dealerId)
  const values = { label: a.label, addressEnc: encrypt(encodeAddress(a), me.dealerId), lat: a.lat, lng: a.lng, placeId: null }
  let savedId = id
  if (id) {
    const mine = and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, me.customerId))!
    const before = (await savedAddressesFor(me.dealerId, me.customerId)).find((x) => x.id === id) ?? null
    if ((await db.customerAddresses.count(mine)) === 0) return { ok: false, error: "That address no longer exists." }
    await db.customerAddresses.update(values, mine)
    // A monthly plan going to this address follows the change, so it never keeps delivering to the old one.
    if (before)
      await db.monthlyPlans.update(
        { address: addressLine(a), pincode: a.pincode, updatedAt: new Date() },
        and(eq(monthlyPlans.customerId, me.customerId), eq(monthlyPlans.address, before.line), eq(monthlyPlans.pincode, before.pincode))!,
      )
  } else {
    if ((await db.customerAddresses.count(eq(customerAddresses.customerId, me.customerId))) >= MAX_SAVED_ADDRESSES)
      return { ok: false, error: `You can keep ${MAX_SAVED_ADDRESSES} addresses. Delete one to add another.` }
    const [created] = await db.customerAddresses.insert({ customerId: me.customerId, ...values }).returning({ id: customerAddresses.id })
    savedId = created.id
  }
  return { ok: true, id: savedId!, addresses: await savedAddressesFor(me.dealerId, me.customerId) }
}

export async function deleteDeliveryAddress(id: string): Promise<{ ok: true; addresses: SavedAddress[] } | Fail> {
  const me = await who()
  if (!me) return signedOut
  if (!isId(id)) return { ok: false, error: "That address no longer exists." }
  await scopedDb(me.dealerId).customerAddresses.delete(and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, me.customerId))!)
  return { ok: true, addresses: await savedAddressesFor(me.dealerId, me.customerId) }
}

/** The signed-in customer's own saved addresses, for the location pop-up. */
export async function myDeliveryAddresses(): Promise<{ signedIn: false } | { signedIn: true; addresses: SavedAddress[] }> {
  const me = await who()
  return me ? { signedIn: true, addresses: await savedAddressesFor(me.dealerId, me.customerId) } : { signedIn: false }
}
