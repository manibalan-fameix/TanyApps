import { randomToken } from "../core/login/sign"

// No 0/O, 1/I/L or other look-alikes: the code is read out over the phone.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

/** Six characters people can read aloud. NOT a secret and grants no access: it is only a label. */
export function newBookingCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  // Rejection sampling keeps every letter equally likely (256 is not a multiple of the alphabet size).
  const limit = 256 - (256 % ALPHABET.length)
  let out = ""
  while (out.length < 6) {
    for (const b of random(12)) {
      if (b < limit && out.length < 6) out += ALPHABET[b % ALPHABET.length]
    }
  }
  return out
}

export const BOOKING_CODE_RE = /^[A-Z0-9]{6}$/

/** Upper-cases and strips spaces and dashes, for a code typed by hand. Null when it cannot be a code. */
export function normalizeCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[\s-]/g, "")
  return BOOKING_CODE_RE.test(c) ? c : null
}

const sha256Hex = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("")

/** A fresh 128-bit tracking token and the hash that is stored. Only the hash is kept; the token goes to the person it is for. */
export async function newShareToken(): Promise<{ token: string; hash: string }> {
  const token = randomToken()
  return { token, hash: await sha256Hex(`trip-share:${token}`) }
}

export const hashShareToken = (token: string) => sha256Hex(`trip-share:${token}`)
