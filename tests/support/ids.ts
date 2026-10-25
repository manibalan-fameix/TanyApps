import { randomBytes } from "node:crypto"

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // no look-alikes (0/O, 1/I/L), like the real order and booking codes

/**
 * A random code for a fixture whose column is unique ACROSS THE WHOLE DATABASE (orders.code, cars.short_code). Fixtures in a test
 * database are not all cleaned up, and test files share it, so a code built from a short tag plus a counter eventually collides with a
 * leftover row and the test fails "sometimes". Six characters of this alphabet is about 887 million values.
 */
export function uniqueCode(length = 6): string {
  const bytes = randomBytes(length)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")
}
