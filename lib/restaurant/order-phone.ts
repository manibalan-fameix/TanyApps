import { phoneLookupHash } from "../db/sealed"

/**
 * A guest's phone number on an order is sealed by scopedDb (lib/db/sealed.ts), with a keyed hash beside it. These helpers are for
 * finding and grouping guests by that hash without ever decrypting: the platform's own screens use them too.
 */
export const orderPhoneHash = phoneLookupHash

/** Which of a restaurant's orders are this guest's: the hash for sealed rows, or the plain number for rows not re-keyed yet. */
export const orderPhoneKey = (o: { customerPhone: string; customerPhoneHash: string | null }) => o.customerPhoneHash ?? o.customerPhone
