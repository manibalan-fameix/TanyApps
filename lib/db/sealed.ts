import { blindIndex, normalizePhone } from "../crypto/blind-index.ts"
import { encrypt, tryDecrypt } from "../crypto/index.ts"

/**
 * Columns that hold a business's customers' personal details. They are stored encrypted under that business's own key.
 *
 * `scopedDb(dealerId)` seals them on the way in and opens them on the way out, so a business's own screens, its customers' pages
 * and its riders see plain text, while anything that reads the table WITHOUT a business scope (the platform's own admin queries)
 * only ever gets ciphertext. Add a column here and every scoped read and write of it follows.
 *
 * Rows written before this existed still hold plain text: they are returned as they are, and sealed by scripts/rekey-customer-data.ts.
 */
export const SEALED_COLUMNS: Record<string, readonly string[]> = {
  orders: ["customerName", "customerPhone", "address", "note"],
  enquiries: ["name", "phone", "message"],
  tableBookings: ["name", "phone", "note"],
  orderReturns: ["shopNote", "changeReason", "refundRef"],
  returnMessages: ["body"],
  returnMedia: ["storageKey"],
}

/** A keyed hash of a phone number, to find a guest's orders without decrypting. Every spelling of a number gives the same hash. */
export const phoneLookupHash = (phone: string) => blindIndex("phone", normalizePhone(phone) ?? phone.replace(/[\s-]/g, ""))

export const isSealed = (v: string) => v.startsWith("v1:") || v.startsWith("v2:")

/** The number as the restaurant should see it. Plain (not yet sealed) values come back as they are. */
export const openValue = (v: string, dealerId: string) => (isSealed(v) ? (tryDecrypt(v, dealerId) ?? "") : v)

/** Seals the sealed columns present in `values`. Empty and null values are left alone, and an already-sealed value is not sealed twice. */
export function sealValues<V extends Record<string, unknown>>(table: string, values: V, dealerId: string): V {
  const cols = SEALED_COLUMNS[table]
  if (!cols) return values
  const out: Record<string, unknown> = { ...values }
  for (const c of cols) {
    const v = out[c]
    if (typeof v !== "string" || v === "" || isSealed(v)) continue
    out[c] = encrypt(v.trim(), dealerId)
    if (table === "orders" && c === "customerPhone" && out.customerPhoneHash === undefined) out.customerPhoneHash = phoneLookupHash(v.trim())
  }
  return out as V
}

export function openRow<R extends Record<string, unknown>>(table: string, row: R, dealerId: string): R {
  const cols = SEALED_COLUMNS[table]
  if (!cols) return row
  const out: Record<string, unknown> = { ...row }
  for (const c of cols) if (typeof out[c] === "string") out[c] = openValue(out[c] as string, dealerId)
  return out as R
}
